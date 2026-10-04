import { z } from "zod";

import { DUE_OVERRIDE_KINDS } from "../lib/enums";
import {
  emptyDataSchema,
  isoDateSchema,
  paginationQuerySchema,
  uuidSchema,
} from "./common.types";

// Owner: due-list stream. Endpoints E31-E34 (api-contract.md). The maths
// (`computeDue`) and SNOOZE_TOO_FAR (until <= today + 90 days) are the due-list
// stream's. `daysOverdue` counts calendar days past `dueOn` (BR-REC-105); the
// stream decides what a not-yet-due row carries (an integer <= 0 fits this schema).

/** E31 `status` (required): the two Home / Due-list tabs. */
export const DUE_LIST_STATUSES = ["overdue", "upcoming"] as const;
export type DueListStatus = (typeof DUE_LIST_STATUSES)[number];

/** E32 `state` of one assessment for one member. */
export const DUE_STATES = ["overdue", "upcoming", "ok"] as const;
export type DueState = (typeof DUE_STATES)[number];

/** A due measurement shown as a chip. */
export const dueItemSchema = z.object({
  metricId: uuidSchema,
  name: z.string(),
});
export type DueItem = z.infer<typeof dueItemSchema>;

// ─── E31 ────────────────────────────────────────────────────────────────────

export const dueListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(DUE_LIST_STATUSES),
  typeId: uuidSchema.optional(),
});
export type DueListQuery = z.infer<typeof dueListQuerySchema>;

/** One row per member per assessment (BR-REC-16). */
export const dueListItemSchema = z.object({
  memberId: uuidSchema,
  fullName: z.string(),
  typeId: uuidSchema,
  typeName: z.string(),
  dueOn: isoDateSchema,
  daysOverdue: z.number().int(),
  flagged: z.boolean(),
  items: z.array(dueItemSchema),
});
export type DueListItem = z.infer<typeof dueListItemSchema>;

// ─── E32 ────────────────────────────────────────────────────────────────────

/** One status line per turned-on assessment (BR-REC-103). Bounded by the catalog: not paginated. */
export const memberDueItemSchema = z.object({
  typeId: uuidSchema,
  typeName: z.string(),
  state: z.enum(DUE_STATES),
  neverRecorded: z.boolean(),
  nextDueOn: isoDateSchema,
  daysOverdue: z.number().int(),
  flagged: z.boolean(),
  snoozedUntil: isoDateSchema.nullable(),
  items: z.array(dueItemSchema),
});
export type MemberDueItem = z.infer<typeof memberDueItemSchema>;

// ─── E33, E34 ───────────────────────────────────────────────────────────────

export const dueActionParamsSchema = z.object({
  memberId: uuidSchema,
  typeId: uuidSchema,
});

/** E33: "Assess soon" or "Remind me later" until a date. They replace each other (BR-REC-100). */
export const dueActionBodySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("flag") }),
  z.strictObject({ action: z.literal("snooze"), until: isoDateSchema }),
]);
export type DueActionBody = z.infer<typeof dueActionBodySchema>;

/** E33 `data`: `untilOn` is null for a flag. */
export const dueActionResultSchema = z.object({
  kind: z.enum(DUE_OVERRIDE_KINDS),
  setOn: isoDateSchema,
  untilOn: isoDateSchema.nullable(),
});
export type DueActionResult = z.infer<typeof dueActionResultSchema>;

/** E34 `data`. */
export const clearDueActionResultSchema = emptyDataSchema;
