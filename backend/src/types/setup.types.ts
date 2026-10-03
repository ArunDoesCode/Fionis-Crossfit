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

// Owner: setup stream. Endpoints E07-E15 (api-contract.md). Field-level rules
// (name 2-40 chars, unit <= 12, lead-day ranges, min < max, both-or-neither
// pairs, METRIC_LOCKED) are the setup stream's to add to this file.

// ─── Settings (E07, E08) ────────────────────────────────────────────────────

export const settingsSchema = z.object({
  gymName: z.string(),
  timezone: z.string(),
  upcomingLeadDays: z.number().int(),
  expiryLeadDays: z.number().int(),
});
export type Settings = z.infer<typeof settingsSchema>;

/** E08: any of the settings, unknown fields rejected, at least one (BR-REC-157). */
export const updateSettingsBodySchema = updateBodySchema(settingsSchema.shape);
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;

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

/**
 * E13. Required: name, datatype, better. Server defaults when omitted:
 * unit "", decimals 1, no range, no own interval, no report-table place;
 * the metric is added last and is active.
 */
export const createMetricBodySchema = z.object({
  name: metricFields.name,
  unit: metricFields.unit.optional(),
  datatype: metricFields.datatype,
  decimals: metricFields.decimals.optional(),
  better: metricFields.better,
  plausibleMin: metricFields.plausibleMin.optional(),
  plausibleMax: metricFields.plausibleMax.optional(),
  intervalCount: metricFields.intervalCount.optional(),
  intervalUnit: metricFields.intervalUnit.optional(),
  tableGroup: metricFields.tableGroup.optional(),
  tablePart: metricFields.tablePart.optional(),
});
export type CreateMetricBody = z.infer<typeof createMetricBodySchema>;

/** E14: any metric field + `isActive`, unknown fields rejected, at least one. */
export const updateMetricBodySchema = updateBodySchema({
  ...metricFields,
  isActive: z.boolean(),
});
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
  name: z.string(),
  intervalCount: z.number().int(),
  intervalUnit: z.enum(INTERVAL_UNITS),
});
export type CreateAssessmentTypeBody = z.infer<
  typeof createAssessmentTypeBodySchema
>;

/** E11. */
export const updateAssessmentTypeBodySchema = updateBodySchema({
  name: z.string(),
  intervalCount: z.number().int(),
  intervalUnit: z.enum(INTERVAL_UNITS),
  isActive: z.boolean(),
});
export type UpdateAssessmentTypeBody = z.infer<
  typeof updateAssessmentTypeBodySchema
>;

export const typeIdParamsSchema = z.object({ typeId: uuidSchema });

/** E12: every assessment id, once each, in the new order. */
export const assessmentTypeOrderBodySchema = z.object({
  typeIds: z.array(uuidSchema),
});

/** E15: every measurement id of the assessment, once each, in the new order. */
export const metricOrderBodySchema = z.object({
  metricIds: z.array(uuidSchema),
});

/** E12 and E15 `data`. */
export const orderResultSchema = emptyDataSchema;
