import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  SQL,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import {
  assessments,
  assessmentTypes,
  gymSettings,
  measurements,
  members,
  membershipPeriods,
  metrics,
} from "../db/schemas";
import type { IsoDate } from "../lib/domain/dates";
import type {
  BetterDirection,
  Datatype,
  Plan,
  Sex,
  TablePart,
} from "../lib/enums";
import { latestPeriod, nameKey, onLatestPeriod } from "./membersSql";

// Reads for the progress module (E35-E39). Queries only: the rules (what counts, how it is
// ranked, how a CSV cell is written) are in `service/progressService.ts` and the pure functions.
// Nothing here writes. Every number is read from the database on every call (no cache, BR-REC-110).

// ─── settings ───────────────────────────────────────────────────────────────

export type GymSettings = {
  gymName: string;
  timezone: string;
  expiryLeadDays: number;
};

/** A column's default as declared in the schema, the one place the settings defaults live. */
function declaredDefault<T>(column: {
  name: string;
  default: T | SQL | undefined;
}): T {
  const value = column.default;
  if (value === undefined || value instanceof SQL) {
    throw new Error(`gym_settings.${column.name} needs a plain default value`);
  }
  return value;
}

/** What a database without the settings row answers: the column defaults. */
const SETTINGS_DEFAULTS: GymSettings = {
  gymName: declaredDefault(gymSettings.gymName),
  timezone: declaredDefault(gymSettings.timezone),
  expiryLeadDays: declaredDefault(gymSettings.expiryLeadDays),
};

// ─── row types ──────────────────────────────────────────────────────────────

export type CatalogRow = {
  typeId: string;
  typeName: string;
  typeSortOrder: number;
  metricId: string;
  name: string;
  unit: string;
  datatype: Datatype;
  decimals: 0 | 1 | 2;
  better: BetterDirection;
  sortOrder: number;
  isActive: boolean;
  tableGroup: string | null;
  tablePart: TablePart | null;
};

export type ReadingSummaryFilter = {
  metricId: string;
  /** inclusive first day of the first join month */
  joinedOnOrAfter: IsoDate | undefined;
  /** exclusive: the first day of the month after the last join month */
  joinedBefore: IsoDate | undefined;
  plan: Plan | undefined;
  sex: Sex | undefined;
  /** born on or before / after these days (an age band on the gym's today) */
  bornOnOrBefore: IsoDate | null;
  bornAfter: IsoDate | null;
};

/** The sort key of a member in every export: lower-cased name, then id. */
export type MemberKey = { nameKey: string; id: string };

// ─── SQL pieces ─────────────────────────────────────────────────────────────

const nameKeyText = sql<string>`${nameKey}`;
const isArchived = sql<boolean>`(${members.archivedAt} is not null)`;

/** Members after `after` in the export order (name key, then id): a keyset page, no OFFSET. */
const afterMember = (after: MemberKey | undefined): SQL | undefined =>
  after === undefined
    ? undefined
    : sql`(${nameKey}, ${members.id}) > (${after.nameKey}::text collate "C", ${after.id}::uuid)`;

/** `first` and `latest` value of a member's readings of one measurement, by reading date. */
const firstValue = sql<number>`(array_agg(${measurements.value} order by ${measurements.measuredOn} asc))[1]`;
const latestValue = sql<number>`(array_agg(${measurements.value} order by ${measurements.measuredOn} desc))[1]`;

