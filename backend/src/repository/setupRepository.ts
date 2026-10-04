import {
  and,
  asc,
  count,
  eq,
  exists,
  getTableColumns,
  inArray,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { type Db, db, type Tx } from "../db/client";
import {
  assessmentTypes,
  gymSettings,
  measurements,
  metrics,
} from "../db/schemas";
import { AppError, BadRequestError, ConflictError } from "../lib/errors";
import type { PartialUpdate } from "../lib/types";

// Catalog and settings tables (setup.md). Queries only: the rules (what may change, what is
// refused) are in `service/setupService.ts`. Every write takes the caller's transaction.

/** A transaction handle, or the shared client for a plain read. */
type Executor = Db | Tx;

export type SettingsRow = typeof gymSettings.$inferSelect;
export type NewType = typeof assessmentTypes.$inferInsert;
export type NewMetric = typeof metrics.$inferInsert;
export type StoredType = typeof assessmentTypes.$inferSelect;
export type StoredMetric = typeof metrics.$inferSelect;
/** `hasValues` (C6): at least one stored value, for an assessment in any of its measurements. */
export type TypeRow = StoredType & { hasValues: boolean };
export type MetricRow = StoredMetric & { hasValues: boolean };

// ─── errors raised by the database ──────────────────────────────────────────

const NAME_CONSTRAINTS: ReadonlySet<string> = new Set([
  "assessment_types_name_lower_key",
  "metrics_type_name_lower_key",
]);
const RANGE_CONSTRAINT = "metrics_plausible_range_check";

/** Postgres error code and constraint name; Drizzle wraps the driver's error as `cause`. */
function databaseError(
  error: unknown,
): { code: string; constraint: string } | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth += 1) {
    const { code, constraint_name: constraint } = current as Error & {
      code?: unknown;
      constraint_name?: unknown;
    };
    if (typeof code === "string") {
      return {
        code,
        constraint: typeof constraint === "string" ? constraint : "",
      };
    }
    current = current.cause;
  }
  return undefined;
}

/**
 * Two writes racing on one name: the loser hits the unique index and is a 409, not a 500 (C11).
 * Two check-range values that become equal once the database keeps 3 decimals are a 400.
 */
function translateWriteError(error: unknown): unknown {
  const found = databaseError(error);
  if (found?.code === "23505" && NAME_CONSTRAINTS.has(found.constraint)) {
    return nameTaken();
  }
  if (found?.code === "23514" && found.constraint === RANGE_CONSTRAINT) {
    return new BadRequestError("Validation failed", "VALIDATION_ERROR", {
      issues: [
        { path: "plausibleMin", message: "Below must be smaller than above" },
      ],
    });
  }
  return error;
}

async function guarded<T>(write: () => PromiseLike<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    throw translateWriteError(error);
  }
}

export const nameTaken = () =>
  new ConflictError("That name is already used", "NAME_TAKEN");

/** A row our own write must return is missing: a bug, answered as a generic 500. */
const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

// ─── queries ────────────────────────────────────────────────────────────────

// Written as sub-selects (not as text): Drizzle drops the table name from a column used in the
// select list of a one-table query, and `type_id = id` inside a sub-select would then compare the
// sub-select's own columns instead of the outer row.

/** The measurement being selected has a stored value (E26 writes `measurements`; `metric_id` is indexed). */
const hasStoredValue = exists(
  db
    .select({ one: sql`1` })
    .from(measurements)
    .where(eq(measurements.metricId, metrics.id)),
);
const metricHasValues = sql<boolean>`${hasStoredValue}`;

/** Any of the assessment's measurements, on or off, has a stored value (C6). */
const typeHasValues = sql<boolean>`${exists(
  db
    .select({ one: sql`1` })
    .from(metrics)
    .where(and(eq(metrics.typeId, assessmentTypes.id), hasStoredValue)),
)}`;

const typeColumns = {
  ...getTableColumns(assessmentTypes),
  hasValues: typeHasValues,
};
const metricColumns = {
  ...getTableColumns(metrics),
  hasValues: metricHasValues,
};

/** Advisory-lock key of the writes that read or renumber the whole assessment list (E10, E11, E12). */
const TYPE_LIST_LOCK_KEY = "setup.assessment_types";

