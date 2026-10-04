import { Hono } from "hono";

import { idempotency } from "../lib/idempotency";
import {
  badRequestResponse,
  errorResponse,
  notFoundResponse,
  paginatedResponse,
  successResponse,
  unauthorizedResponse,
} from "../lib/response-schemas";
import type { AppEnv } from "../lib/types";
import { memberIdParamsSchema } from "../types/common.types";
import {
  createMemberBodySchema,
  createPeriodBodySchema,
  endingMembershipItemSchema,
  endingMembershipsQuerySchema,
  MEMBER_SORT_FIELDS,
  memberDetailSchema,
  memberListItemSchema,
  memberListQuerySchema,
  periodParamsSchema,
  periodResultSchema,
  updateMemberBodySchema,
  updatePeriodBodySchema,
} from "../types/members.types";
import { END_POINTS, MAIN_ROUTES } from "./end-points";
import { ANY_AUTHENTICATED, notImplemented, routeMounter } from "./mount-route";

// Owner: members stream. E16-E24. Handlers answer 501 until Stream B builds them.
const membersRouter = new Hono<AppEnv>();
const route = routeMounter(membersRouter, MAIN_ROUTES.members);
const EP = END_POINTS.members;
const TAGS = ["members"];

const IDEMPOTENCY_NOTE =
  "Requires header `Idempotency-Key: <uuid>` (BR-REC-156): a repeat with the same key within 48 h returns the first answer; the same key with a different body is 422 IDEMPOTENCY_KEY_REUSED; a duplicate that arrives while the first is still running waits up to 10 s, then gets 429 RATE_LIMITED. Only a successful (2xx) answer is stored: a failed request frees its key.";
const FIELD_RULES_NOTE =
  'Field rules (BR-REC-03, 45, 46, 49): `fullName` trimmed, runs of spaces collapsed, 2-80 characters; `phone` with spaces, dashes and brackets removed, optional leading +, 10-15 digits, stored and returned in that cleaned form ("+91 98450-12345" -> "+919845012345"); `email` trimmed, must look like an email, empty = null; `notes` trimmed, at most 1,000 characters, empty = null; `sex` male|female; `objective` fat_loss|strength|general_fitness|other or null.';
const FUTURE_DATE_NOTE =
  '`DATE_IN_FUTURE` (400, `details: { field: "dateOfBirth" | "joinedOn" }`) when that day is after the gym\'s today (gym time zone from the settings); `dateOfBirth` is checked before `joinedOn` (BR-REC-48).';
const MEMBER_DATA_NOTE =
  "`data` is the member as E18 (state after the change).";
const RESTORE_NOTE =
  "`memberRestored` is true when the member was archived and the saved period covers the gym's today (`startOn` <= today <= `endOn`); `archivedAt` is then cleared in the same transaction (BR-REC-58). Otherwise false and an archived member stays archived.";
const MEMBER_FIELD_ERRORS = errorResponse([
  "VALIDATION_ERROR",
  "INVALID_JSON",
  "DATE_IN_FUTURE",
  "START_BEFORE_JOIN",
  "IDEMPOTENCY_KEY_MISSING",
]);

