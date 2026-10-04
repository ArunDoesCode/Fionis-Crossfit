import { z } from "zod";

import {
  BETTER_DIRECTIONS,
  DATATYPES,
  INTERVAL_UNITS,
  TABLE_PARTS,
} from "../lib/enums";
import {
  emptyDataSchema,
  paginationQuerySchema,
  updateBodySchema,
  uuidSchema,
} from "./common.types";

// Owner: setup stream. Endpoints E07-E15 (api-contract.md). Limits sit on the
// request schemas only (response schemas stay plain). Rules that need the
// database (NAME_TAKEN, METRIC_LOCKED, "every id listed", pair checks against
// stored values) are service rules, not here (setup.md C4, C7, C8).

// ─── Settings (E07, E08) ────────────────────────────────────────────────────

/**
 * True when the runtime's `Intl` knows `value` as a time zone name. Offsets
 * ("+05:30") are accepted by `Intl` but are not IANA names, so they are refused.
 * (`Intl.supportedValuesOf` lists only canonical names, e.g. Asia/Calcutta.)
 */
function isKnownTimeZone(value: string): boolean {
  if (!/^[A-Za-z]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const GYM_NAME_MESSAGE = "Use 2 to 60 characters";
const UPCOMING_DAYS_MESSAGE = "Use 0 to 30 days";
const EXPIRY_DAYS_MESSAGE = "Use 0 to 60 days";

export const settingsSchema = z.object({
  gymName: z.string(),
  timezone: z.string(),
  upcomingLeadDays: z.number().int(),
  expiryLeadDays: z.number().int(),
});
export type Settings = z.infer<typeof settingsSchema>;

/**
 * E08: any of the settings, unknown fields rejected, at least one (BR-REC-157).
 * Gym name trimmed 2-60, time zone a known IANA name, lead days whole numbers
 * 0-30 and 0-60 (BR-REC-60, C1).
 */
export const updateSettingsBodySchema = updateBodySchema({
  gymName: z.string().trim().min(2, GYM_NAME_MESSAGE).max(60, GYM_NAME_MESSAGE),
  timezone: z.string().refine(isKnownTimeZone, "Use a time zone name"),
  upcomingLeadDays: z
    .number()
    .int()
    .min(0, UPCOMING_DAYS_MESSAGE)
    .max(30, UPCOMING_DAYS_MESSAGE),
  expiryLeadDays: z
    .number()
    .int()
    .min(0, EXPIRY_DAYS_MESSAGE)
    .max(60, EXPIRY_DAYS_MESSAGE),
});
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;

// ─── Shared request fields (E10-E15) ────────────────────────────────────────

const NAME_MESSAGE = "Use 2 to 40 characters";
const INTERVAL_MESSAGE = "Use 1 to 24";

/** Assessment, measurement or report-group name: trimmed, then 2-40 characters (BR-REC-61, 62, C2). */
const nameField = z.string().trim().min(2, NAME_MESSAGE).max(40, NAME_MESSAGE);
/** "Repeats every N weeks/months": a whole number 1-24 (BR-REC-61). */
const intervalCountField = z
  .number()
  .int()
  .min(1, INTERVAL_MESSAGE)
  .max(24, INTERVAL_MESSAGE);

/** Every id once, at least one (E12, E15); that every id of the set is present is a service rule (C7). */
const orderIdsField = z
  .array(uuidSchema)
  .min(1, "List every item once")
  .refine(
    (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    "List every item once",
  );

// ─── Metrics (E13, E14, inside E09) ─────────────────────────────────────────

/**
 * Editable metric fields. A `null` clears the optional ones. Rounding and the
 * "duration => 0 decimals" convention are service rules (BR-REC-64).
 */
const metricFields = {
  name: z.string(),
  unit: z.string(),
  datatype: z.enum(DATATYPES),
  decimals: z.number().int(),
  better: z.enum(BETTER_DIRECTIONS),
  plausibleMin: z.number().nullable(),
  plausibleMax: z.number().nullable(),
  intervalCount: z.number().int().nullable(),
  intervalUnit: z.enum(INTERVAL_UNITS).nullable(),
  tableGroup: z.string().nullable(),
  tablePart: z.enum(TABLE_PARTS).nullable(),
};

export const metricSchema = z.object({
  id: uuidSchema,
  ...metricFields,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** true once any value exists: datatype and unit are then locked (BR-REC-11) */
  hasValues: z.boolean(),
});
export type Metric = z.infer<typeof metricSchema>;

/** Largest check-range value the `numeric(12,3)` columns hold; a bigger one would be a database error. */
const PLAUSIBLE_LIMIT = 999_999_999.999;
const PLAUSIBLE_MESSAGE = "Use a number up to 999,999,999.999 either way";
const plausibleField = z
  .number()
  .min(-PLAUSIBLE_LIMIT, PLAUSIBLE_MESSAGE)
  .max(PLAUSIBLE_LIMIT, PLAUSIBLE_MESSAGE)
  .nullable();

/** Request limits per field (the response keeps the plain `metricFields`). */
const metricInputFields = {
  ...metricFields,
  name: nameField,
  unit: z.string().max(12, "Use at most 12 characters"),
  decimals: z.number().int().min(0, "Use 0, 1 or 2").max(2, "Use 0, 1 or 2"),
  plausibleMin: plausibleField,
  plausibleMax: plausibleField,
  intervalCount: intervalCountField.nullable(),
  tableGroup: nameField.nullable(),
};

type MetricRuleFields = {
  plausibleMin?: number | null | undefined;
  plausibleMax?: number | null | undefined;
};

/** "Please check" range: below < above when both are numbers (BR-REC-62). */
function minBelowMax(v: MetricRuleFields): boolean {
  const { plausibleMin: min, plausibleMax: max } = v;
  return typeof min !== "number" || typeof max !== "number" || min < max;
}

/**
 * Both set or both empty (own repeat; report group + part). On an update
 * (`partial`) a pair is only checked when both sides are in the body; the
 * check against the stored values is a service rule (C8).
 */
function pairComplete(a: unknown, b: unknown, partial: boolean): boolean {
  if (partial && (a === undefined || b === undefined)) return true;
  return (a == null) === (b == null);
}

const RANGE_ISSUE = {
  error: "Below must be smaller than above",
  path: ["plausibleMin"],
};
const REPEAT_ISSUE = {
  error: "Set both the repeat number and unit, or neither",
  path: ["intervalCount"],
};
const TABLE_ISSUE = {
  error: "Set both the report group and part, or neither",
  path: ["tableGroup"],
};

/**
 * E13. Required: name, datatype, better. Server defaults when omitted:
 * unit "", decimals 1, no range, no own interval, no report-table place;
 * the metric is added last and is active. A duration always gets unit
 * "min:sec" and 0 decimals, whatever is sent (C3, service rule).
 */
export const createMetricBodySchema = z
  .object({
    name: metricInputFields.name,
    unit: metricInputFields.unit.optional(),
    datatype: metricInputFields.datatype,
    decimals: metricInputFields.decimals.optional(),
    better: metricInputFields.better,
    plausibleMin: metricInputFields.plausibleMin.optional(),
    plausibleMax: metricInputFields.plausibleMax.optional(),
    intervalCount: metricInputFields.intervalCount.optional(),
    intervalUnit: metricInputFields.intervalUnit.optional(),
    tableGroup: metricInputFields.tableGroup.optional(),
    tablePart: metricInputFields.tablePart.optional(),
  })
  .refine(minBelowMax, RANGE_ISSUE)
  .refine(
    (v) => pairComplete(v.intervalCount, v.intervalUnit, false),
    REPEAT_ISSUE,
  )
  .refine((v) => pairComplete(v.tableGroup, v.tablePart, false), TABLE_ISSUE);
export type CreateMetricBody = z.infer<typeof createMetricBodySchema>;

/** E14: any metric field + `isActive`, unknown fields rejected, at least one. */
export const updateMetricBodySchema = updateBodySchema({
  ...metricInputFields,
  isActive: z.boolean(),
})
  .refine(minBelowMax, RANGE_ISSUE)
  .refine(
    (v) => pairComplete(v.intervalCount, v.intervalUnit, true),
    REPEAT_ISSUE,
  )
  .refine((v) => pairComplete(v.tableGroup, v.tablePart, true), TABLE_ISSUE);
export type UpdateMetricBody = z.infer<typeof updateMetricBodySchema>;

export const metricIdParamsSchema = z.object({ metricId: uuidSchema });

// ─── Assessment types (E09-E12, E15) ────────────────────────────────────────

/** An assessment with its measurements in setup order. */
export const assessmentTypeSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  intervalCount: z.number().int(),
  intervalUnit: z.enum(INTERVAL_UNITS),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  hasValues: z.boolean(),
  metrics: z.array(metricSchema),
});
export type AssessmentType = z.infer<typeof assessmentTypeSchema>;

/**
 * E09. Inactive assessments and measurements are left out unless
 * `includeInactive=true`. The query string carries the literal text
 * "true" or "false" (so the generated client type is exact).
 */
export const assessmentTypeListQuerySchema = paginationQuerySchema.extend({
  includeInactive: z.enum(["true", "false"]).default("false"),
});
export type AssessmentTypeListQuery = z.infer<
  typeof assessmentTypeListQuerySchema
>;

/** E10. The assessment is added last and is active. */
export const createAssessmentTypeBodySchema = z.object({
  name: nameField,
  intervalCount: intervalCountField,
  intervalUnit: z.enum(INTERVAL_UNITS),
});
export type CreateAssessmentTypeBody = z.infer<
  typeof createAssessmentTypeBodySchema
>;

/** E11. */
export const updateAssessmentTypeBodySchema = updateBodySchema({
  name: nameField,
  intervalCount: intervalCountField,
  intervalUnit: z.enum(INTERVAL_UNITS),
  isActive: z.boolean(),
});
export type UpdateAssessmentTypeBody = z.infer<
  typeof updateAssessmentTypeBodySchema
>;

export const typeIdParamsSchema = z.object({ typeId: uuidSchema });

/** E12: every assessment id, once each, in the new order. */
export const assessmentTypeOrderBodySchema = z.object({
  typeIds: orderIdsField,
});

/** E15: every measurement id of the assessment, once each, in the new order. */
export const metricOrderBodySchema = z.object({
  metricIds: orderIdsField,
});

/** E12 and E15 `data`. */
export const orderResultSchema = emptyDataSchema;
