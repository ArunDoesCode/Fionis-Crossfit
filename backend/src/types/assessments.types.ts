import { z } from "zod";

import { BETTER_DIRECTIONS, DATATYPES, TABLE_PARTS } from "../lib/enums";
import {
  isoDateSchema,
  paginationQuerySchema,
  SORT_DIRECTIONS,
  updateBodySchema,
  uuidSchema,
} from "./common.types";

// Owner: assessments stream. Endpoints E25-E30 (api-contract.md, assessments.md
// D1-D10). Limits sit on the request schemas only. Rules that need the database
// are service rules, not here: rounding (BR-REC-76), NO_VALUES, METRIC_NOT_IN_TYPE,
// DATE_IN_FUTURE, ASSESSMENT_DATE_TAKEN, and the Time limit (it depends on the
// measurement's datatype, which the schema cannot see).

/** E26 accepts at most this many values per save (the catalog is far smaller). */
export const MAX_VALUES_PER_SAVE = 60;

/**
 * Largest absolute value any measurement holds (`numeric(12,3)`); the one limit
 * the schema can check without the datatype (D3).
 */
export const MAX_MEASUREMENT_VALUE = 999_999_999.999;

/**
 * Time (`duration`) values are whole seconds from 0 to 35,999 (599:59, BR-REC-75).
 * The SERVICE enforces it (D3): the schema does not know a metric's datatype.
 */
export const MAX_DURATION_SECONDS = 35_999;

const VALUE_MESSAGE = "Use a number up to 999,999,999.999 either way";
const DUPLICATE_METRIC_MESSAGE = "List each measurement once";

export const assessmentIdParamsSchema = z.object({
  assessmentId: uuidSchema,
});

// ─── E25 entry form ─────────────────────────────────────────────────────────

/** E25 query. Only the date's shape is checked: a future date still returns a form (D1). */
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
  tableGroup: z
    .string()
    .nullable()
    .describe(
      "Report table group, e.g. 'Skeletal muscle %'; null = no report place.",
    ),
  tablePart: z
    .enum(TABLE_PARTS)
    .nullable()
    .describe("Report table part; null exactly when tableGroup is null."),
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
 * E26 entry: a measurement left out of `values` is not touched; `value: n` sets
 * it; `value: null` removes the stored value (BR-REC-77, D2). The key `value`
 * is required. Finite, absolute value at most 999,999,999.999 (D3); the Time
 * limit is a service rule (`MAX_DURATION_SECONDS`).
 */
const saveValueSchema = z.object({
  metricId: uuidSchema,
  value: z
    .number()
    .min(-MAX_MEASUREMENT_VALUE, VALUE_MESSAGE)
    .max(MAX_MEASUREMENT_VALUE, VALUE_MESSAGE)
    .nullable(),
});

/**
 * E26 body (create, or edit the one for member + type + date). An empty or
 * all-null `values` is NOT a shape error: the service answers 400 `NO_VALUES`
 * (D2). A measurement id at most once (compared ignoring letter case; the
 * issue sits on the repeat's `metricId`); at most 60 entries. The date has no
 * lower bound; "not after gym today" is a service rule (D1). Unknown keys are
 * ignored (BR-REC-157 covers update bodies).
 */
export const saveAssessmentBodySchema = z.object({
  memberId: uuidSchema,
  typeId: uuidSchema,
  date: isoDateSchema,
  isEstimated: z.boolean(),
  values: z
    .array(saveValueSchema)
    .max(MAX_VALUES_PER_SAVE, `Use at most ${MAX_VALUES_PER_SAVE} values`)
    .superRefine((entries, ctx) => {
      const seen = new Set<string>();
      entries.forEach((entry, index) => {
        const id = entry.metricId.toLowerCase();
        if (seen.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: DUPLICATE_METRIC_MESSAGE,
            path: [index, "metricId"],
          });
        }
        seen.add(id);
      });
    }),
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

/**
 * Sorted by date then id; only the direction is selectable (default newest
 * first, BR-REC-89, D10). `memberId` is required; an unknown member or type
 * gives an empty list, not a 404.
 */
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

/**
 * E29: `date` and/or `isEstimated`; unknown keys rejected, at least one field
 * (BR-REC-157); `null` is not accepted. Moving the date moves the values too
 * (BR-REC-166, D8).
 */
export const updateAssessmentBodySchema = updateBodySchema({
  date: isoDateSchema,
  isEstimated: z.boolean(),
});
export type UpdateAssessmentBody = z.infer<typeof updateAssessmentBodySchema>;

/** E30 `data`: how many values were removed with it. */
export const deleteAssessmentResultSchema = z.object({
  removed: z.number().int().min(0),
});
