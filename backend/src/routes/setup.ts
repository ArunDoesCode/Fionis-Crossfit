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
// Limits that OpenAPI cannot show (trim, refines, "every id") are spelled out in `notes`.
const TRIM_NOTE =
  "`name` is trimmed first, then must be 2-40 characters; NAME_TAKEN compares trimmed names ignoring case (C2).";
const ORDER_NOTE =
  "At least one id, no id twice (400 VALIDATION_ERROR). Every item of the set, on and off, must be listed once; any missing, extra or foreign id is 400 VALIDATION_ERROR (C7).";
const METRIC_RULES_NOTE =
  "400 VALIDATION_ERROR: `plausibleMin` must be below `plausibleMax` when both are numbers (issue path `plausibleMin`); `intervalCount` + `intervalUnit` both set or both null (path `intervalCount`); `tableGroup` + `tablePart` both set or both null (path `tableGroup`). `tableGroup` is trimmed first, then 2-40 characters (C2).";
const DURATION_NOTE =
  "A duration (Time) measurement always gets unit `min:sec` and 0 decimals, whatever the request sends; its check range is in seconds (C3).";

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
      "`gymName` is trimmed first, then 2-60 characters. `timezone` must be an IANA name the server knows, e.g. Asia/Kolkata; unknown names and offsets such as +05:30 are 400 VALIDATION_ERROR (not visible in the schema). Lead days are whole numbers within their range (C1).",
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
      "Ordered by setup order (`sortOrder`), measurements likewise.",
      "Without `includeInactive=true`, off assessments and off measurements are left out. With it, all are returned, each with its own `isActive`. Turning an assessment off does not change its measurements' own `isActive`; it hides them while it is off (C5).",
      "`hasValues`: a measurement has at least one stored value; an assessment has one in any of its measurements (C6).",
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
    notes: [TRIM_NOTE, "Added last, On, with no measurements (C7)."],
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
    notes: [
      "`typeIds` lists every assessment once each, in the new order.",
      ORDER_NOTE,
    ],
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
    notes: [
      "Unknown fields rejected; at least one field.",
      TRIM_NOTE,
      "`isActive: false` hides the assessment and its measurements without changing their own `isActive` (C5).",
      "The answer lists all of the assessment's measurements, on and off, in setup order, each with its own `isActive`; `includeInactive` belongs to E09 only.",
    ],
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
    notes: [
      "`name` is unique inside the assessment (on and off ones), compared trimmed and ignoring case (C2).",
      METRIC_RULES_NOTE,
      DURATION_NOTE,
      "Added last and On. Defaults when omitted: unit empty, decimals 1 (0 for a duration), no check range, no own repeat, no report-table place.",
    ],
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
      ORDER_NOTE,
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
      "`name` is unique inside its assessment (on and off ones), compared trimmed and ignoring case (C2).",
      METRIC_RULES_NOTE,
      "When only one side of a pair or of the check range is in the body, the result is checked against the stored values; a pair or range that would end up broken is 400 VALIDATION_ERROR (C8).",
      DURATION_NOTE,
      "A change from Time to Number without a `unit` in the body leaves the unit empty (C3).",
      "METRIC_LOCKED: datatype and unit cannot change once any value exists (BR-REC-11). Only a real change counts; sending the stored value again is fine (C4).",
    ],
  },
  notImplemented,
);

export { setupRouter as setupRoutes };
