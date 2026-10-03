import type { MiddlewareHandler } from "hono";

import { TooManyRequestsError } from "./errors";
import { clientAddress } from "./http";

/**
 * Fixed-window limit per network address (BR-REC-38): the `max + 1`-th request inside
 * `windowMs` is 429 `RATE_LIMITED`. The address is `clientAddress(c)`: the connecting
 * address, or the `X-Forwarded-For` entry our own proxy appended (`TRUST_PROXY_HOPS`);
 * whatever the browser put in that header is never the key.
 *
 * In-memory, per process: resets on restart and is not shared across instances. Fine for the
 * single-process deployment (D-018); swap for a shared store if that changes. Mount it as route
 * `extra` middleware so it runs after auth and body validation.
 */
export function rateLimiter({
  windowMs,
  max,
}: {
  windowMs: number;
  max: number;
}): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;

  return async (c, next) => {
    const key = clientAddress(c) ?? "unknown";
    const now = Date.now();

    if (now >= nextSweep) {
      for (const [k, entry] of hits) {
        if (now >= entry.resetAt) hits.delete(k);
      }
      nextSweep = now + windowMs;
    }

    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= max) {
      throw new TooManyRequestsError("Too many attempts, try again later");
    } else {
      entry.count += 1;
    }

    await next();
  };
}