export const progressRepository = {
  /** The one `gym_settings` row, read on every request; a database without it answers the schema defaults. */
  async readGymSettings(): Promise<GymSettings> {
    const [row] = await db
      .select({
        gymName: gymSettings.gymName,
        timezone: gymSettings.timezone,
        expiryLeadDays: gymSettings.expiryLeadDays,
      })
      .from(gymSettings)
      .where(eq(gymSettings.id, 1));
    return row ?? SETTINGS_DEFAULTS;
  },

  // ─── E35 report card: three reads ─────────────────────────────────────────

  /** The member (archived too) and its latest period by start. */
  async findMemberHead(memberId: string) {
    const [row] = await db
      .select({
        id: members.id,
        fullName: members.fullName,
        dateOfBirth: members.dateOfBirth,
        sex: members.sex,
        joinedOn: members.joinedOn,
        plan: latestPeriod.plan,
        startOn: latestPeriod.startOn,
        endOn: latestPeriod.endOn,
      })
      .from(members)
      .leftJoin(latestPeriod, onLatestPeriod)
      .where(eq(members.id, memberId));
    return (
      row && { ...row, sex: row.sex as Sex, plan: row.plan as Plan | null }
    );
  },

  /** Every measurement of every assessment, on and off, with its assessment, in setup order. */
  async listCatalog(): Promise<CatalogRow[]> {
    const rows = await db
      .select({
        typeId: assessmentTypes.id,
        typeName: assessmentTypes.name,
        typeSortOrder: assessmentTypes.sortOrder,
        metricId: metrics.id,
        name: metrics.name,
        unit: metrics.unit,
        datatype: metrics.datatype,
        decimals: metrics.decimals,
        better: metrics.better,
        sortOrder: metrics.sortOrder,
        isActive: metrics.isActive,
        tableGroup: metrics.tableGroup,
        tablePart: metrics.tablePart,
      })
      .from(metrics)
      .innerJoin(assessmentTypes, eq(assessmentTypes.id, metrics.typeId))
      .orderBy(
        asc(assessmentTypes.sortOrder),
        asc(assessmentTypes.id),
        asc(metrics.sortOrder),
        asc(metrics.id),
      );
    return rows.map((row) => ({
      ...row,
      datatype: row.datatype as Datatype,
      decimals: row.decimals as 0 | 1 | 2,
      better: row.better as BetterDirection,
      tablePart: row.tablePart as TablePart | null,
    }));
  },

  /** All of one member's stored values, each with its assessment's day and "estimated" flag. */
  async listMemberValues(memberId: string) {
    return db
      .select({
        assessmentId: measurements.assessmentId,
        typeId: assessments.typeId,
        metricId: measurements.metricId,
        on: assessments.assessedOn,
        isEstimated: assessments.isEstimated,
        value: measurements.value,
      })
      .from(measurements)
      .innerJoin(assessments, eq(assessments.id, measurements.assessmentId))
      .where(eq(measurements.memberId, memberId));
  },

  // ─── E36 / E37 ────────────────────────────────────────────────────────────

  /** One measurement, on or off. */
  async findMetric(metricId: string) {
    const [row] = await db
      .select({
        id: metrics.id,
        name: metrics.name,
        unit: metrics.unit,
        datatype: metrics.datatype,
        decimals: metrics.decimals,
        better: metrics.better,
      })
      .from(metrics)
      .where(eq(metrics.id, metricId));
    return (
      row && {
        ...row,
        datatype: row.datatype as Datatype,
        decimals: row.decimals as 0 | 1 | 2,
        better: row.better as BetterDirection,
      }
    );
  },

  /**
   * E36: per non-archived member who matches the filters and has at least one reading of the
   * measurement: how many readings, the first and the latest value. One pass over the measurement's
   * rows (`measurements_metric_date_idx`) grouped by member, then one row per member joins `members`.
   */
  async readingSummaries(filter: ReadingSummaryFilter) {
    const perMember = db
      .select({
        memberId: measurements.memberId,
        readings: count().as("readings"),
        first: firstValue.mapWith(Number).as("first_value"),
        latest: latestValue.mapWith(Number).as("latest_value"),
      })
      .from(measurements)
      .where(eq(measurements.metricId, filter.metricId))
      .groupBy(measurements.memberId)
      .as("per_member");

    return db
      .select({
        count: perMember.readings,
        first: perMember.first,
        latest: perMember.latest,
      })
      .from(perMember)
      .innerJoin(members, eq(members.id, perMember.memberId))
      .leftJoin(latestPeriod, onLatestPeriod)
      .where(
        and(
          isNull(members.archivedAt),
          filter.joinedOnOrAfter === undefined
            ? undefined
            : gte(members.joinedOn, filter.joinedOnOrAfter),
          filter.joinedBefore === undefined
            ? undefined
            : lt(members.joinedOn, filter.joinedBefore),
          filter.plan === undefined
            ? undefined
            : eq(latestPeriod.plan, filter.plan),
          filter.sex === undefined ? undefined : eq(members.sex, filter.sex),
          filter.bornOnOrBefore === null
            ? undefined
            : lte(members.dateOfBirth, filter.bornOnOrBefore),
          filter.bornAfter === null
            ? undefined
            : gt(members.dateOfBirth, filter.bornAfter),
        ),
      );
  },

  /**
   * E37: each non-archived member of `sex` with at least one reading, and the member's latest
   * reading (`distinct on`, newest day first per member).
   */
  async latestReadings(metricId: string, sex: Sex) {
    return db
      .selectDistinctOn([measurements.memberId], {
        memberId: measurements.memberId,
        fullName: members.fullName,
        value: measurements.value,
        on: measurements.measuredOn,
      })
      .from(measurements)
      .innerJoin(members, eq(members.id, measurements.memberId))
      .where(
        and(
          eq(measurements.metricId, metricId),
          eq(members.sex, sex),
          isNull(members.archivedAt),
        ),
      )
      .orderBy(asc(measurements.memberId), desc(measurements.measuredOn));
  },

  // ─── E38 ──────────────────────────────────────────────────────────────────

  /** The latest period of every non-archived member (one row each). */
  async listLatestPeriods() {
    const rows = await db
      .select({
        plan: latestPeriod.plan,
        startOn: latestPeriod.startOn,
        endOn: latestPeriod.endOn,
      })
      .from(members)
      .innerJoin(latestPeriod, onLatestPeriod)
      .where(isNull(members.archivedAt));
    return rows.map((row) => ({ ...row, plan: row.plan as Plan }));
  },

  // ─── E39: keyset pages over the members, in export order ─────────────────

  /** Members with their latest period, `limit` after `after` (members.csv). */
  async exportMemberPage(after: MemberKey | undefined, limit: number) {
    return db
      .select({
        id: members.id,
        nameKey: nameKeyText,
        fullName: members.fullName,
        phone: members.phone,
        email: members.email,
        dateOfBirth: members.dateOfBirth,
        sex: members.sex,
        joinedOn: members.joinedOn,
        objective: members.objective,
        notes: members.notes,
        archived: isArchived,
        plan: latestPeriod.plan,
        startOn: latestPeriod.startOn,
        endOn: latestPeriod.endOn,
      })
      .from(members)
      .leftJoin(latestPeriod, onLatestPeriod)
      .where(afterMember(after))
      .orderBy(asc(nameKey), asc(members.id))
      .limit(limit);
  },

  /** Name and archived flag only, `limit` after `after` (the other two files read their rows per page of members). */
  async exportMemberKeyPage(after: MemberKey | undefined, limit: number) {
    return db
      .select({
        id: members.id,
        nameKey: nameKeyText,
        fullName: members.fullName,
        archived: isArchived,
      })
      .from(members)
      .where(afterMember(after))
      .orderBy(asc(nameKey), asc(members.id))
      .limit(limit);
  },

  /** memberships.csv: the periods of these members, oldest first within a member. */
  async exportPeriods(memberIds: string[]) {
    return db
      .select({
        memberId: membershipPeriods.memberId,
        plan: membershipPeriods.plan,
        startOn: membershipPeriods.startOn,
        endOn: membershipPeriods.endOn,
      })
      .from(membershipPeriods)
      .where(inArray(membershipPeriods.memberId, memberIds))
      .orderBy(
        asc(membershipPeriods.memberId),
        asc(membershipPeriods.startOn),
        asc(membershipPeriods.id),
      );
  },

  /**
   * measurements.csv: every stored value of these members, on and off measurements alike, by date,
   * the assessment's setup order, then the measurement's (`measurements_member_metric_date_idx`).
   */
  async exportValues(memberIds: string[]) {
    const rows = await db
      .select({
        memberId: measurements.memberId,
        assessment: assessmentTypes.name,
        measurement: metrics.name,
        unit: metrics.unit,
        datatype: metrics.datatype,
        decimals: metrics.decimals,
        on: assessments.assessedOn,
        isEstimated: assessments.isEstimated,
        value: measurements.value,
      })
      .from(measurements)
      .innerJoin(assessments, eq(assessments.id, measurements.assessmentId))
      .innerJoin(assessmentTypes, eq(assessmentTypes.id, assessments.typeId))
      .innerJoin(metrics, eq(metrics.id, measurements.metricId))
      .where(inArray(measurements.memberId, memberIds))
      .orderBy(
        asc(measurements.memberId),
        asc(assessments.assessedOn),
        asc(assessmentTypes.sortOrder),
        asc(assessmentTypes.id),
        asc(metrics.sortOrder),
        asc(metrics.id),
      );
    return rows.map((row) => ({
      ...row,
      datatype: row.datatype as Datatype,
      decimals: row.decimals as 0 | 1 | 2,
    }));
  },
};
