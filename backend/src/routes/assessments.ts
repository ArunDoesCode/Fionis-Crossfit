import { Hono } from "hono";

import { assessmentsController } from "../controller/assessmentsController";
import { asyncHandler } from "../lib/async-handler";
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
import { ANY_AUTHENTICATED, routeMounter } from "./mount-route";

// Owner: assessments stream. E25-E30.
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
      "`previous` is the stored value with the latest date strictly before `date`, from any assessment of the member; `previous.isEstimated` is that assessment's flag (BR-REC-81, D5). Durations are seconds.",
      "`metrics`: the type's turned-on measurements in setup order (none while the assessment is off) plus any measurement, on or off, that holds a value in `existing`. Works for a turned-off assessment and an archived member (D4).",
      "Only the shape of `date` is checked: a future date just returns a form (D1). Unknown member or type: 404.",
    ],
  },
  asyncHandler(assessmentsController.entryForm),
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
      "Upsert: always 200; `created` says whether a new assessment was made. A measurement left out of `values` is untouched; `value: n` sets it; `value: null` removes the stored value (nothing happens when none is stored). `isEstimated` always replaces the stored flag (D2).",
      "`saved` = non-null entries written; `removed` = stored values deleted by `null` entries. 400 `NO_VALUES` when the save would leave the assessment with no stored value at all, and nothing is written: a new assessment with no non-null value, or an edit whose `null` entries remove every remaining value (remove a whole assessment with E30). An edit may send only the changed fields, or `values: []` when only `isEstimated` changes (200, `saved` 0, `removed` 0, `created` false, one change-log row); a stored value that is not sent stays exactly as stored, never re-rounded (D2).",
      "Shape limits (400 `VALIDATION_ERROR`, `details.issues[{ path, message }]`): at most 60 values; a measurement id at most once (path `values.<i>.metricId`); `value` present, a finite number, absolute value at most 999,999,999.999 (path `values.<i>.value`); `date` a real `YYYY-MM-DD` day. Not visible in the schema: the service also refuses a Time (duration) value outside 0 to 35,999 seconds, and a value whose rounded form leaves its limit (D3).",
      "Each value is rounded before it is stored: Number to the measurement's decimals, Time to whole seconds (BR-REC-76, D3). `METRIC_NOT_IN_TYPE`: a measurement id of another type or unknown; on or off measurements of the given type are accepted (D4).",
      "Error order: 404 (unknown member or type) -> 400 `DATE_IN_FUTURE` (later than gym today; no lower bound, D1) -> 400 `METRIC_NOT_IN_TYPE` -> 400 `VALIDATION_ERROR` (Time or rounded limit) -> 400 `NO_VALUES`. Shape errors come before all of them. Archived members work. No `Idempotency-Key`: a retry is the same upsert (D6).",
    ],
  },
  asyncHandler(assessmentsController.save),
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
      "Sorted by date then id; only `sortDir` is selectable (default `desc`); there is no `sortBy`. `typeId` filters by assessment.",
      "A member with nothing, or an unknown `memberId` / `typeId`, gives an empty list (no 404); `valueCount` = stored values (D10).",
    ],
  },
  asyncHandler(assessmentsController.list),
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
    notes: [
      "`values` holds every stored value, on or off measurements, in setup order; durations in seconds (D9).",
    ],
  },
  asyncHandler(assessmentsController.get),
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
      "Unknown fields rejected; at least one field. Moving the date moves its values in the same transaction (D8).",
      "Error order: 404 -> 400 `DATE_IN_FUTURE` (later than gym today) -> 409 `ASSESSMENT_DATE_TAKEN` (another assessment of this member + type already has that date; the date it already has is not taken). Shape errors come first.",
    ],
  },
  asyncHandler(assessmentsController.update),
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
      "The one hard delete besides sign-ins and idempotency keys (BR-REC-165). `removed` = how many values went with it (D9); deleting again is 404.",
    ],
  },
  asyncHandler(assessmentsController.remove),
);

export { assessmentsRouter as assessmentsRoutes };
