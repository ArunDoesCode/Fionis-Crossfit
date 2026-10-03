import { Hono } from "hono";
import { z } from "zod";

import {
  badRequestResponse,
  notFoundResponse,
  paginatedResponse,
  successResponse,
  unauthorizedResponse,
} from "../lib/response-schemas";
import type { AppEnv } from "../lib/types";
import { memberIdParamsSchema } from "../types/common.types";
import {
  clearDueActionResultSchema,
  dueActionBodySchema,
  dueActionParamsSchema,
  dueActionResultSchema,
  dueListItemSchema,
  dueListQuerySchema,
  memberDueItemSchema,
} from "../types/due.types";
import { END_POINTS, MAIN_ROUTES } from "./end-points";
import { ANY_AUTHENTICATED, notImplemented, routeMounter } from "./mount-route";

// Owner: due-list stream. E31-E34. Handlers answer 501 until Stream E builds them.
const dueRouter = new Hono<AppEnv>();
const route = routeMounter(dueRouter, MAIN_ROUTES.due);
const EP = END_POINTS.due;
const TAGS = ["due"];

route(
  EP.collection,
  {
    method: "GET",
    tags: TAGS,
    summary: "E31 Who is overdue or due soon (Home and Due list)",
    auth: ANY_AUTHENTICATED,
    request: { query: dueListQuerySchema },
    responses: {
      "200": paginatedResponse(dueListItemSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
    },
    pagination: { sortableFields: [], searchable: false },
    notes: [
      "One row per member per assessment. Order: Assess soon first, then most days overdue, then soonest due, then name (BR-REC-97). Archived and expired members are excluded (BR-REC-17).",
    ],
  },
  notImplemented,
);

route(
  EP.memberDue,
  {
    method: "GET",
    tags: TAGS,
    summary: "E32 One member's due status per assessment",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema },
    responses: {
      "200": successResponse(z.array(memberDueItemSchema)),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "A plain array, not paginated: one entry per turned-on assessment (bounded by the catalog).",
    ],
  },
  notImplemented,
);

route(
  EP.memberDueAction,
  {
    method: "PUT",
    tags: TAGS,
    summary: "E33 Assess soon (flag) or Remind me later (snooze)",
    auth: ANY_AUTHENTICATED,
    request: { params: dueActionParamsSchema, body: dueActionBodySchema },
    responses: {
      "200": successResponse(dueActionResultSchema),
      "400": badRequestResponse("INVALID_JSON", "SNOOZE_TOO_FAR"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "Body `{ action: 'flag' }` or `{ action: 'snooze', until: 'YYYY-MM-DD' }`. `until` is after today and at most 90 days ahead. The two replace each other.",
    ],
  },
  notImplemented,
);

route(
  EP.memberDueAction,
  {
    method: "DELETE",
    tags: TAGS,
    summary: "E34 Clear Assess soon or Remind me later",
    auth: ANY_AUTHENTICATED,
    request: { params: dueActionParamsSchema },
    responses: {
      "200": successResponse(clearDueActionResultSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
  },
  notImplemented,
);

export { dueRouter as dueRoutes };