route(
  EP.collection,
  {
    method: "GET",
    tags: TAGS,
    summary: "E16 Find and list members",
    auth: ANY_AUTHENTICATED,
    request: { query: memberListQuerySchema },
    responses: {
      "200": paginatedResponse(memberListItemSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
    },
    pagination: { sortableFields: [...MEMBER_SORT_FIELDS], searchable: true },
    notes: [
      "`q`: trimmed, 2+ characters (else 400). Matches part of the name or email (case-insensitive) and, when `q` without spaces, dashes, brackets and `+` is only digits, part of the phone digits. `%` and `_` are plain characters (BR-REC-07, 56).",
      "`phone`: cleaned like a member's phone, fewer than 10 digits = 400; matches members whose last 10 digits are the same (BR-REC-46, 47). Send `+` as `%2B` (a bare `+` reads as a space and is dropped, which does not change the match). With `q` and/or `status`, every filter must match.",
      "`status`: omitted = non-archived; `active`|`expiring`|`expired` = non-archived with that membership status (BR-REC-52); `archived` = archived only; `any` = all (BR-REC-06, 57).",
      "Order: `sortBy` defaults to `name`, `sortDir` asc = A-Z. With `q` and `sortBy` omitted or `name`: names starting with `q` first, then the rest, each by name then id (BR-REC-56). `joinedOn` and `lastAssessedOn` break ties by name then id; never-assessed members come last in both directions.",
      "Item: `membership` is from the latest period by start; `lastAssessedOn` is the latest assessment day, null = never assessed; `phone` is the cleaned form.",
    ],
  },
  notImplemented,
);

route(
  EP.collection,
  {
    method: "POST",
    tags: TAGS,
    summary: "E17 Add a member with the first membership period",
    auth: ANY_AUTHENTICATED,
    request: { body: createMemberBodySchema },
    responses: {
      "201": successResponse(memberDetailSchema),
      "400": MEMBER_FIELD_ERRORS,
      "401": unauthorizedResponse,
      "422": errorResponse(["IDEMPOTENCY_KEY_REUSED"]),
      "429": errorResponse(["RATE_LIMITED"]),
    },
    notes: [
      IDEMPOTENCY_NOTE,
      FIELD_RULES_NOTE,
      "`firstPeriod` { plan, startOn } is required (BR-REC-05); there is no default plan; its `endOn` = `membershipEnd(plan, startOn)` (BR-REC-51). A start in the past is allowed.",
      FUTURE_DATE_NOTE,
      "`START_BEFORE_JOIN` (400) when `firstPeriod.startOn` is before `joinedOn` (BR-REC-50); checked after the future-date check. A phone already used by another member is never refused (BR-REC-04).",
      `201. ${MEMBER_DATA_NOTE} Change log, same transaction: \`member.create\` (entity \`member\`) and \`membership.create\` (entity \`membership_period\`) for the first period.`,
    ],
  },
  notImplemented,
  [idempotency()],
);

route(
  EP.item,
  {
    method: "GET",
    tags: TAGS,
    summary: "E18 One member with membership and periods",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema },
    responses: {
      "200": successResponse(memberDetailSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "Works for archived members. `membership` is the latest period by start (with its `startOn`); `daysLeft` 0 = ends today, negative = ended; `age` on the gym's today; `periods` newest first (`startOn` descending); `archivedAt` null = not archived (BR-REC-59, 172).",
    ],
  },
  notImplemented,
);

route(
  EP.item,
  {
    method: "PATCH",
    tags: TAGS,
    summary: "E19 Edit a member (archived members too)",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema, body: updateMemberBodySchema },
    responses: {
      "200": successResponse(memberDetailSchema),
      "400": badRequestResponse(
        "INVALID_JSON",
        "DATE_IN_FUTURE",
        "START_BEFORE_JOIN",
      ),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "Unknown fields rejected (`periods` and `archivedAt` cannot be set here); at least one field; `null` clears `email`, `objective` and `notes`. Archived members can be edited (BR-REC-58).",
      FIELD_RULES_NOTE,
      `${FUTURE_DATE_NOTE} Only for the fields that are sent.`,
      "`START_BEFORE_JOIN` (400) when `joinedOn` is sent and is after the `startOn` of any of the member's periods (BR-REC-50, 55).",
      `200. ${MEMBER_DATA_NOTE} Change log: \`member.update\` with the changed fields only; a request that changes nothing writes no row.`,
    ],
  },
  notImplemented,
);

route(
  EP.archive,
  {
    method: "POST",
    tags: TAGS,
    summary: "E20 Archive a member",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema },
    responses: {
      "200": successResponse(memberDetailSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      `Sets \`archivedAt\` to now. Already archived: 200 unchanged (the first \`archivedAt\` is kept, no change-log row). ${MEMBER_DATA_NOTE} Change log: \`member.archive\`.`,
    ],
  },
  notImplemented,
);

