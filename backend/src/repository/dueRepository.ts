import { and, asc, eq, gte, sql } from "drizzle-orm";

import type { Db, Tx } from "../db/client";
import {
  assessments,
  assessmentTypes,
  dueOverrides,
  measurements,
  members,
  metrics,
} from "../db/schemas";
import type { IsoDate } from "../lib/domain/dates";
import type { DueOverrideKind, IntervalUnit } from "../lib/enums";
import { AppError } from "../lib/errors";
import { latestPeriod, onLatestPeriod } from "./membersSql";

// Due lists (due-list.md): the rows `computeDue` needs, read with a handful of queries (no N+1), and the
// `due_overrides` writes of E33 / E34. The rules are in `lib/domain/due.ts` and `service/dueService.ts`.

/** A transaction handle, or the shared client for a plain read. */
type Executor = Db | Tx;

/** A row our own write must return is missing: a bug, answered as a generic 500. */
const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

/** A member and the latest membership period by start (null = no membership at all). */
export type MemberDueRow = {
  id: string;
  fullName: string;
  joinedOn: IsoDate;
  archivedAt: Date | null;
  latestMembership: { startOn: IsoDate; endOn: IsoDate } | null;
};

/** One turned-on measurement of a turned-on assessment, with the assessment's fields. */
export type CatalogRow = {
  typeId: string;
  typeName: string;
  typeSortOrder: number;
  typeIntervalCount: number;
  typeIntervalUnit: IntervalUnit;
  metricId: string;
  metricName: string;
  metricSortOrder: number;
  metricIntervalCount: number | null;
  metricIntervalUnit: IntervalUnit | null;
};

/** The member's latest value day of one measurement. */
export type LastMeasuredRow = {
  memberId: string;
  metricId: string;
  measuredOn: IsoDate;
};

export type OverrideRow = {
  memberId: string;
  typeId: string;
  kind: DueOverrideKind;
  setOn: IsoDate;
  untilOn: IsoDate | null;
};

/** An override plus the latest day among the saves made since it was set (C6); null = no such save. */
export type OverrideWithSaveRow = OverrideRow & {
  latestAssessedOnSinceSet: IsoDate | null;
};

export type NewOverride = OverrideRow & { createdAt: Date };

/** The `due_overrides` columns every read and write of E31-E34 returns. */
const overrideColumns = {
  memberId: dueOverrides.memberId,
  typeId: dueOverrides.typeId,
  kind: dueOverrides.kind,
  setOn: dueOverrides.setOn,
  untilOn: dueOverrides.untilOn,
};

/** Narrows a read to one member and / or one assessment; `undefined` = not narrowed. */
type RowFilter = { memberId?: string | undefined; typeId?: string | undefined };

