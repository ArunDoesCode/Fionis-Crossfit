import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import { type Db, db, type Tx } from "../db/client";
import { gymSettings, members } from "../db/schemas";
import type { IsoDate } from "../lib/domain/dates";
import type { MembershipStatus, Objective, Plan, Sex } from "../lib/enums";
import { AppError } from "../lib/errors";
import type { PartialUpdate } from "../lib/types";
import type { MemberListQuery } from "../types/members.types";
import {
  lastAssessedOn,
  latestPeriod,
  nameKey,
  onLatestPeriod,
  statusCondition,
} from "./membersSql";

/** A transaction handle, or the shared client for a plain read. */
type Executor = Db | Tx;

type MemberTableRow = typeof members.$inferSelect;
/** `sex` and `objective` are narrowed to their unions: the table's check constraints hold exactly these values. */
export type MemberRow = Omit<MemberTableRow, "sex" | "objective"> & {
  sex: Sex;
  objective: Objective | null;
};
export type NewMember = typeof members.$inferInsert;
/** Columns an update may set (`updatedAt` is refreshed by Drizzle). */
export type MemberChanges = PartialUpdate<
  Omit<NewMember, "id" | "createdAt" | "updatedAt">
>;

/** One E16 row: the member plus the latest period's plan and dates. */
export type MemberListRow = {
  id: string;
  fullName: string;
  phone: string;
  archivedAt: Date | null;
  plan: Plan;
  startOn: IsoDate;
  endOn: IsoDate;
  lastAssessedOn: IsoDate | null;
};

export type MemberListFilter = Pick<
  MemberListQuery,
  "status" | "sortBy" | "sortDir" | "page" | "pageSize"
> & {
  /** trimmed search text (2+ characters) */
  text: string | undefined;
  /** digits of the search text when it looks like (part of) a phone number */
  textDigits: string | undefined;
  /** last 10 digits of the cleaned `phone` filter */
  phoneLast10: string | undefined;
  today: IsoDate;
  leadDays: number;
};

/** Used only when the settings row does not exist yet; the same values as the table defaults. */
const DEFAULT_GYM_SETTINGS = { timezone: "Asia/Kolkata", expiryLeadDays: 14 };

/** A row the database must hold after our own write is missing: a bug, answered as a generic 500. */
const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

function narrow(row: MemberTableRow): MemberRow {
  return {
    ...row,
    sex: row.sex as Sex,
    objective: row.objective as Objective | null,
  };
}

/** `%` and `_` are plain characters in a search text; `\` is the LIKE escape. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, "\\$&");

/** Which members the `status` filter lets in (BR-REC-06, 52, 57). */
function scopeCondition(
  status: MemberListFilter["status"],
  today: IsoDate,
  leadDays: number,
): SQL | undefined {
  switch (status) {
    case undefined:
      return isNull(members.archivedAt);
    case "any":
      return undefined;
    case "archived":
      return isNotNull(members.archivedAt);
    default: {
      const membership: MembershipStatus = status;
      return and(
        isNull(members.archivedAt),
        statusCondition(membership, today, leadDays),
      );
    }
  }
}

function listWhere(filter: MemberListFilter): SQL | undefined {
  const contains = filter.text ? `%${escapeLike(filter.text)}%` : undefined;
  return and(
    scopeCondition(filter.status, filter.today, filter.leadDays),
    contains === undefined
      ? undefined
      : or(
          ilike(members.fullName, contains),
          ilike(members.email, contains),
          filter.textDigits === undefined
            ? undefined
            : ilike(members.phoneDigits, `%${filter.textDigits}%`),
        ),
    filter.phoneLast10 === undefined
      ? undefined
      : sql`right(${members.phoneDigits}, 10) = ${filter.phoneLast10}`,
  );
}

/**
 * BR-REC-56, 155. Name (default): with a search text, names starting with it come first;
 * `sortDir` reverses the name order inside each group. `joinedOn` / `lastAssessedOn`: that field in
 * `sortDir` (never-assessed last either way), ties by name. Last key is always the id.
 */
function listOrder(filter: MemberListFilter): SQL[] {
  const descending = filter.sortDir === "desc";
  if (filter.sortBy === "joinedOn") {
    return [
      descending ? desc(members.joinedOn) : asc(members.joinedOn),
      asc(nameKey),
      asc(members.id),
    ];
  }
  if (filter.sortBy === "lastAssessedOn") {
    return [
      descending
        ? sql`${lastAssessedOn} desc nulls last`
        : sql`${lastAssessedOn} asc nulls last`,
      asc(nameKey),
      asc(members.id),
    ];
  }
  const startsWith = filter.text
    ? [
        sql`case when ${nameKey} like lower(${`${escapeLike(filter.text)}%`}) then 0 else 1 end`,
      ]
    : [];
  return [
    ...startsWith,
    descending ? desc(nameKey) : asc(nameKey),
    asc(members.id),
  ];
}

export const membersRepository = {
  /** The one `gym_settings` row (time zone and expiry lead days), read on every request, never cached. */
  async readGymSettings(
    executor: Executor = db,
  ): Promise<{ timezone: string; expiryLeadDays: number }> {
    const [row] = await executor
      .select({
        timezone: gymSettings.timezone,
        expiryLeadDays: gymSettings.expiryLeadDays,
      })
      .from(gymSettings)
      .where(eq(gymSettings.id, 1));
    return row ?? DEFAULT_GYM_SETTINGS;
  },

  async findById(
    id: string,
    executor: Executor = db,
  ): Promise<MemberRow | undefined> {
    const [row] = await executor
      .select()
      .from(members)
      .where(eq(members.id, id));
    return row && narrow(row);
  },

  /**
   * Reads the member with a row lock held until the transaction ends: every write that
   * reads before it writes (E19-E23) queues here, so two renewals of one member never
   * check the same state (BR-REC-09).
   */
  async lockById(tx: Tx, id: string): Promise<MemberRow | undefined> {
    const [row] = await tx
      .select()
      .from(members)
      .where(eq(members.id, id))
      .for("update");
    return row && narrow(row);
  },

  async insert(tx: Tx, values: NewMember): Promise<MemberRow> {
    const [row] = await tx.insert(members).values(values).returning();
    if (!row) throw invariantBroken();
    return narrow(row);
  },

  async update(tx: Tx, id: string, changes: MemberChanges): Promise<MemberRow> {
    const [row] = await tx
      .update(members)
      .set(changes)
      .where(eq(members.id, id))
      .returning();
    if (!row) throw invariantBroken();
    return narrow(row);
  },

  /** E16: one page of rows and the total, in parallel (BR-REC-155). */
  async list(
    filter: MemberListFilter,
  ): Promise<{ rows: MemberListRow[]; total: number }> {
    const where = listWhere(filter);
    const [rows, totals] = await Promise.all([
      db
        .select({
          id: members.id,
          fullName: members.fullName,
          phone: members.phone,
          archivedAt: members.archivedAt,
          plan: latestPeriod.plan,
          startOn: latestPeriod.startOn,
          endOn: latestPeriod.endOn,
          lastAssessedOn,
        })
        .from(members)
        .innerJoin(latestPeriod, onLatestPeriod)
        .where(where)
        .orderBy(...listOrder(filter))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      db
        .select({ total: count() })
        .from(members)
        .innerJoin(latestPeriod, onLatestPeriod)
        .where(where),
    ]);
    return {
      rows: rows.map((row) => ({ ...row, plan: row.plan as Plan })),
      total: totals[0]?.total ?? 0,
    };
  },
};
