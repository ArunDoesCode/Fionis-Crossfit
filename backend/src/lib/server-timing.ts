import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./types";

// STUB (Stream 0 / S1): signatures and docs only. S3 builds the bodies.

/**
 * Global middleware (outermost): adds `Server-Timing: db;dur=<ms>, total;dur=<ms>`
 * to every response (BR-REC-161). `total` is the whole request; `db` is the sum
 * recorded by `measureDb` during the request. Currently a pass-through.
 */
export function serverTiming(): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    await next();
  };
}

/**
 * Wraps one database call so its duration is added to the current request's
 * `db` timing. Repositories wrap their queries with it; outside a request it
 * just runs the call. Currently a pass-through.
 */
export function measureDb<T>(query: () => Promise<T>): Promise<T> {
  return query();
}

/**
 * The header value: `db;dur=12.3, total;dur=45.6` (milliseconds, one decimal).
 * Pure. Not implemented yet.
 */
export function formatServerTiming(_timing: {
  dbMs: number;
  totalMs: number;
}): string {
  throw new Error("not implemented");
}