export const dueRepository = {
  /** Every member with the latest membership period (a member with none is kept: a left join). */
  async listMembers(executor: Executor): Promise<MemberDueRow[]> {
    const rows = await executor
      .select({
        id: members.id,
        fullName: members.fullName,
        joinedOn: members.joinedOn,
        archivedAt: members.archivedAt,
        startOn: latestPeriod.startOn,
        endOn: latestPeriod.endOn,
      })
      .from(members)
      .leftJoin(latestPeriod, onLatestPeriod);
    return rows.map(({ startOn, endOn, ...member }) => ({
      ...member,
      latestMembership:
        startOn !== null && endOn !== null ? { startOn, endOn } : null,
    }));
  },

  /**
   * The turned-on measurements of turned-on assessments in setup order, one row per measurement
   * (BR-REC-95). `typeId` narrows it to one assessment.
   */
  async listCatalog(
    executor: Executor,
    typeId: string | undefined,
  ): Promise<CatalogRow[]> {
    const rows = await executor
      .select({
        typeId: assessmentTypes.id,
        typeName: assessmentTypes.name,
        typeSortOrder: assessmentTypes.sortOrder,
        typeIntervalCount: assessmentTypes.intervalCount,
        typeIntervalUnit: assessmentTypes.intervalUnit,
        metricId: metrics.id,
        metricName: metrics.name,
        metricSortOrder: metrics.sortOrder,
        metricIntervalCount: metrics.intervalCount,
        metricIntervalUnit: metrics.intervalUnit,
      })
      .from(assessmentTypes)
      .innerJoin(metrics, eq(metrics.typeId, assessmentTypes.id))
      .where(
        and(
          eq(assessmentTypes.isActive, true),
          eq(metrics.isActive, true),
          typeId === undefined ? undefined : eq(assessmentTypes.id, typeId),
        ),
      )
      .orderBy(
        asc(assessmentTypes.sortOrder),
        asc(assessmentTypes.id),
        asc(metrics.sortOrder),
        asc(metrics.id),
      );
    return rows.map((row) => ({
      ...row,
      typeIntervalUnit: row.typeIntervalUnit as IntervalUnit,
      metricIntervalUnit: row.metricIntervalUnit as IntervalUnit | null,
    }));
  },

  /**
   * The latest value day per member and measurement (BR-REC-15), for turned-on measurements of
   * turned-on assessments only; `memberId` / `typeId` narrow it. One grouped read, served by
   * `measurements_member_metric_date_idx`.
   */
  async listLastMeasured(
    executor: Executor,
    filter: RowFilter,
  ): Promise<LastMeasuredRow[]> {
    return executor
      .select({
        memberId: measurements.memberId,
        metricId: measurements.metricId,
        measuredOn: sql<IsoDate>`max(${measurements.measuredOn})`,
      })
      .from(measurements)
      .innerJoin(metrics, eq(metrics.id, measurements.metricId))
      .innerJoin(assessmentTypes, eq(assessmentTypes.id, metrics.typeId))
      .where(
        and(
          eq(metrics.isActive, true),
          eq(assessmentTypes.isActive, true),
          filter.memberId === undefined
            ? undefined
            : eq(measurements.memberId, filter.memberId),
          filter.typeId === undefined
            ? undefined
            : eq(metrics.typeId, filter.typeId),
        ),
      )
      .groupBy(measurements.memberId, measurements.metricId);
  },

  /**
   * The `due_overrides` rows with, for each, the latest `assessed_on` among that member + assessment's
   * saves made since it was set (`assessments.updated_at` >= the override's `created_at`, C6).
   * A join + group by on the table key (every override column follows from it), so there is one query
   * and the unique (member, type, date) index serves the join.
   */
  async listOverrides(
    executor: Executor,
    filter: RowFilter,
  ): Promise<OverrideWithSaveRow[]> {
    const rows = await executor
      .select({
        ...overrideColumns,
        latestAssessedOnSinceSet: sql<IsoDate | null>`max(${assessments.assessedOn})`,
      })
      .from(dueOverrides)
      .leftJoin(
        assessments,
        and(
          eq(assessments.memberId, dueOverrides.memberId),
          eq(assessments.typeId, dueOverrides.typeId),
          gte(assessments.updatedAt, dueOverrides.createdAt),
        ),
      )
      .where(
        and(
          filter.memberId === undefined
            ? undefined
            : eq(dueOverrides.memberId, filter.memberId),
          filter.typeId === undefined
            ? undefined
            : eq(dueOverrides.typeId, filter.typeId),
        ),
      )
      .groupBy(dueOverrides.memberId, dueOverrides.typeId);
    return rows.map((row) => ({ ...row, kind: row.kind as DueOverrideKind }));
  },

  async typeExists(executor: Executor, typeId: string): Promise<boolean> {
    const [row] = await executor
      .select({ id: assessmentTypes.id })
      .from(assessmentTypes)
      .where(eq(assessmentTypes.id, typeId));
    return row !== undefined;
  },

  async findOverride(
    tx: Tx,
    memberId: string,
    typeId: string,
  ): Promise<OverrideRow | undefined> {
    const [row] = await tx
      .select(overrideColumns)
      .from(dueOverrides)
      .where(
        and(
          eq(dueOverrides.memberId, memberId),
          eq(dueOverrides.typeId, typeId),
        ),
      );
    return row && { ...row, kind: row.kind as DueOverrideKind };
  },

  /** One row per member + assessment: setting again replaces it, with a new `set_on` and `created_at` (C6). */
  async upsertOverride(tx: Tx, values: NewOverride): Promise<OverrideRow> {
    const [row] = await tx
      .insert(dueOverrides)
      .values(values)
      .onConflictDoUpdate({
        target: [dueOverrides.memberId, dueOverrides.typeId],
        set: {
          kind: values.kind,
          setOn: values.setOn,
          untilOn: values.untilOn,
          createdAt: values.createdAt,
        },
      })
      .returning(overrideColumns);
    if (!row) throw invariantBroken();
    return { ...row, kind: row.kind as DueOverrideKind };
  },

  /** The deleted row, or undefined when nothing was set. */
  async deleteOverride(
    tx: Tx,
    memberId: string,
    typeId: string,
  ): Promise<OverrideRow | undefined> {
    const [row] = await tx
      .delete(dueOverrides)
      .where(
        and(
          eq(dueOverrides.memberId, memberId),
          eq(dueOverrides.typeId, typeId),
        ),
      )
      .returning(overrideColumns);
    return row && { ...row, kind: row.kind as DueOverrideKind };
  },
};
