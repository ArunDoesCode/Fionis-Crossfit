import { and, asc, count, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";

import { type Db, db, type Tx } from "../db/client";
import {
  assessments,
  assessmentTypes,
  gymSettings,
  measurements,
  members,
  metrics,
} from "../db/schemas";
import type { IsoDate } from "../lib/domain/dates";
import type { BetterDirection, Datatype, TablePart } from "../lib/enums";
import { AppError } from "../lib/errors";
import type { PartialUpdate } from "../lib/types";
import type { SortDirection } from "../types/common.types";

// Assessments and measurements (assessments.md). Queries only: the rules are in
// `service/assessmentsRules.ts` and `service/assessmentsService.ts`. Every write takes the
// caller's transaction.

/** A transaction handle, or the shared client for a plain read. */
type Executor = Db | Tx;

/** Used only when the settings row does not exist yet; the same value as the table default. */
const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** A row our own write must return is missing: a bug, answered as a generic 500. */
const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

export type MemberFacts = { id: string; fullName: string; joinedOn: IsoDate };
export type TypeFacts = { id: string; name: string; isActive: boolean };

/** A measurement as the forms need it; `datatype` and `better` narrowed (the table's check constraints hold exactly these values). */
export type MetricFacts = {
  id: string;
  name: string;
  unit: string;
  datatype: Datatype;
  decimals: number;
  better: BetterDirection;
  plausibleMin: number | null;
  plausibleMax: number | null;
  tableGroup: string | null;
  tablePart: TablePart | null;
  isActive: boolean;
};

/** An assessment with its assessment's name (E28-E30). */
export type AssessmentFacts = {
  id: string;
  memberId: string;
  typeId: string;
  typeName: string;
  date: IsoDate;
  isEstimated: boolean;
};

/** The assessment of one member + type + date with every stored value, by measurement id. */
export type StoredAssessment = {
  id: string;
  isEstimated: boolean;
  values: Record<string, number>;
};

export type PreviousValue = {
  metricId: string;
  value: number;
  on: IsoDate;
  isEstimated: boolean;
};

/** One stored value with what E28 shows beside it. */
export type StoredValue = {
  metricId: string;
  name: string;
  unit: string;
  datatype: Datatype;
  value: number;
};

export type ListRow = {
  id: string;
  typeId: string;
  typeName: string;
  date: IsoDate;
  isEstimated: boolean;
  valueCount: number;
};

export type NewAssessment = {
  memberId: string;
  typeId: string;
  assessedOn: IsoDate;
  isEstimated: boolean;
};
export type AssessmentChanges = PartialUpdate<
  Pick<typeof assessments.$inferInsert, "assessedOn" | "isEstimated">
>;

/** The assessment a value belongs to: its id, member and date, copied onto every value (BR-REC-166). */
export type ValueOwner = {
  assessmentId: string;
  memberId: string;
  date: IsoDate;
};

export const assessmentsRepository = {
  /** The gym's time zone (D1), read on every request, never cached. */
  async readTimezone(executor: Executor = db): Promise<string> {
    const [row] = await executor
      .select({ timezone: gymSettings.timezone })
      .from(gymSettings)
      .where(eq(gymSettings.id, 1));
    return row?.timezone ?? DEFAULT_TIMEZONE;
  },

  async findMember(
    executor: Executor,
    id: string,
  ): Promise<MemberFacts | undefined> {
    const [row] = await executor
      .select({
        id: members.id,
        fullName: members.fullName,
        joinedOn: members.joinedOn,
      })
      .from(members)
      .where(eq(members.id, id));
    return row;
  },

  /**
   * Reads the member with a row lock held until the transaction ends: every write of E26, E29 and E30
   * takes it first, so racing saves of one member + type + date end as one row (D6).
   */
  async lockMember(tx: Tx, id: string): Promise<MemberFacts | undefined> {
    const [row] = await tx
      .select({
        id: members.id,
        fullName: members.fullName,
        joinedOn: members.joinedOn,
      })
      .from(members)
      .where(eq(members.id, id))
      .for("update");
    return row;
  },

  async findType(
    executor: Executor,
    id: string,
  ): Promise<TypeFacts | undefined> {
    const [row] = await executor
      .select({
        id: assessmentTypes.id,
        name: assessmentTypes.name,
        isActive: assessmentTypes.isActive,
      })
      .from(assessmentTypes)
      .where(eq(assessmentTypes.id, id));
    return row;
  },

  /** Every measurement of the assessment, on and off, in setup order (`sort_order`, then id; D20). */
  async listMetrics(
    executor: Executor,
    typeId: string,
  ): Promise<MetricFacts[]> {
    const rows = await executor
      .select({
        id: metrics.id,
        name: metrics.name,
        unit: metrics.unit,
        datatype: metrics.datatype,
        decimals: metrics.decimals,
        better: metrics.better,
        plausibleMin: metrics.plausibleMin,
        plausibleMax: metrics.plausibleMax,
        tableGroup: metrics.tableGroup,
        tablePart: metrics.tablePart,
        isActive: metrics.isActive,
      })
      .from(metrics)
      .where(eq(metrics.typeId, typeId))
      .orderBy(asc(metrics.sortOrder), asc(metrics.id));
    return rows.map((row) => ({
      ...row,
      datatype: row.datatype as Datatype,
      better: row.better as BetterDirection,
      tablePart: row.tablePart as TablePart | null,
    }));
  },

  /** The assessment of this member + type on exactly `date`, with all its values; none when there is no such assessment. */
  async findStored(
    executor: Executor,
    memberId: string,
    typeId: string,
    date: IsoDate,
  ): Promise<StoredAssessment | undefined> {
    const rows = await executor
      .select({
        id: assessments.id,
        isEstimated: assessments.isEstimated,
        metricId: measurements.metricId,
        value: measurements.value,
      })
      .from(assessments)
      .leftJoin(measurements, eq(measurements.assessmentId, assessments.id))
      .where(
        and(
          eq(assessments.memberId, memberId),
          eq(assessments.typeId, typeId),
          eq(assessments.assessedOn, date),
        ),
      );
    const first = rows[0];
    if (!first) return undefined;
    const values: Record<string, number> = {};
    for (const row of rows) {
      if (row.metricId !== null && row.value !== null) {
        values[row.metricId] = row.value;
      }
    }
    return { id: first.id, isEstimated: first.isEstimated, values };
  },

  /**
   * For each measurement of the assessment, the member's stored value with the latest date strictly
   * before `date`, from any of the member's assessments, and that assessment's estimated flag
   * (BR-REC-81, D5). One row per measurement that has one.
   */
  async previousValues(
    executor: Executor,
    memberId: string,
    typeId: string,
    date: IsoDate,
  ): Promise<PreviousValue[]> {
    return executor
      .selectDistinctOn([measurements.metricId], {
        metricId: measurements.metricId,
        value: measurements.value,
        on: measurements.measuredOn,
        isEstimated: assessments.isEstimated,
      })
      .from(measurements)
      .innerJoin(assessments, eq(assessments.id, measurements.assessmentId))
      .innerJoin(metrics, eq(metrics.id, measurements.metricId))
      .where(
        and(
          eq(measurements.memberId, memberId),
          eq(metrics.typeId, typeId),
          lt(measurements.measuredOn, date),
        ),
      )
      .orderBy(asc(measurements.metricId), desc(measurements.measuredOn));
  },

  /** The owner of an assessment, so E29 and E30 can lock the member before they read the assessment. */
  async memberIdOf(
    executor: Executor,
    assessmentId: string,
  ): Promise<string | undefined> {
    const [row] = await executor
      .select({ memberId: assessments.memberId })
      .from(assessments)
      .where(eq(assessments.id, assessmentId));
    return row?.memberId;
  },

  async findAssessment(
    executor: Executor,
    id: string,
  ): Promise<AssessmentFacts | undefined> {
    const [row] = await executor
      .select({
        id: assessments.id,
        memberId: assessments.memberId,
        typeId: assessments.typeId,
        typeName: assessmentTypes.name,
        date: assessments.assessedOn,
        isEstimated: assessments.isEstimated,
      })
      .from(assessments)
      .innerJoin(assessmentTypes, eq(assessmentTypes.id, assessments.typeId))
      .where(eq(assessments.id, id));
    return row;
  },

  /** Every stored value of an assessment, on or off measurements, in setup order (D9). */
  async listValues(
    executor: Executor,
    assessmentId: string,
  ): Promise<StoredValue[]> {
    const rows = await executor
      .select({
        metricId: measurements.metricId,
        name: metrics.name,
        unit: metrics.unit,
        datatype: metrics.datatype,
        value: measurements.value,
      })
      .from(measurements)
      .innerJoin(metrics, eq(metrics.id, measurements.metricId))
      .where(eq(measurements.assessmentId, assessmentId))
      .orderBy(asc(metrics.sortOrder), asc(metrics.id));
    return rows.map((row) => ({ ...row, datatype: row.datatype as Datatype }));
  },

  /** Another assessment of this member + type already holds `date` (E29, BR-REC-87). */
  async dateTaken(
    executor: Executor,
    memberId: string,
    typeId: string,
    date: IsoDate,
    exceptId: string,
  ): Promise<boolean> {
    const [row] = await executor
      .select({ id: assessments.id })
      .from(assessments)
      .where(
        and(
          eq(assessments.memberId, memberId),
          eq(assessments.typeId, typeId),
          eq(assessments.assessedOn, date),
          ne(assessments.id, exceptId),
        ),
      )
      .limit(1);
    return row !== undefined;
  },

  /** E27: one page of a member's assessments and the total after the filter, in parallel (BR-REC-155). */
  async listAssessments(
    executor: Executor,
    filter: {
      memberId: string;
      typeId: string | undefined;
      sortDir: SortDirection;
      limit: number;
      offset: number;
    },
  ): Promise<{ rows: ListRow[]; total: number }> {
    const where = and(
      eq(assessments.memberId, filter.memberId),
      filter.typeId === undefined
        ? undefined
        : eq(assessments.typeId, filter.typeId),
    );
    const byDate =
      filter.sortDir === "asc"
        ? asc(assessments.assessedOn)
        : desc(assessments.assessedOn);
    // A sub-select (evaluated for the page's rows only): `valueCount` = stored values (D10).
    const valueCount =
      sql<number>`(select count(*)::int from ${measurements} where ${measurements.assessmentId} = ${assessments.id})`.mapWith(
        Number,
      );
    const [rows, totals] = await Promise.all([
      executor
        .select({
          id: assessments.id,
          typeId: assessments.typeId,
          typeName: assessmentTypes.name,
          date: assessments.assessedOn,
          isEstimated: assessments.isEstimated,
          valueCount,
        })
        .from(assessments)
        .innerJoin(assessmentTypes, eq(assessmentTypes.id, assessments.typeId))
        .where(where)
        .orderBy(byDate, asc(assessments.id))
        .limit(filter.limit)
        .offset(filter.offset),
      executor.select({ total: count() }).from(assessments).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },

  async insertAssessment(
    tx: Tx,
    values: NewAssessment,
  ): Promise<{ id: string }> {
    const [row] = await tx
      .insert(assessments)
      .values(values)
      .returning({ id: assessments.id });
    if (!row) throw invariantBroken();
    return row;
  },

  async updateAssessment(
    tx: Tx,
    id: string,
    changes: AssessmentChanges,
  ): Promise<void> {
    await tx.update(assessments).set(changes).where(eq(assessments.id, id));
  },

  /** Sets or overwrites values; each copies the assessment's member and date (BR-REC-166). */
  async upsertValues(
    tx: Tx,
    owner: ValueOwner,
    values: readonly { metricId: string; value: number }[],
  ): Promise<void> {
    if (values.length === 0) return;
    await tx
      .insert(measurements)
      .values(
        values.map(({ metricId, value }) => ({
          assessmentId: owner.assessmentId,
          metricId,
          memberId: owner.memberId,
          measuredOn: owner.date,
          value,
        })),
      )
      .onConflictDoUpdate({
        target: [measurements.assessmentId, measurements.metricId],
        set: {
          value: sql`excluded.value`,
          measuredOn: sql`excluded.measured_on`,
          updatedAt: new Date(),
        },
      });
  },

  async deleteValues(
    tx: Tx,
    assessmentId: string,
    metricIds: readonly string[],
  ): Promise<void> {
    if (metricIds.length === 0) return;
    await tx
      .delete(measurements)
      .where(
        and(
          eq(measurements.assessmentId, assessmentId),
          inArray(measurements.metricId, [...metricIds]),
        ),
      );
  },

  /** E29: every value takes the assessment's new date (BR-REC-166, D8). */
  async moveValues(tx: Tx, assessmentId: string, date: IsoDate): Promise<void> {
    await tx
      .update(measurements)
      .set({ measuredOn: date })
      .where(eq(measurements.assessmentId, assessmentId));
  },

  /** E30: the one hard delete (BR-REC-165); the foreign key takes the values with it. */
  async deleteAssessment(tx: Tx, id: string): Promise<void> {
    await tx.delete(assessments).where(eq(assessments.id, id));
  },
};
