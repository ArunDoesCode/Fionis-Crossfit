import { Hono } from "hono";
import { z } from "zod";

import {
  badRequestResponse,
  errorResponse,
  unauthorizedResponse,
} from "../lib/response-schemas";
import type { AppEnv } from "../lib/types";
import { vitalBodySchema } from "../types/vitals.types";
import { END_POINTS, MAIN_ROUTES } from "./end-points";
import { ANY_AUTHENTICATED, notImplemented, routeMounter } from "./mount-route";

// Owner: performance stream. E40. Handler answers 501 until Stream G builds it.
const vitalsRouter = new Hono<AppEnv>();
const route = routeMounter(vitalsRouter, MAIN_ROUTES.vitals);

route(
  END_POINTS.vitals.collect,
  {
    method: "POST",
    tags: ["vitals"],
    summary: "E40 Report one web-vitals measurement",
    auth: ANY_AUTHENTICATED,
    request: { body: vitalBodySchema },
    responses: {
      "204": z.undefined(),
      "400": badRequestResponse("INVALID_JSON"),
      "401": unauthorizedResponse,
      "429": errorResponse(["RATE_LIMITED"]),
    },
    notes: [
      "204 with no body. The server only logs a `vitals` line (BR-REC-152).",
    ],
  },
  notImplemented,
);

export { vitalsRouter as vitalsRoutes };
