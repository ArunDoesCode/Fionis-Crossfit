import { Hono } from "hono";

import {
  badRequestResponse,
  errorResponse,
  successResponse,
  unauthorizedResponse,
} from "../lib/response-schemas";
import type { AppEnv } from "../lib/types";
import {
  changePasswordBodySchema,
  changePasswordResultSchema,
  loginBodySchema,
  logoutAllResultSchema,
  logoutResultSchema,
  refreshResultSchema,
  sessionInfoSchema,
} from "../types/auth.types";
import { END_POINTS, MAIN_ROUTES } from "./end-points";
import {
  ANY_AUTHENTICATED,
  notImplemented,
  PUBLIC,
  routeMounter,
} from "./mount-route";

// Owner: auth stream. E01-E06. Handlers answer 501 until Stream A builds them.
const authRouter = new Hono<AppEnv>();
const route = routeMounter(authRouter, MAIN_ROUTES.auth);
const EP = END_POINTS.auth;
const TAGS = ["auth"];

route(
  EP.login,
  {
    method: "POST",
    tags: TAGS,
    summary: "E01 Sign in with the shared login",
    auth: PUBLIC,
    request: { body: loginBodySchema },
    responses: {
      "200": successResponse(sessionInfoSchema),
      "400": badRequestResponse("INVALID_JSON"),
      "401": errorResponse(["INVALID_CREDENTIALS"]),
      "429": errorResponse(["LOGIN_LOCKED", "RATE_LIMITED"]),
    },
    notes: [
      "Sets the httpOnly cookies `access_token` (JWT, 15 min) and `refresh_token`.",
      "429 LOGIN_LOCKED: one lock for the whole login; `details.retryAfterSeconds` and a `Retry-After` header.",
    ],
  },
  notImplemented,
);

route(
  EP.refresh,
  {
    method: "POST",
    tags: TAGS,
    summary: "E02 Refresh the sign-in (rotates the refresh cookie)",
    auth: PUBLIC,
    responses: {
      "200": successResponse(refreshResultSchema),
      "401": errorResponse(["SESSION_EXPIRED"]),
      "429": errorResponse(["RATE_LIMITED"]),
    },
    notes: [
      "Reads the `refresh_token` cookie; no body. Works while the login is locked (BR-REC-171).",
    ],
  },
  notImplemented,
);

route(
  EP.logout,
  {
    method: "POST",
    tags: TAGS,
    summary: "E03 Sign out this device",
    auth: PUBLIC,
    responses: { "200": successResponse(logoutResultSchema) },
    notes: [
      "Clears the cookies. Public: it must work with an expired access token.",
    ],
  },
  notImplemented,
);

route(
  EP.logoutAll,
  {
    method: "POST",
    tags: TAGS,
    summary: "E04 Sign out every device (this one too)",
    auth: ANY_AUTHENTICATED,
    responses: {
      "200": successResponse(logoutAllResultSchema),
      "401": unauthorizedResponse,
    },
    notes: ["Clears the cookies."],
  },
  notImplemented,
);

route(
  EP.me,
  {
    method: "GET",
    tags: TAGS,
    summary: "E05 The signed-in account",
    auth: ANY_AUTHENTICATED,
    responses: {
      "200": successResponse(sessionInfoSchema),
      "401": unauthorizedResponse,
    },
  },
  notImplemented,
);

route(
  EP.password,
  {
    method: "POST",
    tags: TAGS,
    summary: "E06 Change the password (other devices are signed out)",
    auth: ANY_AUTHENTICATED,
    request: { body: changePasswordBodySchema },
    responses: {
      "200": successResponse(changePasswordResultSchema),
      "400": badRequestResponse("INVALID_JSON", "CURRENT_PASSWORD_WRONG"),
      "401": unauthorizedResponse,
      "429": errorResponse(["LOGIN_LOCKED"]),
    },
    notes: [
      "A wrong current password is 400, never 401: a 401 makes the app try a refresh and sign out.",
      "A wrong current password counts toward the lock; while locked: 429 LOGIN_LOCKED as E01.",
    ],
  },
  notImplemented,
);

export { authRouter as authRoutes };
