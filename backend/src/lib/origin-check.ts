import type { MiddlewareHandler } from "hono";

import { env } from "./env";
import type { AppEnv } from "./types";

// STUB (Stream 0 / S1): signatures and docs only. S3 builds the body and mounts it in `createApp`.

/** Methods that change data; GET never does (BR-REC-37). */
export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Refuses a write request (`WRITE_METHODS`) whose `Origin` header is not one
 * of `allowedOrigins` with 403 `CSRF_ORIGIN` (BR-REC-37). A write without an
 * `Origin` header is refused too. Reads (GET, HEAD, OPTIONS) always pass.
 * Defaults to the app's one public address, `env.APP_ORIGIN`.
 * Currently a pass-through.
 */
export function originCheck(
  _allowedOrigins: readonly string[] = [env.APP_ORIGIN],
): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    await next();
  };
}