/**
 * `case id when '<id1>' then 1 when '<id2>' then 2 ... end`: one statement renumbers a whole list
 * (BR-REC-67). The casts keep the parameters typed.
 */
function positionOf(idColumn: AnyPgColumn, ids: readonly string[]): SQL {
  const branches = ids.map(
    (id, index) => sql`when ${id}::uuid then ${index + 1}::int`,
  );
  return sql`case ${idColumn} ${sql.join(branches, sql` `)} end`;
}

export const setupRepository = {
  // ─── settings (one row, BR-REC-168) ───────────────────────────────────────

  /** A fresh database has no row until the seed (or the first call) creates it with the defaults. */
  async ensureSettingsRow(executor: Executor) {
    await executor.insert(gymSettings).values({ id: 1 }).onConflictDoNothing();
  },

  async readSettings(executor: Executor = db): Promise<SettingsRow> {
    const read = () => executor.select().from(gymSettings).limit(1);
    const [row] = await read();
    if (row) return row;
    await setupRepository.ensureSettingsRow(executor);
    const [created] = await read();
    if (!created) throw invariantBroken();
    return created;
  },

  /** Reads the row with a row lock held until the transaction ends (two E08 run one after the other). */
  async lockSettings(tx: Tx): Promise<SettingsRow> {
    await setupRepository.ensureSettingsRow(tx);
    const [row] = await tx.select().from(gymSettings).limit(1).for("update");
    if (!row) throw invariantBroken();
    return row;
  },

  async updateSettings(
    tx: Tx,
    patch: PartialUpdate<typeof gymSettings.$inferInsert>,
  ): Promise<SettingsRow> {
    const [row] = await tx
      .update(gymSettings)
      .set(patch)
      .where(eq(gymSettings.id, 1))
      .returning();
    if (!row) throw invariantBroken();
    return row;
  },

  // ─── assessments ──────────────────────────────────────────────────────────

  /** One page of assessments in setup order, and how many there are with the same filter. */
  async listTypes(
    executor: Executor,
    options: { includeInactive: boolean; limit: number; offset: number },
  ): Promise<{ rows: TypeRow[]; total: number }> {
    const where = options.includeInactive
      ? undefined
      : eq(assessmentTypes.isActive, true);
    const [rows, [counted]] = await Promise.all([
      executor
        .select(typeColumns)
        .from(assessmentTypes)
        .where(where)
        .orderBy(asc(assessmentTypes.sortOrder), asc(assessmentTypes.id))
        .limit(options.limit)
        .offset(options.offset),
      executor.select({ total: count() }).from(assessmentTypes).where(where),
    ]);
    return { rows, total: counted?.total ?? 0 };
  },

  async findType(executor: Executor, id: string): Promise<TypeRow | undefined> {
    const [row] = await executor
      .select(typeColumns)
      .from(assessmentTypes)
      .where(eq(assessmentTypes.id, id));
    return row;
  },

  /** The assessment row, locked until the transaction ends (parent first, then its measurements). */
  async lockType(tx: Tx, id: string) {
    const [row] = await tx
      .select()
      .from(assessmentTypes)
      .where(eq(assessmentTypes.id, id))
      .for("update");
    return row;
  },

  /**
   * Serialises every write that reads the whole assessment list (new name check, next sort order,
   * the "every assessment once" check). Released at commit or rollback.
   */
  async lockTypeList(tx: Tx) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${TYPE_LIST_LOCK_KEY}))`,
    );
  },

  /** Every assessment id, on and off, in setup order. */
  async listTypeIds(executor: Executor): Promise<string[]> {
    const rows = await executor
      .select({ id: assessmentTypes.id })
      .from(assessmentTypes)
      .orderBy(asc(assessmentTypes.sortOrder), asc(assessmentTypes.id));
    return rows.map((row) => row.id);
  },

  /** Another assessment with the same name, ignoring case (on or off). */
  async typeNameInUse(
    executor: Executor,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const [row] = await executor
      .select({ id: assessmentTypes.id })
      .from(assessmentTypes)
      .where(
        and(
          sql`lower(${assessmentTypes.name}) = lower(${name}::text)`,
          exceptId === undefined ? undefined : ne(assessmentTypes.id, exceptId),
        ),
      )
      .limit(1);
    return row !== undefined;
  },

  async nextTypeSortOrder(tx: Tx): Promise<number> {
    const [row] = await tx
      .select({
        next: sql<number>`coalesce(max(${assessmentTypes.sortOrder}), 0) + 1`,
      })
      .from(assessmentTypes);
    return row?.next ?? 1;
  },

  async insertType(tx: Tx, values: NewType) {
    const [row] = await guarded(() =>
      tx.insert(assessmentTypes).values(values).returning(),
    );
    if (!row) throw invariantBroken();
    return row;
  },

  async updateType(
    tx: Tx,
    id: string,
    patch: PartialUpdate<NewType>,
  ): Promise<void> {
    await guarded(() =>
      tx.update(assessmentTypes).set(patch).where(eq(assessmentTypes.id, id)),
    );
  },

  /** Sort orders become 1..n in the order of `ids` (BR-REC-67). */
  async setTypeOrder(tx: Tx, ids: readonly string[]): Promise<void> {
    await tx
      .update(assessmentTypes)
      .set({ sortOrder: positionOf(assessmentTypes.id, ids) })
      .where(inArray(assessmentTypes.id, [...ids]));
  },

  // ─── measurements ─────────────────────────────────────────────────────────

  /** The measurements of these assessments in setup order; off ones only when asked for. */
  async listMetrics(
    executor: Executor,
    typeIds: readonly string[],
    includeInactive: boolean,
  ): Promise<MetricRow[]> {
    if (typeIds.length === 0) return [];
    return executor
      .select(metricColumns)
      .from(metrics)
      .where(
        and(
          inArray(metrics.typeId, [...typeIds]),
          includeInactive ? undefined : eq(metrics.isActive, true),
        ),
      )
      .orderBy(asc(metrics.sortOrder), asc(metrics.id));
  },

  /** Every measurement id of the assessment, on and off, in setup order. */
  async listMetricIds(executor: Executor, typeId: string): Promise<string[]> {
    const rows = await executor
      .select({ id: metrics.id })
      .from(metrics)
      .where(eq(metrics.typeId, typeId))
      .orderBy(asc(metrics.sortOrder), asc(metrics.id));
    return rows.map((row) => row.id);
  },

  /**
   * The measurement row, locked until the transaction ends. A new value (a `measurements` row
   * pointing here) waits for the lock, so "has values" cannot change under the caller.
   */
  async lockMetric(tx: Tx, id: string) {
    const [row] = await tx
      .select()
      .from(metrics)
      .where(eq(metrics.id, id))
      .for("update");
    return row;
  },

  async metricHasValues(executor: Executor, id: string): Promise<boolean> {
    const [row] = await executor
      .select({ hasValues: metricHasValues })
      .from(metrics)
      .where(eq(metrics.id, id));
    return row?.hasValues ?? false;
  },

  /** Another measurement of the same assessment with the same name, ignoring case (on or off). */
  async metricNameInUse(
    executor: Executor,
    typeId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const [row] = await executor
      .select({ id: metrics.id })
      .from(metrics)
      .where(
        and(
          eq(metrics.typeId, typeId),
          sql`lower(${metrics.name}) = lower(${name}::text)`,
          exceptId === undefined ? undefined : ne(metrics.id, exceptId),
        ),
      )
      .limit(1);
    return row !== undefined;
  },

  async nextMetricSortOrder(tx: Tx, typeId: string): Promise<number> {
    const [row] = await tx
      .select({ next: sql<number>`coalesce(max(${metrics.sortOrder}), 0) + 1` })
      .from(metrics)
      .where(eq(metrics.typeId, typeId));
    return row?.next ?? 1;
  },

  async insertMetric(tx: Tx, values: NewMetric) {
    const [row] = await guarded(() =>
      tx.insert(metrics).values(values).returning(),
    );
    if (!row) throw invariantBroken();
    return row;
  },

  async updateMetric(tx: Tx, id: string, patch: PartialUpdate<NewMetric>) {
    const [row] = await guarded(() =>
      tx.update(metrics).set(patch).where(eq(metrics.id, id)).returning(),
    );
    if (!row) throw invariantBroken();
    return row;
  },

  /** Sort orders become 1..n in the order of `ids` (BR-REC-67). */
  async setMetricOrder(tx: Tx, ids: readonly string[]): Promise<void> {
    await tx
      .update(metrics)
      .set({ sortOrder: positionOf(metrics.id, ids) })
      .where(inArray(metrics.id, [...ids]));
  },
};
