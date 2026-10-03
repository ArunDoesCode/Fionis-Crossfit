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

// Owner: members stream. Endpoints E16-E24 (api-contract.md). Field-level rules
// (name 2-80 trimmed, phone 10-15 digits, email shape, notes <= 1,000, future
// dates, START_BEFORE_JOIN, PERIOD_OVERLAP) are the members stream's to add.

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

/** The member's membership as derived from the latest period (BR-REC-52). `daysLeft` is negative once ended. */
export const membershipSummarySchema = z.object({
  status: z.enum(MEMBERSHIP_STATUSES),
  plan: planSchema,
  endOn: isoDateSchema,
  daysLeft: z.number().int(),
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
  memberRestored: z.boolean(),
});

/** E18 (and E17, E19, E20, E21) `data`. */
export const memberDetailSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  dateOfBirth: isoDateSchema,
  age: z.number().int(),
  sex: z.enum(SEXES),
  joinedOn: isoDateSchema,
  objective: z.enum(OBJECTIVES).nullable(),
  notes: z.string().nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  membership: membershipDetailSchema,
  periods: z.array(periodSchema),
});
export type MemberDetail = z.infer<typeof memberDetailSchema>;

/** Editable member fields. `null` clears the optional ones. */
const memberFields = {
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  dateOfBirth: isoDateSchema,
  sex: z.enum(SEXES),
  joinedOn: isoDateSchema,
  objective: z.enum(OBJECTIVES).nullable(),
  notes: z.string().nullable(),
};

// ─── E16 list ───────────────────────────────────────────────────────────────

/** `q` needs 2+ characters (BR-REC-07); `phone` matches the last 10 digits (BR-REC-46). */
export const memberListQuerySchema = sortedListQuerySchema(
  MEMBER_SORT_FIELDS,
).extend({
  q: z.string().min(2).optional(),
  phone: z.string().min(1).optional(),
  status: z.enum(MEMBER_STATUS_FILTERS).optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const memberListItemSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  phone: z.string(),
  lastAssessedOn: isoDateSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
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
  daysLeft: z.number().int(),
});
export type EndingMembershipItem = z.infer<typeof endingMembershipItemSchema>;
