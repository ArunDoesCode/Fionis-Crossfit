import { Hono } from "hono";
import { z } from "zod";

import { authController } from "../controller/authController";
import { asyncHandler } from "../lib/async-handler";
import { rateLimiter } from "../lib/rate-limiter";
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
import { ANY_AUTHENTICATED, PUBLIC, routeMounter } from "./mount-route";

// Owner: auth stream. E01-E06.
const authRouter = new Hono<AppEnv>();
const route = routeMounter(authRouter, MAIN_ROUTES.auth);
const EP = END_POINTS.auth;
const TAGS = ["auth"];

/** BR-REC-38: per network address, on top of the lock. Runs after body validation, before the handler. */
const loginRateLimit = rateLimiter({ windowMs: 60_000, max: 10 });
const refreshRateLimit = rateLimiter({ windowMs: 60_000, max: 30 });

/** 429 while the login is locked: `details.retryAfterSeconds` (>= 1) = wait until a new try is allowed. */
const loginLockedResponse = errorResponse(["LOGIN_LOCKED"]).extend({
  details: z.object({ retryAfterSeconds: z.number().int().min(1) }),
});
const rateLimitedResponse = errorResponse(["RATE_LIMITED"]);
const ORIGIN_NOTE =
  "A write needs an `Origin` header equal to the app address, else 403 CSRF_ORIGIN (BR-REC-37).";

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
      "429": z.union([loginLockedResponse, rateLimitedResponse]),
    },
    notes: [
      "Sets two cookies (httpOnly, Secure in production, SameSite=Lax, Path=/): `access_token` (JWT, Max-Age 15 min) and `refresh_token` (Max-Age 7 days when `remember`, a browser-session cookie when not).",
      "`remember: false`: the server ends the sign-in after 12 hours (`SESSION_SHORT_TTL_SECONDS`).",
      "Unknown username and wrong password give the same 401 INVALID_CREDENTIALS. The 5th wrong try in 15 minutes is still 401; the 6th is 429.",
      "429 LOGIN_LOCKED: one lock for the whole login, 15 minutes, never extended by tries; `details.retryAfterSeconds` (>= 1) and a `Retry-After` header in seconds. Even the right password is refused.",
      "429 RATE_LIMITED: 10 requests a minute per network address (after body validation, before the lock check).",
      ORIGIN_NOTE,
    ],
  },
  asyncHandler(authController.login),
  [loginRateLimit],
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
      "429": rateLimitedResponse,
    },
    notes: [
      "Reads the `refresh_token` cookie; no body. Works while the login is locked (BR-REC-171).",
      "200 sets both cookies again, as E01 (a new access token and a new refresh token); `expiresAt` is when the sign-in ends if unused.",
      "A replaced refresh token used within 60 s of its replacement (two tabs at once) gets 200 with a new `access_token` cookie only: no second rotation and no `refresh_token` cookie (BR-REC-32).",
      "401 SESSION_EXPIRED: no, unknown, expired or revoked token, or a replaced token used after its 60 s grace (the sign-in is then revoked).",
      "429 RATE_LIMITED: 30 requests a minute per network address.",
      ORIGIN_NOTE,
    ],
  },
  asyncHandler(authController.refresh),
  [refreshRateLimit],
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
      "Clears both cookies (Max-Age=0, Path=/) and ends this device's sign-in. Public: it must work with an expired access token.",
      "Always 200, also when there is no sign-in to end.",
      ORIGIN_NOTE,
    ],
  },
  asyncHandler(authController.logout),
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
    notes: [
      "Ends every active sign-in, this one too, and clears both cookies. `signedOut` counts the sign-ins ended.",
      "Other devices lose access within 15 minutes (access tokens are checked by signature only, BR-REC-33); their refresh fails at once.",
      ORIGIN_NOTE,
    ],
  },
  asyncHandler(authController.logoutAll),
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
    notes: [
      "Does not check whether the sign-in was revoked (signature only, BR-REC-33); `remember` and `expiresAt` come from the session row of the token's `sid`.",
    ],
  },
  asyncHandler(authController.me),
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
      "429": loginLockedResponse,
    },
    notes: [
      "`newPassword` must be 8-128 characters, else 400 VALIDATION_ERROR on `newPassword` (BR-REC-02, 27).",
      "A wrong current password is 400, never 401: a 401 makes the app try a refresh and sign out.",
      "A wrong current password counts toward the lock; while locked: 429 LOGIN_LOCKED as E01 (`details.retryAfterSeconds`, `Retry-After`).",
      "Every other sign-in is revoked; this one stays and its cookies do not change.",
      ORIGIN_NOTE,
    ],
  },
  asyncHandler(authController.changePassword),
);

export { authRouter as authRoutes };
