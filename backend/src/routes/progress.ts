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
import { memberIdParamsSchema } from "../types/common.types";
import {
  activeByPlanSchema,
  EXPORT_FILES,
  exportCsvSchema,
  exportParamsSchema,
  leaderboardItemSchema,
  leaderboardQuerySchema,
  progressQuerySchema,
  progressStatsSchema,
  reportCardSchema,
} from "../types/progress.types";
import { END_POINTS, MAIN_ROUTES } from "./end-points";
import { ANY_AUTHENTICATED, notImplemented, routeMounter } from "./mount-route";

// Owner: progress stream. E35-E39. Handlers answer 501 until Stream F builds them.
const progressRouter = new Hono<AppEnv>();
const route = routeMounter(progressRouter, MAIN_ROUTES.progress);
const EP = END_POINTS.progress;
const TAGS = ["progress"];

route(
  EP.reportCard,
  {
    method: "GET",
    tags: TAGS,
    summary: "E35 A member's report card",
    auth: ANY_AUTHENTICATED,
    request: { params: memberIdParamsSchema },
    responses: {
      "200": successResponse(reportCardSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
  },
  notImplemented,
);

route(
  EP.progress,
  {
    method: "GET",
    tags: TAGS,
    summary: "E36 Gym-wide progress for one measurement",
    auth: ANY_AUTHENTICATED,
    request: { query: progressQuerySchema },
    responses: {
      "200": successResponse(progressStatsSchema),
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      "404 when `metricId` does not exist. Only members with 2+ readings count; `notCounted` says how many were left out.",
    ],
  },
  notImplemented,
);

route(
  EP.leaderboard,
  {
    method: "GET",
    tags: TAGS,
    summary: "E37 Leaderboard for one measurement and sex",
    auth: ANY_AUTHENTICATED,
    request: { query: leaderboardQuerySchema },
    responses: {
      "200": paginatedResponse(leaderboardItemSchema),
      "400": errorResponse(["VALIDATION_ERROR", "NO_DIRECTION"]),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    pagination: { sortableFields: [], searchable: false },
    notes: [
      "Ranked by latest value, best first by direction; equal values share a rank. 400 NO_DIRECTION for a measurement with no better direction.",
    ],
  },
  notImplemented,
);

route(
  EP.activeByPlan,
  {
    method: "GET",
    tags: TAGS,
    summary: "E38 Active members by plan",
    auth: ANY_AUTHENTICATED,
    responses: {
      "200": successResponse(activeByPlanSchema),
      "401": unauthorizedResponse,
    },
  },
  notImplemented,
);

route(
  EP.export,
  {
    method: "GET",
    tags: TAGS,
    summary: "E39 CSV export (members, memberships or measurements)",
    auth: ANY_AUTHENTICATED,
    request: { params: exportParamsSchema },
    responses: {
      "200": exportCsvSchema,
      "400": badRequestResponse(),
      "401": unauthorizedResponse,
      "404": notFoundResponse,
    },
    notes: [
      `Not JSON: the 200 body is CSV text (\`text/csv; charset=utf-8\`, UTF-8 with BOM, streamed), a documented exception to the envelope. \`file\` is one of ${EXPORT_FILES.join(", ")}; anything else is 404 NOT_FOUND.`,
    ],
  },
  notImplemented,
);

export { progressRouter as progressRoutes };
