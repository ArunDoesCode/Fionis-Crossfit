import { Hono } from "hono";

import { etagMiddleware } from "../lib/etag";
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
  assessmentTypeListQuerySchema,
  assessmentTypeOrderBodySchema,
  assessmentTypeSchema,
  createAssessmentTypeBodySchema,
  createMetricBodySchema,
  metricIdParamsSchema,
  metricOrderBodySchema,
  metricSchema,
  orderResultSchema,
  settingsSchema,
  typeIdParamsSchema,
  updateAssessmentTypeBodySchema,
  updateMetricBodySchema,
  updateSettingsBodySchema,
} from "../types/setup.types";
import { END_POINTS, MAIN_ROUTES } from "./end-points";
import { ANY_AUTHENTICATED, notImplemented, routeMounter } from "./mount-route";

// Owner: setup stream. E07-E15. Handlers answer 501 until Stream C builds them.
const setupRouter = new Hono<AppEnv>();
const route = routeMounter(setupRouter, MAIN_ROUTES.setup);
const EP = END_POINTS.setup;
const TAGS = ["setup"];

const ETAG_NOTE =
  "Sends an `ETag`; a matching `If-None-Match` gets 304 with no body (BR-REC-160).";
const NAME_TAKEN = errorResponse(["NAME_TAKEN"]);

route(
  EP.settings,
  {
    method: "GET",
    tags: TAGS,
    summary: "E07 Gym settings",
    auth: ANY_AUTHENTICATED,
    responses: {
      "200": successResponse(settingsSchema),
      "401": unauthorizedResponse,
    },
    notes: [ETAG_NOTE],
  },
  notImplemented,
  [etagMiddleware()],
);

route(
  EP.settings,
  {
    method: "PATCH",
    tags: TAGS,
    summary: "E08 Change gym settings",
    auth: ANY_AUTHENTICATED,
    request: { body: updateSettingsBodySchema },
    responses: {
      "200": successResponse(settingsSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
    },
    notes: [
      "Any of the settings; unknown fields rejected; at least one field.",
    ],
  },
  notImplemented,
);

route(
  EP.types,
  {
    method: "GET",
    tags: TAGS,
    summary: "E09 Assessment catalog (assessments with their measurements)",
    auth: ANY_AUTHENTICATED,
    request: { query: assessmentTypeListQuerySchema },
    responses: {
      "200": paginatedResponse(assessmentTypeSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
    },
    pagination: { sortableFields: [], searchable: false },
    notes: [
      "Ordered by setup order (`sortOrder`). Inactive ones only with includeInactive=true.",
      ETAG_NOTE,
    ],
  },
  notImplemented,
  [etagMiddleware()],
);

route(
  EP.types,
  {
    method: "POST",
    tags: TAGS,
    summary: "E10 Add an assessment",
    auth: ANY_AUTHENTICATED,
    request: { body: createAssessmentTypeBodySchema },
    responses: {
      "201": successResponse(assessmentTypeSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
      "409": NAME_TAKEN,
    },
  },
  notImplemented,
);

// Static `/assessment-types/order` is declared before the `:typeId` routes.
route(
  EP.typeOrder,
  {
    method: "PUT",
    tags: TAGS,
    summary: "E12 Set the order of the assessments",
    auth: ANY_AUTHENTICATED,
    request: { body: assessmentTypeOrderBodySchema },
    responses: {
      "200": successResponse(orderResultSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
    },
    notes: ["`typeIds` lists every assessment once each, in the new order."],
  },
  notImplemented,
);

route(
  EP.type,
  {
    method: "PATCH",
    tags: TAGS,
    summary: "E11 Change or turn off an assessment",
    auth: ANY_AUTHENTICATED,
    request: {
      params: typeIdParamsSchema,
      body: updateAssessmentTypeBodySchema,
    },
    responses: {
      "200": successResponse(assessmentTypeSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
      "409": NAME_TAKEN,
    },
    notes: ["Unknown fields rejected; at least one field."],
  },
  notImplemented,
);

route(
  EP.typeMetrics,
  {
    method: "POST",
    tags: TAGS,
    summary: "E13 Add a measurement to an assessment",
    auth: ANY_AUTHENTICATED,
    request: { params: typeIdParamsSchema, body: createMetricBodySchema },
    responses: {
      "201": successResponse(metricSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
      "409": NAME_TAKEN,
    },
  },
  notImplemented,
);

route(
  EP.typeMetricOrder,
  {
    method: "PUT",
    tags: TAGS,
    summary: "E15 Set the order of an assessment's measurements",
    auth: ANY_AUTHENTICATED,
    request: { params: typeIdParamsSchema, body: metricOrderBodySchema },
    responses: {
      "200": successResponse(orderResultSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "`metricIds` lists every measurement of the assessment once each, in the new order.",
    ],
  },
  notImplemented,
);

route(
  EP.metric,
  {
    method: "PATCH",
    tags: TAGS,
    summary: "E14 Change or turn off a measurement",
    auth: ANY_AUTHENTICATED,
    request: { params: metricIdParamsSchema, body: updateMetricBodySchema },
    responses: {
      "200": successResponse(metricSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
      "409": errorResponse(["NAME_TAKEN", "METRIC_LOCKED"]),
    },
    notes: [
      "Unknown fields rejected; at least one field.",
      "METRIC_LOCKED: datatype and unit cannot change once any value exists (BR-REC-11).",
    ],
  },
  notImplemented,
);

export { setupRouter as setupRoutes };
