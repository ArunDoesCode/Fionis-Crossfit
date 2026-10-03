import { z } from "zod";

/**
 * Request/response building blocks shared by every `types/<feature>.types.ts`
 * (Stream 0). Feature-specific shapes stay in their own file (BR-REC-162).
 */

// ─── Identifiers ────────────────────────────────────────────────────────────

/**
 * Any 8-4-4-4-12 hex id (what Postgres' `uuid` accepts). Deliberately not the
 * RFC-variant check of `z.uuid()`: a well-formed id that does not exist must
 * answer 404, not 400.
 */
export const uuidSchema = z.guid();

export const memberIdParamsSchema = z.object({ memberId: uuidSchema });

// ─── Dates and moments (BR-REC-153, 163) ────────────────────────────────────

/** Calendar day in the gym's time zone, `YYYY-MM-DD`. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Calendar month, `YYYY-MM`. */
export const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** `YYYY-MM-DD`, and a day that exists (`2026-02-31` is a 400, not a 500). */
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, "Use YYYY-MM-DD")
  .refine(isRealCalendarDate, "Not a real calendar date");

/** `YYYY-MM`. */
export const isoMonthSchema = z
  .string()
  .regex(ISO_MONTH_PATTERN, "Use YYYY-MM");

/** A moment: ISO 8601 in UTC, e.g. `2026-10-03T08:15:00.000Z`. */
export const isoDateTimeSchema = z.iso.datetime();

// ─── Pagination (BR-REC-155) ────────────────────────────────────────────────

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** `page` from 1, `pageSize` default 10, max 100. On every list. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

/** Pagination + whitelisted `sortBy` + `sortDir`. The id is the tie-breaker. */
export function sortedListQuerySchema<
  const Fields extends readonly [string, ...string[]],
>(sortFields: Fields, defaultSortDir: SortDirection = "asc") {
  return paginationQuerySchema.extend({
    sortBy: z.enum(sortFields).optional(),
    sortDir: z.enum(SORT_DIRECTIONS).default(defaultSortDir),
  });
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/** Header name of BR-REC-156 (E17, E22). */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
/** The value is a UUID, valid for 48 h per (session, key). */
export const idempotencyKeySchema = uuidSchema;

const AT_LEAST_ONE_FIELD = "At least one field is required";

/**
 * Update body (BR-REC-157): every field optional, unknown fields rejected,
 * at least one field present. Nullable columns take an explicit `null` to
 * clear the value; omitting a field leaves it unchanged.
 */
export function updateBodySchema<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .strictObject(shape)
    .partial()
    .refine((value) => Object.values(value).some((v) => v !== undefined), {
      message: AT_LEAST_ONE_FIELD,
    });
}

// ─── Responses ──────────────────────────────────────────────────────────────

/** `data: {}` — endpoints that return nothing beyond the envelope. */
export const emptyDataSchema = z.object({});
