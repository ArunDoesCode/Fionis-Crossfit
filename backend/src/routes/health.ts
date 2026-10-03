import { Hono } from "hono";

import { healthController } from "../controller/healthController";
import { asyncHandler } from "../lib/async-handler";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import { healthSchema } from "../types/health.types";
import { API_BASE_PATH, END_POINTS, MAIN_ROUTES } from "./end-points";

const HEALTH_ROUTES = END_POINTS.health;
const HEALTH_PATH = `${API_BASE_PATH}${MAIN_ROUTES.health}`;

const healthRouter = new Hono<AppEnv>();

// Public by design: liveness/readiness probe, no data beyond status flags.
healthRouter.get(HEALTH_ROUTES.check, asyncHandler(healthController.check));
register({
  method: "GET",
  path: HEALTH_PATH,
  tags: ["health"],
  summary: "Liveness and database connectivity probe",
  auth: { type: "public" },
  responses: {
    "200": successResponse(healthSchema),
    "503": successResponse(healthSchema),
  },
  notes: ["503 is returned when the database is unreachable (db: 'down')."],
});

export { healthRouter as healthRoutes };
