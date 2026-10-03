import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./types";

// STUB (Stream 0 / S1): signatures and docs only. S3 builds the bodies.

/** How long a stored answer can be replayed (BR-REC-156); rows older than this are pruned (BR-REC-165). */
export const IDEMPOTENCY_TTL_HOURS = 48;

/**
 * Route middleware for the create endpoints E17 and E22 (BR-REC-156). It runs
 * after auth and request validation, before the handler. The record key is
 * `(actor.sessionId, Idempotency-Key)` in table `idempotency_keys`.
 *  - header missing or not a UUID: 400 `IDEMPOTENCY_KEY_MISSING`
 *  - same key + same request within 48 h: replays the first status code and body
 *  - same key + a different request body: 422 `IDEMPOTENCY_KEY_REUSED`
 * Currently a pass-through.
 */
export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    await next();
  };
}

/**
 * Deletes `idempotency_keys` rows created more than 48 h before `now` and
 * returns how many were removed (BR-REC-165). `now` is an argument: no clock.
 * Not implemented yet.
 */
export async function pruneIdempotencyKeys(_now: Date): Promise<number> {
  throw new Error("not implemented");
}
