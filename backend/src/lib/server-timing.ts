import { AsyncLocalStorage } from "node:async_hooks";

import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./types";

/** The running total of database time for the request being served. */
type RequestTiming = { dbMs: number };

/** One store per request, so two requests in flight never mix their `db` time. */
const requestTiming = new AsyncLocalStorage<RequestTiming>();

/**
 * Global middleware (outermost): adds `Server-Timing: db;dur=<ms>, total;dur=<ms>`
 * to every response (BR-REC-161). `total` is the whole request; `db` is the sum
 * recorded by `measureDb` during the request.
 */
export function serverTiming(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const timing: RequestTiming = { dbMs: 0 };
    const start = performance.now();
    await requestTiming.run(timing, next);
    c.header(
      "Server-Timing",
      formatServerTiming({
        dbMs: timing.dbMs,
        totalMs: performance.now() - start,
      }),
    );
  };
}

/**
 * Wraps one database call so its duration is added to the current request's
 * `db` timing. Repositories wrap their queries with it; outside a request it
 * just runs the call.
 */
export async function measureDb<T>(query: () => Promise<T>): Promise<T> {
  const timing = requestTiming.getStore();
  if (!timing) return query();
  const start = performance.now();
  try {
    return await query();
  } finally {
    timing.dbMs += performance.now() - start;
  }
}

/**
 * The header value: `db;dur=12.3, total;dur=45.6` (milliseconds, one decimal).
 * Pure.
 */
export function formatServerTiming(timing: {
  dbMs: number;
  totalMs: number;
}): string {
  return `db;dur=${timing.dbMs.toFixed(1)}, total;dur=${timing.totalMs.toFixed(1)}`;
}
