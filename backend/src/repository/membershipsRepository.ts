import { and, asc, count, desc, eq, gte, isNull, type SQL } from "drizzle-orm";

import { type Db, db, type Tx } from "../db/client";
import { members, membershipPeriods } from "../db/schemas";
import type { IsoDate } from "../lib/domain/dates";
import type { Plan } from "../lib/enums";
import { AppError } from "../lib/errors";
import type { EndingStatus } from "../types/members.types";
import {
  latestPeriod,
  nameKey,
  onLatestPeriod,
  statusCondition,
} from "./membersSql";

/** A transaction handle, or the shared client for a plain read. */
type Executor = Db | Tx;

/** One membership period; `plan` is narrowed to its union (the table's check constraint). */
export type PeriodRow = {
  id: string;
  plan: Plan;
  startOn: IsoDate;
  endOn: IsoDate;
};

export type PeriodChanges = { plan: Plan; startOn: IsoDate; endOn: IsoDate };

/** One E24 row: the member and the latest period. */
export type EndingRow = {
  memberId: string;
  fullName: string;
  phone: string;
  plan: Plan;
  startOn: IsoDate;
  endOn: IsoDate;
};

export type EndingFilter = {
  status: EndingStatus;
  today: IsoDate;
  leadDays: number;
  /** `expired` lists periods that ended on or after this day */
  endedSince: IsoDate;
  page: number;
  pageSize: number;
};

const periodColumns = {
  id: membershipPeriods.id,
  plan: membershipPeriods.plan,
  startOn: membershipPeriods.startOn,
  endOn: membershipPeriods.endOn,
};

/** A row the database must hold after our own write is missing: a bug, answered as a generic 500. */
const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

/** `plan` is one of the four values: `membership_periods_plan_check`. */
const narrow = (row: {
  id: string;
  plan: string;
  startOn: IsoDate;
  endOn: IsoDate;
}): PeriodRow => ({ ...row, plan: row.plan as Plan });

/** Which latest periods E24 lists: Ends soon, or ended inside the recent window (BR-REC-53). */
function endingWhere(filter: EndingFilter): SQL | undefined {
  const periodCondition =
    filter.status === "expiring"
      ? statusCondition("expiring", filter.today, filter.leadDays)
      : and(
          statusCondition("expired", filter.today, filter.leadDays),
          gte(latestPeriod.endOn, filter.endedSince),
        );
  return and(isNull(members.archivedAt), periodCondition);
}

export const membershipsRepository = {
  /** Every period of the member, newest first (start descending; a tie by id keeps the order stable). */
  async listForMember(
    executor: Executor,
    memberId: string,
  ): Promise<PeriodRow[]> {
    const rows = await executor
      .select(periodColumns)
      .from(membershipPeriods)
      .where(eq(membershipPeriods.memberId, memberId))
      .orderBy(desc(membershipPeriods.startOn), desc(membershipPeriods.id));
    return rows.map(narrow);
  },

  /** The period, only when it belongs to `memberId`. */
  async findOfMember(
    tx: Tx,
    memberId: string,
    periodId: string,
  ): Promise<PeriodRow | undefined> {
    const [row] = await tx
      .select(periodColumns)
      .from(membershipPeriods)
      .where(
        and(
          eq(membershipPeriods.id, periodId),
          eq(membershipPeriods.memberId, memberId),
        ),
      );
    return row && narrow(row);
  },

  async insert(
    tx: Tx,
    values: PeriodChanges & { memberId: string },
  ): Promise<PeriodRow> {
    const [row] = await tx
      .insert(membershipPeriods)
      .values(values)
      .returning(periodColumns);
    if (!row) throw invariantBroken();
    return narrow(row);
  },

  async update(tx: Tx, id: string, changes: PeriodChanges): Promise<PeriodRow> {
    const [row] = await tx
      .update(membershipPeriods)
      .set(changes)
      .where(eq(membershipPeriods.id, id))
      .returning(periodColumns);
    if (!row) throw invariantBroken();
    return narrow(row);
  },

  /**
   * E24: one row per non-archived member, from the latest period. `expiring`: soonest end
   * first; `expired`: most recent end first; then name, then id. Rows and total in parallel.
   */
  async listEnding(
    filter: EndingFilter,
  ): Promise<{ rows: EndingRow[]; total: number }> {
    const where = endingWhere(filter);
    const [rows, totals] = await Promise.all([
      db
        .select({
          memberId: members.id,
          fullName: members.fullName,
          phone: members.phone,
          plan: latestPeriod.plan,
          startOn: latestPeriod.startOn,
          endOn: latestPeriod.endOn,
        })
        .from(members)
        .innerJoin(latestPeriod, onLatestPeriod)
        .where(where)
        .orderBy(
          filter.status === "expiring"
            ? asc(latestPeriod.endOn)
            : desc(latestPeriod.endOn),
          asc(nameKey),
          asc(members.id),
        )
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
