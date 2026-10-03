import type { MiddlewareHandler } from "hono";

import { env } from "./env";
import { ForbiddenError } from "./errors";
import type { AppEnv } from "./types";

/** Methods that change data; GET never does (BR-REC-37). */
export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/** `https://gym.example/` and `https://gym.example` are the same origin. */
function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

/**
 * Refuses a write request (`WRITE_METHODS`) whose `Origin` header is not one
 * of `allowedOrigins` with 403 `CSRF_ORIGIN` (BR-REC-37). A write without an
 * `Origin` header is refused too. Reads (GET, HEAD, OPTIONS) always pass.
 * Defaults to the app's one public address, `env.APP_ORIGIN`; `createApp`
 * also passes `APP_ORIGINS_EXTRA`.
 */
export function originCheck(
  allowedOrigins: readonly string[] = [env.APP_ORIGIN],
): MiddlewareHandler<AppEnv> {
  const allowed = new Set(allowedOrigins.map(normalizeOrigin));
  return async (c, next) => {
    if ((WRITE_METHODS as readonly string[]).includes(c.req.method)) {
      const origin = c.req.header("Origin");
      if (origin === undefined || !allowed.has(origin)) {
        throw new ForbiddenError(
          "This request did not come from the app",
          "CSRF_ORIGIN",
        );
      }
    }
    await next();
  };
}
