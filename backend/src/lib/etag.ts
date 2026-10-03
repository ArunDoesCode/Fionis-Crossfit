import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./types";

// STUB (Stream 0 / S1): signature and docs only. S3 builds the body.

/**
 * Route middleware for E07 (settings) and E09 (catalog) (BR-REC-160): sets an
 * `ETag` computed from the response body; when the request's `If-None-Match`
 * matches, the answer is 304 with no body. Runs around the handler (after auth
 * and validation). Currently a pass-through.
 */
export function etagMiddleware(): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    await next();
  };
}