route(
  EP.restore,
  {
    method: "POST",
    tags: TAGS,
    summary: "E21 Restore an archived member",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema },
    responses: {
      "200": successResponse(memberDetailSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      `Clears \`archivedAt\`. Not archived: 200 unchanged, no change-log row. ${MEMBER_DATA_NOTE} Change log: \`member.restore\`.`,
    ],
  },
  notImplemented,
);

route(
  EP.periods,
  {
    method: "POST",
    tags: TAGS,
    summary: "E22 Add a membership period (renew)",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema, body: createPeriodBodySchema },
    responses: {
      "201": successResponse(periodResultSchema),
      "400": errorResponse([
        "VALIDATION_ERROR",
        "INVALID_JSON",
        "START_BEFORE_JOIN",
        "IDEMPOTENCY_KEY_MISSING",
      ]),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
      "409": errorResponse(["PERIOD_OVERLAP"]),
      "422": errorResponse(["IDEMPOTENCY_KEY_REUSED"]),
      "429": errorResponse(["RATE_LIMITED"]),
    },
    notes: [
      IDEMPOTENCY_NOTE,
      "`endOn` = `membershipEnd(plan, startOn)` (BR-REC-51); a start in the future is allowed (renewed early). Archived members can be renewed (BR-REC-58).",
      "`START_BEFORE_JOIN` (400) when `startOn` is before the member's `joinedOn` (BR-REC-50). `PERIOD_OVERLAP` (409) when [`startOn`, `endOn`] (both days included) shares a day with any other period of the member (BR-REC-09). Order: 404, 400, 409.",
      RESTORE_NOTE,
      "201. Change log: `membership.create` (entity `membership_period`), plus `member.restore` when the member was restored.",
    ],
  },
  notImplemented,
  [idempotency()],
);

route(
  EP.period,
  {
    method: "PATCH",
    tags: TAGS,
    summary: "E23 Edit a membership period",
    auth: ANY_AUTHENTICATED,
    request: { params: periodParamsSchema, body: updatePeriodBodySchema },
    responses: {
      "200": successResponse(periodResultSchema),
      "400": badRequestResponse("INVALID_JSON", "START_BEFORE_JOIN"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
      "409": errorResponse(["PERIOD_OVERLAP"]),
    },
    notes: [
      "`plan` and/or `startOn`; unknown fields rejected; at least one field; `endOn` is recalculated from the resulting plan and start (BR-REC-55). Periods are never deleted.",
      "The period must belong to the member, else 404. `START_BEFORE_JOIN` (400) and `PERIOD_OVERLAP` (409) as E22, checked against the member's OTHER periods.",
      RESTORE_NOTE,
      "A save that changes nothing is 200 and writes no `membership.update` row; the restore rule still applies. Change log: `membership.update` with the changed fields (`endOn` included), plus `member.restore` when the member was restored.",
    ],
  },
  notImplemented,
);

route(
  EP.ending,
  {
    method: "GET",
    tags: TAGS,
    summary: "E24 Memberships ending soon or recently ended",
    auth: ANY_AUTHENTICATED,
    request: { query: endingMembershipsQuerySchema },
    responses: {
      "200": paginatedResponse(endingMembershipItemSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
    },
    pagination: { sortableFields: [], searchable: false },
    notes: [
      "One row per member, from the member's latest period by start; archived members are never listed (BR-REC-53). No `sortBy`: the order is fixed.",
      "`status=expiring`: latest period is Ends soon (BR-REC-52), by `endOn` ascending, then name, then id.",
      "`status=expired`: latest period ended with `endOn` >= the gym's today minus 30 days (ended 30 days ago is listed, 31 is not), by `endOn` descending, then name, then id.",
      "`daysLeft` as in E16: 0 = ends today, negative = ended.",
    ],
  },
  notImplemented,
);

export { membersRouter as membersRoutes };
