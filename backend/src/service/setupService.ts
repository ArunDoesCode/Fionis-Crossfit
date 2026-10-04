import { db, type Tx } from "../db/client";
import { diffChangedFields, writeAudit } from "../lib/audit";
import type { Actor } from "../lib/auth-middleware";
import type {
  BetterDirection,
  Datatype,
  IntervalUnit,
  TablePart,
} from "../lib/enums";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import {
  type MetricRow,
  nameTaken,
  setupRepository as repo,
  type SettingsFields,
  type StoredMetric,
  type TypeRow,
} from "../repository/setupRepository";
import type {
  AssessmentType,
  AssessmentTypeListQuery,
  CreateAssessmentTypeBody,
  CreateMetricBody,
  Metric,
  Settings,
  UpdateAssessmentTypeBody,
  UpdateMetricBody,
  UpdateSettingsBody,
} from "../types/setup.types";
import {
  changesKindOrUnit,
  editedMetricFields,
  listIssue,
  listsEveryIdOnce,
  type MetricFields,
  metricIssues,
  newMetricFields,
  type RuleIssue,
} from "./setupRules";

// Setup rules: docs/specs/member-records/setup.md (BR-REC-10, 11, 13, 14, 60-72, C1-C11).
// Every write is one transaction that also writes its change-log row (BR-REC-158). Nothing is
// ever deleted (BR-REC-66). No unit conversion anywhere (BR-REC-69).

const notFound = (what: "Assessment" | "Measurement") =>
  new NotFoundError(`${what} not found`);

const invalid = (...issues: RuleIssue[]) =>
  new BadRequestError("Validation failed", "VALIDATION_ERROR", { issues });

const metricLocked = () =>
  new ConflictError(
    "Kind and unit cannot change once values exist",
    "METRIC_LOCKED",
  );

// ─── views (what the API answers; the database keeps text, the check constraints keep the unions) ─

const settingsView = (row: SettingsFields): Settings => ({
  gymName: row.gymName,
  timezone: row.timezone,
  upcomingLeadDays: row.upcomingLeadDays,
  expiryLeadDays: row.expiryLeadDays,
});

const metricFieldsOf = (row: StoredMetric): MetricFields => ({
  name: row.name,
  unit: row.unit,
  datatype: row.datatype as Datatype,
  decimals: row.decimals,
  better: row.better as BetterDirection,
  plausibleMin: row.plausibleMin,
  plausibleMax: row.plausibleMax,
  intervalCount: row.intervalCount,
  intervalUnit: row.intervalUnit as IntervalUnit | null,
  tableGroup: row.tableGroup,
  tablePart: row.tablePart as TablePart | null,
  isActive: row.isActive,
});

const metricView = (row: MetricRow): Metric => ({
  id: row.id,
  ...metricFieldsOf(row),
  sortOrder: row.sortOrder,
  hasValues: row.hasValues,
});

const typeView = (
  row: TypeRow,
  metricRows: readonly MetricRow[],
): AssessmentType => ({
  id: row.id,
  name: row.name,
  intervalCount: row.intervalCount,
  intervalUnit: row.intervalUnit as IntervalUnit,
  isActive: row.isActive,
  sortOrder: row.sortOrder,
  hasValues: row.hasValues,
  metrics: metricRows.map(metricView),
});

/** One assessment with all its measurements, on and off, in setup order (E10, E11 answers). */
async function loadType(tx: Tx, typeId: string): Promise<AssessmentType> {
  const [row, metricRows] = await Promise.all([
    repo.findType(tx, typeId),
    repo.listMetrics(tx, [typeId], true),
  ]);
  if (!row) throw notFound("Assessment");
  return typeView(row, metricRows);
}

// ─── change log (BR-REC-158) ────────────────────────────────────────────────

type Snapshot = Record<string, unknown>;
type Entry = { action: string; entity: string; entityId?: string };

