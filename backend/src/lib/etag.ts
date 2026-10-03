import type { MiddlewareHandler } from "hono";
import { etag } from "hono/etag";

import type { AppEnv } from "./types";

/**
 * Route middleware for E07 (settings) and E09 (catalog) (BR-REC-160): sets an
 * `ETag` computed from the response body; when the request's `If-None-Match`
 * matches, the answer is 304 with no body. Runs around the handler (after auth
 * and validation), so only a successful (2xx) GET gets a tag.
 */
export function etagMiddleware(): MiddlewareHandler<AppEnv> {
  return etag();
}
