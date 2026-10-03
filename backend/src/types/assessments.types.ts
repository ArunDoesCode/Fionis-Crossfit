import { z } from "zod";

import { BETTER_DIRECTIONS, DATATYPES } from "../lib/enums";
import {
  isoDateSchema,
  paginationQuerySchema,
  SORT_DIRECTIONS,
  updateBodySchema,
  uuidSchema,
} from "./common.types";

// Owner: assessments stream. Endpoints E25-E30 (api-contract.md). Rounding,
// NO_VALUES, METRIC_NOT_IN_TYPE, DATE_IN_FUTURE and ASSESSMENT_DATE_TAKEN are
// the assessments stream's to enforce.

/** E26 accepts at most this many values per save (the catalog is far smaller). */
export const MAX_VALUES_PER_SAVE = 60;

export const assessmentIdParamsSchema = z.object({
  assessmentId: uuidSchema,
});

// ─── E25 entry form ─────────────────────────────────────────────────────────

export const entryFormQuerySchema = z.object({
  typeId: uuidSchema,
  date: isoDateSchema,
});
export type EntryFormQuery = z.infer<typeof entryFormQuerySchema>;

/** The latest value dated before the form's date (BR-REC-81). Durations in seconds. */
const previousValueSchema = z.object({
  value: z.number(),
  on: isoDateSchema,
  isEstimated: z.boolean(),
});

export const entryFormMetricSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  unit: z.string(),
  datatype: z.enum(DATATYPES),
  decimals: z.number().int(),
  better: z.enum(BETTER_DIRECTIONS),
  plausibleMin: z.number().nullable(),
  plausibleMax: z.number().nullable(),
  previous: previousValueSchema.nullable(),
});

export const entryFormSchema = z.object({
  member: z.object({
    id: uuidSchema,
    fullName: z.string(),
    joinedOn: isoDateSchema,
  }),
  type: z.object({ id: uuidSchema, name: z.string() }),
  /** the assessment already saved for this member + type + date, or null */
  existing: z
    .object({
      assessmentId: uuidSchema,
      isEstimated: z.boolean(),
      /** metric id -> value (durations in seconds) */
      values: z.record(z.string(), z.number()),
    })
    .nullable(),
  metrics: z.array(entryFormMetricSchema),
});
export type EntryForm = z.infer<typeof entryFormSchema>;

// ─── E26 save ───────────────────────────────────────────────────────────────

/**
 * E26 body. `value: null` removes a saved value (BR-REC-77). An empty or
 * all-null `values` is NOT a shape error: the service answers 400 `NO_VALUES`.
 */
export const saveAssessmentBodySchema = z.object({
  memberId: uuidSchema,
  typeId: uuidSchema,
  date: isoDateSchema,
  isEstimated: z.boolean(),
  values: z
    .array(z.object({ metricId: uuidSchema, value: z.number().nullable() }))
    .max(MAX_VALUES_PER_SAVE),
});
export type SaveAssessmentBody = z.infer<typeof saveAssessmentBodySchema>;

/** E26 `data`: `created` is false when an existing assessment was edited. */
export const saveAssessmentResultSchema = z.object({
  assessmentId: uuidSchema,
  created: z.boolean(),
  saved: z.number().int().min(0),
  removed: z.number().int().min(0),
});
export type SaveAssessmentResult = z.infer<typeof saveAssessmentResultSchema>;

// ─── E27 list ───────────────────────────────────────────────────────────────

/** Sorted by date; only the direction is selectable (default newest first, BR-REC-89). */
export const assessmentListQuerySchema = paginationQuerySchema.extend({
  memberId: uuidSchema,
  typeId: uuidSchema.optional(),
  sortDir: z.enum(SORT_DIRECTIONS).default("desc"),
});
export type AssessmentListQuery = z.infer<typeof assessmentListQuerySchema>;

export const assessmentListItemSchema = z.object({
  id: uuidSchema,
  typeId: uuidSchema,
  typeName: z.string(),
  date: isoDateSchema,
  isEstimated: z.boolean(),
  valueCount: z.number().int().min(0),
});
export type AssessmentListItem = z.infer<typeof assessmentListItemSchema>;

// ─── E28 detail, E29 update, E30 delete ─────────────────────────────────────

/** E28 and E29 `data`. */
export const assessmentDetailSchema = z.object({
  id: uuidSchema,
  memberId: uuidSchema,
  typeId: uuidSchema,
  typeName: z.string(),
  date: isoDateSchema,
  isEstimated: z.boolean(),
  values: z.array(
    z.object({
      metricId: uuidSchema,
      name: z.string(),
      unit: z.string(),
      datatype: z.enum(DATATYPES),
      value: z.number(),
    }),
  ),
});
export type AssessmentDetail = z.infer<typeof assessmentDetailSchema>;

/** E29: moving the date moves the values too (BR-REC-166). */
export const updateAssessmentBodySchema = updateBodySchema({
  date: isoDateSchema,
  isEstimated: z.boolean(),
});
export type UpdateAssessmentBody = z.infer<typeof updateAssessmentBodySchema>;

/** E30 `data`: how many values were removed with it. */
export const deleteAssessmentResultSchema = z.object({
  removed: z.number().int().min(0),
});