/** The row of a successful write: changed fields only, before -> after. */
function logChange(
  tx: Tx,
  actor: Actor,
  entry: Entry,
  before: Snapshot,
  after: Snapshot,
) {
  const changed = diffChangedFields(before, after);
  return writeAudit(tx, {
    sessionId: actor.sessionId,
    ...entry,
    before: changed?.before ?? null,
    after: changed?.after ?? null,
  });
}

/** The row of a successful create: everything the new item holds. */
function logCreate(tx: Tx, actor: Actor, entry: Entry, after: Snapshot) {
  return writeAudit(tx, { sessionId: actor.sessionId, ...entry, after });
}

const typeSnapshot = (type: {
  name: string;
  intervalCount: number;
  intervalUnit: string;
  isActive: boolean;
}): Snapshot => ({
  name: type.name,
  intervalCount: type.intervalCount,
  intervalUnit: type.intervalUnit,
  isActive: type.isActive,
});

export const setupService = {
  // ─── settings: E07, E08 (BR-REC-60) ───────────────────────────────────────

  /** E07 */
  async getSettings(): Promise<Settings> {
    return settingsView(await repo.readSettings());
  },

  /** E08: changes only the fields sent; the answer is the whole row. */
  async updateSettings(
    actor: Actor,
    patch: UpdateSettingsBody,
  ): Promise<Settings> {
    return db.transaction(async (tx) => {
      const before = settingsView(await repo.lockSettings(tx));
      const after = settingsView(await repo.updateSettings(tx, patch));
      await logChange(
        tx,
        actor,
        { action: "settings.update", entity: "settings", entityId: "1" },
        before,
        after,
      );
      return after;
    });
  },

  // ─── assessments: E09-E12 (BR-REC-10, 13, 61, 66, 67, 70, C5-C7) ──────────

  /**
   * E09: the catalog in setup order. Without `includeInactive`, off assessments (with all their
   * measurements) and off measurements are left out (C5); `total` counts the assessments after
   * that filter.
   */
  async listCatalog(query: AssessmentTypeListQuery) {
    const includeInactive = query.includeInactive === "true";
    const { rows, total } = await repo.listTypes(db, {
      includeInactive,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    const metricRows = await repo.listMetrics(
      db,
      rows.map((row) => row.id),
      includeInactive,
    );
    const byType = new Map<string, MetricRow[]>();
    for (const metric of metricRows) {
      byType.set(metric.typeId, [...(byType.get(metric.typeId) ?? []), metric]);
    }
    return {
      items: rows.map((row) => typeView(row, byType.get(row.id) ?? [])),
      total,
    };
  },

  /** E10: added last, On, with no measurements (C7). */
  async createType(
    actor: Actor,
    body: CreateAssessmentTypeBody,
  ): Promise<AssessmentType> {
    return db.transaction(async (tx) => {
      await repo.lockTypeList(tx);
      if (await repo.typeNameInUse(tx, body.name)) throw nameTaken();
      const row = await repo.insertType(tx, {
        name: body.name,
        intervalCount: body.intervalCount,
        intervalUnit: body.intervalUnit,
        isActive: true,
        sortOrder: await repo.nextTypeSortOrder(tx),
      });
      await logCreate(
        tx,
        actor,
        {
          action: "assessment_type.create",
          entity: "assessment_type",
          entityId: row.id,
        },
        { ...typeSnapshot(row), sortOrder: row.sortOrder },
      );
      return typeView({ ...row, hasValues: false }, []);
    });
  },

  /** E11: rename, repeat, On/Off. Turning off hides the measurements without changing theirs (C5). */
  async updateType(
    actor: Actor,
    typeId: string,
    patch: UpdateAssessmentTypeBody,
  ): Promise<AssessmentType> {
    return db.transaction(async (tx) => {
      await repo.lockTypeList(tx);
      const stored = await repo.lockType(tx, typeId);
      if (!stored) throw notFound("Assessment");
      if (
        patch.name !== undefined &&
        (await repo.typeNameInUse(tx, patch.name, typeId))
      ) {
        throw nameTaken();
      }
      await repo.updateType(tx, typeId, patch);
      const view = await loadType(tx, typeId);
      await logChange(
        tx,
        actor,
        {
          action: "assessment_type.update",
          entity: "assessment_type",
          entityId: typeId,
        },
        typeSnapshot(stored),
        typeSnapshot(view),
      );
      return view;
    });
  },

  /** E12: `typeIds` lists every assessment once; sort orders become 1..n (C7, BR-REC-67). */
  async reorderTypes(actor: Actor, typeIds: readonly string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await repo.lockTypeList(tx);
      const stored = await repo.listTypeIds(tx);
      if (!listsEveryIdOnce(typeIds, stored))
        throw invalid(listIssue("typeIds"));
      const order = typeIds.map((id) => id.toLowerCase());
      await repo.setTypeOrder(tx, order);
      await logChange(
        tx,
        actor,
        {
          action: "assessment_type.reorder",
          entity: "assessment_type",
        },
        { order: stored },
        { order },
      );
    });
  },

  // ─── measurements: E13-E15 (BR-REC-10, 11, 14, 62, 64-67, 69, C3, C4, C7-C9) ──

  /** E13: added last and On; kind decides unit and decimals (C3). */
  async createMetric(
    actor: Actor,
    typeId: string,
    body: CreateMetricBody,
  ): Promise<Metric> {
    return db.transaction(async (tx) => {
      if (!(await repo.lockType(tx, typeId))) throw notFound("Assessment");
      const fields = newMetricFields(body);
      if (await repo.metricNameInUse(tx, typeId, fields.name)) {
        throw nameTaken();
      }
      const row = await repo.insertMetric(tx, {
        typeId,
        ...fields,
        sortOrder: await repo.nextMetricSortOrder(tx, typeId),
      });
      await logCreate(
        tx,
        actor,
        { action: "metric.create", entity: "metric", entityId: row.id },
        { typeId, ...metricFieldsOf(row), sortOrder: row.sortOrder },
      );
      return metricView({ ...row, hasValues: false });
    });
  },

  /**
   * E14: changes only the fields sent. Refusals come in this order: unknown id (404), a range or
   * pair that would end up broken (C8, 400), kind or unit changing under stored values (C4, 409
   * METRIC_LOCKED), a name already used in the assessment (409 NAME_TAKEN).
   */
  async updateMetric(
    actor: Actor,
    metricId: string,
    patch: UpdateMetricBody,
  ): Promise<Metric> {
    return db.transaction(async (tx) => {
      const row = await repo.lockMetric(tx, metricId);
      if (!row) throw notFound("Measurement");
      const stored = metricFieldsOf(row);
      const next = editedMetricFields(stored, patch);

      const issues = metricIssues(next);
      if (issues.length > 0) throw invalid(...issues);

      const hasValues = await repo.metricHasValues(tx, metricId);
      if (hasValues && changesKindOrUnit(stored, next)) throw metricLocked();

      if (
        patch.name !== undefined &&
        (await repo.metricNameInUse(tx, row.typeId, next.name, metricId))
      ) {
        throw nameTaken();
      }

      const saved = await repo.updateMetric(tx, metricId, next);
      await logChange(
        tx,
        actor,
        { action: "metric.update", entity: "metric", entityId: metricId },
        stored,
        metricFieldsOf(saved),
      );
      return metricView({ ...saved, hasValues });
    });
  },

  /** E15: `metricIds` lists every measurement of the assessment once; sort orders become 1..n (C7). */
  async reorderMetrics(
    actor: Actor,
    typeId: string,
    metricIds: readonly string[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (!(await repo.lockType(tx, typeId))) throw notFound("Assessment");
      const stored = await repo.listMetricIds(tx, typeId);
      if (!listsEveryIdOnce(metricIds, stored)) {
        throw invalid(listIssue("metricIds"));
      }
      const order = metricIds.map((id) => id.toLowerCase());
      await repo.setMetricOrder(tx, order);
      await logChange(
        tx,
        actor,
        {
          action: "metric.reorder",
          entity: "assessment_type",
          entityId: typeId,
        },
        { order: stored },
        { order },
      );
    });
  },
};
