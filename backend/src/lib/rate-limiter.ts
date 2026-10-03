import type { MiddlewareHandler } from "hono";

import { TooManyRequestsError } from "./errors";

// In-memory, per-process: resets on restart and is not shared across instances.
// Fine for a single-process deployment; swap for a shared store if that changes.
// The key is the first X-Forwarded-For hop, so deploy behind a proxy that sets it.
export function rateLimiter({
  windowMs,
  max,
}: {
  windowMs: number;
  max: number;
}): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const key =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const now = Date.now();

    for (const [k, entry] of hits) {
      if (now > entry.resetAt) hits.delete(k);
    }

    const entry = hits.get(key);
    if (!entry) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= max) {
      throw new TooManyRequestsError("Too many attempts, try again later");
    } else {
      entry.count += 1;
    }

    await next();
  };
}
