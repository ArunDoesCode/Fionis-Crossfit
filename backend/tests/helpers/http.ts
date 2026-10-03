import { Hono } from "hono";
import { SignJWT } from "jose";

import { ACCESS_COOKIE } from "../../src/lib/auth-middleware";
import { AppError } from "../../src/lib/errors";
import { signAccessToken } from "../../src/lib/token";
import type { AppEnv } from "../../src/lib/types";

/** The one allowed browser origin (`APP_ORIGIN`); every write must send it (BR-REC-37). */
export const APP_ORIGIN = process.env.APP_ORIGIN ?? "";

/** A well-formed id that exists nowhere (404 once a handler looks it up, never 400). */
export const UNKNOWN_ID = "00000000-0000-4000-8000-000000000001";
export const OTHER_UNKNOWN_ID = "00000000-0000-4000-8000-000000000002";

export type Json = Record<string, unknown>;

/** A fresh access token for a made-up signed-in session. */
export async function mintToken(
  sessionId: string = crypto.randomUUID(),
): Promise<string> {
  return signAccessToken({
    userId: crypto.randomUUID(),
    userName: "test_foundation",
    permissions: [],
    sid: sessionId,
  });
}

/** A token signed with the wrong secret: must never be accepted. */
export async function forgedToken(): Promise<string> {
  return new SignJWT({
    userId: crypto.randomUUID(),
    userName: "test_foundation",
    permissions: [],
    sid: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode("x".repeat(48)));
}

export type CallOptions = {
  /** access token sent as the cookie; `null` = not signed in. Default: a fresh valid token. */
  token?: string | null;
  /** `Origin` header; `null` = none. Default: `APP_ORIGIN` for writes, none for GET. */
  origin?: string | null;
  /** JSON body (serialised). */
  body?: unknown;
  /** raw body text (for invalid JSON). */
  rawBody?: string;
  headers?: Record<string, string>;
};

type App = {
  request: (input: string, init?: RequestInit) => Response | Promise<Response>;
};

export type Reply = {
  status: number;
  headers: Headers;
  /** parsed JSON, or `null` when the body is empty or not JSON */
  body:
    | (Json & {
        success?: boolean;
        code?: string;
        data?: unknown;
        meta?: Json;
        details?: Json;
      })
    | null;
  res: Response;
};

/** Calls the app the way a browser on the app's address does. */
export async function call(
  app: App,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: CallOptions = {},
): Promise<Reply> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const token = options.token === undefined ? await mintToken() : options.token;
  if (token) headers.Cookie = `${ACCESS_COOKIE}=${token}`;
  const origin =
    options.origin === undefined
      ? method === "GET"
        ? null
        : APP_ORIGIN
      : options.origin;
  if (origin) headers.Origin = origin;

  let body: string | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    headers["Content-Type"] = "application/json";
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = body;
  const res = await app.request(path, init);
  const parsed = (await res
    .clone()
    .json()
    .catch(() => null)) as Reply["body"];
  return { status: res.status, headers: res.headers, body: parsed, res };
}

/** True when the reply is the 400 Zod failure of the error envelope (BR-REC-154). */
export function isValidationError(reply: Reply): boolean {
  return reply.status === 400 && reply.body?.code === "VALIDATION_ERROR";
}

/**
 * A tiny Hono app for testing one middleware in isolation. It sets a fake
 * signed-in actor (session id from the `x-test-session` header) and maps
 * `AppError` to the error envelope, like the real app's `onError`.
 */
export function miniApp() {
  const app = new Hono<AppEnv>();
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        {
          success: false,
          message: error.message,
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
        },
        error.statusCode as 400,
      );
    }
    return c.json(
      { success: false, message: String(error), code: "INTERNAL_ERROR" },
      500,
    );
  });
  app.use("*", async (c, next) => {
    c.set("actor", {
      id: "00000000-0000-4000-8000-0000000000aa",
      name: "test_foundation",
      sessionId: c.req.header("x-test-session") ?? crypto.randomUUID(),
      permissions: new Set(),
    });
    await next();
  });
  return app;
}
