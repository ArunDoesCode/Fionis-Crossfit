import { z } from "zod";

import { MEMBERSHIP_STATUSES, OBJECTIVES, PLANS, SEXES } from "../lib/enums";
import {
  isoDateSchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  sortedListQuerySchema,
  updateBodySchema,
  uuidSchema,
} from "./common.types";

// Owner: members stream. Endpoints E16-E24 (api-contract.md, members.md).
// Field rules that need only the request live here (BR-REC-03, 45, 46, 49);
// rules that need the database or the gym's today (DATE_IN_FUTURE,
// START_BEFORE_JOIN, PERIOD_OVERLAP) are service answers, listed on the routes.

/** E16 `status` filter. Without it archived members are left out; `any` includes them. */
export const MEMBER_STATUS_FILTERS = [
  "active",
  "expiring",
  "expired",
  "archived",
  "any",
] as const;
export type MemberStatusFilter = (typeof MEMBER_STATUS_FILTERS)[number];

/** E16 whitelisted `sortBy`. */
export const MEMBER_SORT_FIELDS = [
  "name",
  "joinedOn",
  "lastAssessedOn",
] as const;

/** E24 `status`. */
export const ENDING_STATUSES = ["expiring", "expired"] as const;
export type EndingStatus = (typeof ENDING_STATUSES)[number];

// ─── Shared shapes ──────────────────────────────────────────────────────────

const planSchema = z.enum(PLANS);

const DAYS_LEFT_TEXT =
  "Days from the gym's today to endOn: 0 = ends today, negative = ended (-1 = ended yesterday).";

/** The member's membership as derived from the latest period by start (BR-REC-52). */
export const membershipSummarySchema = z.object({
  status: z
    .enum(MEMBERSHIP_STATUSES)
    .describe(
      "expired = ended before today; expiring = ends within the lead days (ending today counts); active otherwise, also a period that has not started.",
    ),
  plan: planSchema,
  endOn: isoDateSchema,
  daysLeft: z.number().int().describe(DAYS_LEFT_TEXT),
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

export const membershipDetailSchema = membershipSummarySchema.extend({
  startOn: isoDateSchema,
});

export const periodSchema = z.object({
  id: uuidSchema,
  plan: planSchema,
  startOn: isoDateSchema,
  endOn: isoDateSchema,
});
export type Period = z.infer<typeof periodSchema>;

/** E22 and E23 `data`: `memberRestored` is true when the period covers today and the member was archived (BR-REC-58). */
export const periodResultSchema = periodSchema.extend({
  memberRestored: z
    .boolean()
    .describe(
      "True when the member was archived and the saved period covers the gym's today; they were restored in the same transaction.",
    ),
});

/** E18 (and E17, E19, E20, E21) `data`. */
export const memberDetailSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  dateOfBirth: isoDateSchema,
  age: z.number().int().describe("Whole years on the gym's today."),
  sex: z.enum(SEXES),
  joinedOn: isoDateSchema,
  objective: z.enum(OBJECTIVES).nullable(),
  notes: z.string().nullable(),
  archivedAt: isoDateTimeSchema.nullable().describe("null = not archived."),
  membership: membershipDetailSchema,
  periods: z
    .array(periodSchema)
    .describe("Every period, newest first (startOn descending)."),
});
export type MemberDetail = z.infer<typeof memberDetailSchema>;

// ─── Field rules (BR-REC-03, 45, 46, 49) ────────────────────────────────────

/** Spaces, tabs, dashes and brackets are not part of a phone number (BR-REC-46). */
const PHONE_NOISE = /[\s\-()[\]]/g;
/** Optional leading `+`, then 10-15 digits. */
const PHONE_PATTERN = /^\+?\d{10,15}$/;

/** `"+91 98450-12345"` -> `"+919845012345"`. The form that is stored, returned and matched. */
export function cleanPhone(raw: string): string {
  return raw.replace(PHONE_NOISE, "");
}

/** Digits only, `+` dropped: what `members.phone_digits` holds (two phones are "the same" on their last 10). */
export function phoneDigits(cleaned: string): string {
  return cleaned.replace(/\D/g, "");
}

/** Outer spaces trimmed, runs of whitespace collapsed to one space, then 2-80 characters (BR-REC-45). */
export const fullNameSchema = z
  .string()
  .trim()
  .overwrite((value) => value.replace(/\s+/g, " "))
  .min(2)
  .max(80)
  .describe("2-80 characters after trimming; runs of spaces collapse to one.");

/** Cleaned by `cleanPhone`, then `+`? and 10-15 digits; the cleaned form is what comes back (BR-REC-46). */
export const phoneSchema = z
  .string()
  .overwrite(cleanPhone)
  .regex(PHONE_PATTERN, "Phone must be 10-15 digits")
  .describe(
    "Spaces, dashes and brackets are removed; optional leading +; then 10-15 digits.",
  );

const emptyToNull = (value: string | null): string | null =>
  value === null || value === "" ? null : value;

