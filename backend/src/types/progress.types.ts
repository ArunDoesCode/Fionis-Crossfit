import { z } from "zod";

import {
  BETTER_DIRECTIONS,
  DATATYPES,
  MEMBERSHIP_STATUSES,
  PLANS,
  SEXES,
  TABLE_PARTS,
} from "../lib/enums";
import {
  isoDateSchema,
  isoMonthSchema,
  paginationQuerySchema,
  uuidSchema,
} from "./common.types";

// Owner: progress stream. Endpoints E35-E39 (api-contract.md). The inner shapes
// of E35 and the `metric` block of E36 are not spelled out in the spec table:
// they follow BR-REC-106...108 and 112 and may be refined by the progress stream
// in THIS file (BR-REC-162); regenerate the contract afterwards.

/** E36 `ageBand`: 10-year bands by age today (BR-REC-114). */
export const AGE_BANDS = [
  "under20",
  "20to29",
  "30to39",
  "40to49",
  "50to59",
  "60plus",
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** E39 `file`. */
export const EXPORT_FILES = [
  "members.csv",
  "memberships.csv",
  "measurements.csv",
] as const;
export type ExportFile = (typeof EXPORT_FILES)[number];

// ─── E35 report card ────────────────────────────────────────────────────────

/** A value on a day; `isEstimated` shows as "≈ Dec 2025" (BR-REC-80). Durations in seconds. */
export const readingSchema = z.object({
  value: z.number(),
  on: isoDateSchema,
  isEstimated: z.boolean(),
});
export type Reading = z.infer<typeof readingSchema>;

/**
 * One measurement with at least one reading (never-recorded ones are left out,
 * BR-REC-106). `best` is null for "No direction" (BR-REC-107). `change` is
 * latest - first, null with fewer than 2 readings (BR-REC-22). `points` are the
 * last 12 readings, oldest first.
 */
export const reportMetricSchema = z.object({
  name: z.string(),
  unit: z.string(),
  datatype: z.enum(DATATYPES),
  better: z.enum(BETTER_DIRECTIONS),
  first: readingSchema,
  latest: readingSchema,
  best: readingSchema.nullable(),
  change: z.number().nullable(),
  readings: z.number().int().min(1),
  points: z.array(readingSchema).max(12),
});

/** The latest body-composition assessment with any table value (BR-REC-108). */
export const segmentalSchema = z.object({
  on: isoDateSchema,
  isEstimated: z.boolean(),
  /** column headers, e.g. "Skeletal muscle %", in setup order */
  groups: z.array(z.string()),
  /** one row per body part; `values` maps a group to its value, null renders "–" */
  rows: z.array(
    z.object({
      part: z.enum(TABLE_PARTS),
      values: z.record(z.string(), z.number().nullable()),
    }),
  ),
});

export const reportCardSchema = z.object({
  gymName: z.string(),
  /** today's gym day */
  printedOn: isoDateSchema,
  member: z.object({
    fullName: z.string(),
    age: z.number().int(),
    sex: z.enum(SEXES),
    plan: z.enum(PLANS),
    membershipStatus: z.enum(MEMBERSHIP_STATUSES),
    joinedOn: isoDateSchema,
  }),
  /** one section per assessment, in setup order */
  types: z.array(
    z.object({ name: z.string(), metrics: z.array(reportMetricSchema) }),
  ),
  segmental: segmentalSchema.nullable(),
});
export type ReportCard = z.infer<typeof reportCardSchema>;

// ─── E36 gym progress ───────────────────────────────────────────────────────

export const progressQuerySchema = z.object({
  metricId: uuidSchema,
  joinedFrom: isoMonthSchema.optional(),
  joinedTo: isoMonthSchema.optional(),
  plan: z.enum(PLANS).optional(),
  sex: z.enum(SEXES).optional(),
  ageBand: z.enum(AGE_BANDS).optional(),
});
export type ProgressQuery = z.infer<typeof progressQuerySchema>;

/**
 * `avgChange` is null when no member counts (n = 0). For "No direction"
 * measurements the three counts are 0 and the client shows only `avgChange`.
 */
export const progressStatsSchema = z.object({
  metric: z.object({
    id: uuidSchema,
    name: z.string(),
    unit: z.string(),
    datatype: z.enum(DATATYPES),
    decimals: z.number().int(),
    better: z.enum(BETTER_DIRECTIONS),
  }),
  n: z.number().int().min(0),
  notCounted: z.number().int().min(0),
  avgChange: z.number().nullable(),
  improved: z.number().int().min(0),
  noChange: z.number().int().min(0),
  worse: z.number().int().min(0),
});
export type ProgressStats = z.infer<typeof progressStatsSchema>;

// ─── E37 leaderboard ────────────────────────────────────────────────────────

/** Ranked by value (best first by direction); equal values share a rank (BR-REC-115). */
export const leaderboardQuerySchema = paginationQuerySchema.extend({
  metricId: uuidSchema,
  sex: z.enum(SEXES),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const leaderboardItemSchema = z.object({
  rank: z.number().int().min(1),
  memberId: uuidSchema,
  fullName: z.string(),
  value: z.number(),
  on: isoDateSchema,
});
export type LeaderboardItem = z.infer<typeof leaderboardItemSchema>;

// ─── E38 active members by plan ─────────────────────────────────────────────

export const activeByPlanSchema = z.object({
  monthly: z.number().int().min(0),
  quarterly: z.number().int().min(0),
  halfAnnual: z.number().int().min(0),
  annual: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type ActiveByPlan = z.infer<typeof activeByPlanSchema>;

// ─── E39 CSV export ─────────────────────────────────────────────────────────

/**
 * `file` is a plain string on purpose: an unknown name answers 404 `NOT_FOUND`
 * (api-contract.md), not a 400 validation error. The handler checks it against
 * `EXPORT_FILES`.
 */
export const exportParamsSchema = z.object({ file: z.string() });

/** E39 body is CSV text, not the JSON envelope. */
export const exportCsvSchema = z.string();
