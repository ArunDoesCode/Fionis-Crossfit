import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./types";

// STUB (Stream 0 / S1): signature and docs only. S3 builds the body.

/** gzip threshold in bytes: smaller bodies are sent as they are (BR-REC-161). */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

/**
 * Global middleware for API responses (BR-REC-161): sets
 * `Cache-Control: private, no-store` and gzip-compresses bodies over
 * `COMPRESSION_THRESHOLD_BYTES` when the client accepts gzip
 * (`Content-Encoding: gzip`). Currently a pass-through.
 */
export function dataResponseHeaders(): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    await next();
  };
}
