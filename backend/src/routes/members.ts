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
  "Requires header `Idempotency-Key: <uuid>` (BR-REC-156): a repeat with the same key within 48 h returns the first answer; the same key with a different body is 422 IDEMPOTENCY_KEY_REUSED.";
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
      "`q` (2+ characters) matches name, phone or email; `phone` matches the last 10 digits.",
      "Without `status`, archived members are left out; `status=any` includes them.",
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
    },
    notes: [IDEMPOTENCY_NOTE],
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
      "400": badRequestResponse("INVALID_JSON", "DATE_IN_FUTURE"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: ["Unknown fields rejected; at least one field."],
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
    },
    notes: [
      IDEMPOTENCY_NOTE,
      "`memberRestored` is true when the period covers today and the member was archived (BR-REC-58).",
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
      "Unknown fields rejected; at least one field. Periods are never deleted.",
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
      "`status=expiring`: soonest end first. `status=expired`: ended in the last 30 days, most recent first. Archived members are never listed (BR-REC-53).",
    ],
  },
  notImplemented,
);

export { membersRouter as membersRoutes };
