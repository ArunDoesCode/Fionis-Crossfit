import { Hono } from "hono";

import {
  badRequestResponse,
  errorResponse,
  notFoundResponse,
  paginatedResponse,
  successResponse,
  unauthorizedResponse,
} from "../lib/response-schemas";
import type { AppEnv } from "../lib/types";
import {
  assessmentDetailSchema,
  assessmentIdParamsSchema,
  assessmentListItemSchema,
  assessmentListQuerySchema,
  deleteAssessmentResultSchema,
  entryFormQuerySchema,
  entryFormSchema,
  saveAssessmentBodySchema,
  saveAssessmentResultSchema,
  updateAssessmentBodySchema,
} from "../types/assessments.types";
import { memberIdParamsSchema } from "../types/common.types";
import { END_POINTS, MAIN_ROUTES } from "./end-points";
import { ANY_AUTHENTICATED, notImplemented, routeMounter } from "./mount-route";

// Owner: assessments stream. E25-E30. Handlers answer 501 until Stream D builds them.
const assessmentsRouter = new Hono<AppEnv>();
const route = routeMounter(assessmentsRouter, MAIN_ROUTES.assessments);
const EP = END_POINTS.assessments;
const TAGS = ["assessments"];

route(
  EP.entryForm,
  {
    method: "GET",
    tags: TAGS,
    summary:
      "E25 Entry form: measurements with previous values and any saved assessment",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema, query: entryFormQuerySchema },
    responses: {
      "200": successResponse(entryFormSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "`previous` is the latest value dated before `date` (BR-REC-81). Durations are seconds.",
    ],
  },
  notImplemented,
);

route(
  EP.collection,
  {
    method: "POST",
    tags: TAGS,
    summary:
      "E26 Save an assessment (creates, or edits the one for member + type + date)",
    auth: ANY_AUTHENTICATED,
    request: { body: saveAssessmentBodySchema },
    responses: {
      "200": successResponse(saveAssessmentResultSchema),
      "400": errorResponse([
        "VALIDATION_ERROR",
        "INVALID_JSON",
        "DATE_IN_FUTURE",
        "NO_VALUES",
        "METRIC_NOT_IN_TYPE",
      ]),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "Upsert: always 200; `created` says whether a new assessment was made. `value: null` removes a saved value; at most 60 values.",
    ],
  },
  notImplemented,
);

route(
  EP.collection,
  {
    method: "GET",
    tags: TAGS,
    summary: "E27 A member's assessments, newest first",
    auth: ANY_AUTHENTICATED,
    request: { query: assessmentListQuerySchema },
    responses: {
      "200": paginatedResponse(assessmentListItemSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
    },
    pagination: { sortableFields: [], searchable: false },
    notes: [
      "Sorted by date then id; only `sortDir` is selectable (default `desc`).",
    ],
  },
  notImplemented,
);

route(
  EP.item,
  {
    method: "GET",
    tags: TAGS,
    summary: "E28 One assessment with its values",
    auth: ANY_AUTHENTICATED,
    request: { params: assessmentIdParamsSchema },
    responses: {
      "200": successResponse(assessmentDetailSchema),
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
    summary: "E29 Move an assessment's date or mark it estimated",
    auth: ANY_AUTHENTICATED,
    request: {
      params: assessmentIdParamsSchema,
      body: updateAssessmentBodySchema,
    },
    responses: {
      "200": successResponse(assessmentDetailSchema),
      "400": badRequestResponse("INVALID_JSON", "DATE_IN_FUTURE"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
      "409": errorResponse(["ASSESSMENT_DATE_TAKEN"]),
    },
    notes: [
      "Unknown fields rejected; at least one field. Moving the date moves its values.",
    ],
  },
  notImplemented,
);

route(
  EP.item,
  {
    method: "DELETE",
    tags: TAGS,
    summary: "E30 Delete an assessment with its values",
    auth: ANY_AUTHENTICATED,
    request: { params: assessmentIdParamsSchema },
    responses: {
      "200": successResponse(deleteAssessmentResultSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "The one hard delete besides sign-ins and idempotency keys (BR-REC-165).",
    ],
  },
  notImplemented,
);

export { assessmentsRouter as assessmentsRoutes };
