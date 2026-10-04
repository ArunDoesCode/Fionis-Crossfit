import { Hono } from "hono";
import { z } from "zod";

import { dueController } from "../controller/dueController";
import { asyncHandler } from "../lib/async-handler";
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
import { ANY_AUTHENTICATED, routeMounter } from "./mount-route";

// Owner: due-list stream. E31-E34.
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
      "One row per member per assessment. `items` = its turned-on measurements due on or before today + Due soon days (setup order); `dueOn` = the earliest of them; `daysOverdue` = calendar days from `dueOn` to today (0 = due today, negative = not yet due). `overdue` = `dueOn` before today, or Assess soon (`flagged`, every turned-on measurement, never in `upcoming`); `upcoming` = due today up to the Due soon window.",
      "Order, fixed (no sort params): Assess soon first, then `dueOn` ascending, then name A-Z ignoring case, then assessment setup order (BR-REC-97). Archived and Expired members are left out (BR-REC-17); a row with an active Remind me later is hidden. An unknown or turned-off `typeId` gives an empty page.",
    ],
  },
  asyncHandler(dueController.list),
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
      "A plain array, not paginated: one entry per turned-on assessment with at least one turned-on measurement, in setup order (bounded by the catalog).",
      "`state` comes from dates only; `nextDueOn` = the earliest due date of its measurements; `flagged` / `snoozedUntil` only while Assess soon / Remind me later is active; `items` = the due measurements (every turned-on one when flagged, empty when `ok`). Archived and Expired members answer too. Unknown member: 404 `NOT_FOUND`.",
    ],
  },
  asyncHandler(dueController.memberItems),
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
      "Body `{ action: 'flag' }` or `{ action: 'snooze', until: 'YYYY-MM-DD' }`; unknown keys are rejected. The two replace each other and any earlier one (`setOn` = today, the gym day).",
      "`until` must be after today (else 400 `VALIDATION_ERROR`, `details.field` = `until`) and at most today + 90 days (else 400 `SNOOZE_TOO_FAR`). Unknown member or assessment: 404 `NOT_FOUND`; archived members and turned-off assessments are accepted. Writes one change-log row, action `due_override.set`.",
    ],
  },
  asyncHandler(dueController.setAction),
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
    notes: [
      "Removes Assess soon or Remind me later; with nothing set it is still 200 `{}`. Unknown member or assessment: 404 `NOT_FOUND`. Writes one change-log row, action `due_override.clear`.",
    ],
  },
  asyncHandler(dueController.clearAction),
);

export { dueRouter as dueRoutes };