/** Trimmed; empty or null -> null; otherwise must look like an email (BR-REC-45). */
export const emailSchema = z
  .string()
  .trim()
  .nullable()
  .transform(emptyToNull)
  .pipe(z.email().nullable())
  .describe("Trimmed; empty = null; otherwise must look like an email.");

export const NOTES_MAX_LENGTH = 1000;

/** Trimmed; empty or null -> null; at most 1,000 characters after trimming (BR-REC-45). */
export const notesSchema = z
  .string()
  .trim()
  .max(NOTES_MAX_LENGTH)
  .nullable()
  .transform(emptyToNull)
  .pipe(z.string().max(NOTES_MAX_LENGTH).nullable())
  .describe("Trimmed, at most 1,000 characters; empty = null.");

/** Editable member fields. `null` clears the optional ones. */
const memberFields = {
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: emailSchema,
  dateOfBirth: isoDateSchema,
  sex: z.enum(SEXES),
  joinedOn: isoDateSchema,
  objective: z.enum(OBJECTIVES).nullable(),
  notes: notesSchema,
};

// ─── E16 list ───────────────────────────────────────────────────────────────

/**
 * `q`: trimmed, 2+ characters (BR-REC-07). `phone`: cleaned like a member's phone,
 * so fewer than 10 digits is a 400; it matches on the last 10 digits (BR-REC-46, 47).
 * `sortBy` defaults to `name`; with `q` and `name` the prefix-first order applies (BR-REC-56).
 */
export const memberListQuerySchema = sortedListQuerySchema(
  MEMBER_SORT_FIELDS,
).extend({
  sortBy: z.enum(MEMBER_SORT_FIELDS).default("name"),
  q: z
    .string()
    .trim()
    .min(2)
    .optional()
    .describe("Trimmed, 2+ characters: part of the name, email or phone."),
  phone: phoneSchema
    .describe(
      "Cleaned like a member's phone (fewer than 10 digits = 400); matches members whose last 10 digits are the same.",
    )
    .optional(),
  status: z
    .enum(MEMBER_STATUS_FILTERS)
    .describe(
      "Omitted = non-archived; active|expiring|expired = non-archived with that membership status; archived = archived only; any = all.",
    )
    .optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const memberListItemSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  phone: z.string(),
  lastAssessedOn: isoDateSchema
    .nullable()
    .describe("Latest assessment day; null = never assessed."),
  archivedAt: isoDateTimeSchema.nullable().describe("null = not archived."),
  membership: membershipSummarySchema,
});
export type MemberListItem = z.infer<typeof memberListItemSchema>;

// ─── E17 create, E19 update ─────────────────────────────────────────────────

export const firstPeriodBodySchema = z.object({
  plan: planSchema,
  startOn: isoDateSchema,
});

/** E17. Header `Idempotency-Key` (UUID) is required: see `IDEMPOTENCY_KEY_HEADER`. */
export const createMemberBodySchema = z.object({
  fullName: memberFields.fullName,
  phone: memberFields.phone,
  email: memberFields.email.optional(),
  dateOfBirth: memberFields.dateOfBirth,
  sex: memberFields.sex,
  joinedOn: memberFields.joinedOn,
  objective: memberFields.objective.optional(),
  notes: memberFields.notes.optional(),
  firstPeriod: firstPeriodBodySchema,
});
export type CreateMemberBody = z.infer<typeof createMemberBodySchema>;

/** E19: any member field (not the periods), unknown fields rejected, at least one. */
export const updateMemberBodySchema = updateBodySchema(memberFields);
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>;

// ─── E22, E23 periods ───────────────────────────────────────────────────────

export const periodParamsSchema = z.object({
  memberId: uuidSchema,
  periodId: uuidSchema,
});

/** E22. Header `Idempotency-Key` (UUID) is required. The end date is set by the service. */
export const createPeriodBodySchema = z.object({
  plan: planSchema,
  startOn: isoDateSchema,
});
export type CreatePeriodBody = z.infer<typeof createPeriodBodySchema>;

/** E23. */
export const updatePeriodBodySchema = updateBodySchema({
  plan: planSchema,
  startOn: isoDateSchema,
});
export type UpdatePeriodBody = z.infer<typeof updatePeriodBodySchema>;

// ─── E24 memberships ending ─────────────────────────────────────────────────

/** `status` is required: the Ending and Ended tabs are separate lists. */
export const endingMembershipsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ENDING_STATUSES),
});
export type EndingMembershipsQuery = z.infer<
  typeof endingMembershipsQuerySchema
>;

export const endingMembershipItemSchema = z.object({
  memberId: uuidSchema,
  fullName: z.string(),
  phone: z.string(),
  plan: planSchema,
  endOn: isoDateSchema,
  daysLeft: z.number().int().describe(DAYS_LEFT_TEXT),
});
export type EndingMembershipItem = z.infer<typeof endingMembershipItemSchema>;
