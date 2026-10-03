import { createHash } from "node:crypto";

import { and, eq, lt, or, sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { db } from "../db/client";
import { idempotencyKeys } from "../db/schemas";
import { IDEMPOTENCY_KEY_HEADER } from "../types/common.types";
import { AppError, BadRequestError, TooManyRequestsError } from "./errors";
import type { AppEnv } from "./types";

/** How long a stored answer can be replayed (BR-REC-156); rows older than this are pruned (BR-REC-165). */
export const IDEMPOTENCY_TTL_HOURS = 48;

/** `status_code` of a row whose first request is still running (a claim, not an answer yet). */
const IN_FLIGHT = 0;
/** A claim older than this was left by a process that died: the next request takes it over. */
const CLAIM_STALE_SECONDS = 60;
/** A duplicate that arrives while the first request runs waits this long for its answer. */
const WAIT_FOR_FIRST_MS = 10_000;
/** A waiting duplicate checks for the answer after 50 ms, then 100, 200, ... up to 500 ms apart. */
const WAIT_FIRST_STEP_MS = 50;
const WAIT_MAX_STEP_MS = 500;

const KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** JSON with object keys sorted, so key order and whitespace never make two equal bodies differ. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** What "the same request" means: same method, path and body (canonical JSON). */
async function hashRequest(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
): Promise<string> {
  const raw = await c.req.text();
  let body = raw;
  try {
    body = canonicalJson(JSON.parse(raw));
  } catch {
    // not JSON: the raw text is the body
  }
  return createHash("sha256")
    .update(`${c.req.method} ${c.req.path}\n${body}`)
    .digest("hex");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Route middleware for the create endpoints E17 and E22 (BR-REC-156). It runs
 * after auth and request validation, before the handler. The record key is
 * `(actor.sessionId, Idempotency-Key)` in table `idempotency_keys`.
 *  - header missing or not a UUID: 400 `IDEMPOTENCY_KEY_MISSING`
 *  - same key + same request within 48 h: replays the first status code and body
 *  - same key + a different request: 422 `IDEMPOTENCY_KEY_REUSED`
 *
 * The first request CLAIMS the key with an `insert ... on conflict do nothing`
 * on the primary key before the handler runs, so two requests with the same key
 * at the same moment cannot both create: the second waits for the first answer
 * and replays it. Only a successful (2xx) answer is kept; a request that failed
 * releases the key, so the retry (maybe with the data fixed) runs normally. A
 * request that succeeded never releases its key, even if storing the answer fails.
 */
export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header(IDEMPOTENCY_KEY_HEADER);
    if (key === undefined || !KEY_PATTERN.test(key)) {
      throw new BadRequestError(
        "Send an Idempotency-Key header with a UUID",
        "IDEMPOTENCY_KEY_MISSING",
      );
    }
    const sessionId = c.get("actor").sessionId;
    const requestHash = await hashRequest(c);
    const mine = and(
      eq(idempotencyKeys.sessionId, sessionId),
      eq(idempotencyKeys.key, key),
    );

    // One claim attempt = delete an expired answer or abandoned claim, then
    // insert. A request that finds the key held does not repeat it: it only
    // reads the row (back-off between reads) until the row is answered or gone.
    const tryClaim = async (): Promise<boolean> => {
      await db
        .delete(idempotencyKeys)
        .where(
          and(
            mine,
            or(
              lt(
                idempotencyKeys.createdAt,
                sql`now() - make_interval(hours => ${IDEMPOTENCY_TTL_HOURS})`,
              ),
              and(
                eq(idempotencyKeys.statusCode, IN_FLIGHT),
                lt(
                  idempotencyKeys.createdAt,
                  sql`now() - make_interval(secs => ${CLAIM_STALE_SECONDS})`,
                ),
              ),
            ),
          ),
        );
      const claimed = await db
        .insert(idempotencyKeys)
        .values({
          sessionId,
          key,
          endpoint: `${c.req.method} ${c.req.path}`,
          requestHash,
          statusCode: IN_FLIGHT,
          response: {},
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      return claimed.length > 0;
    };

    const deadline = Date.now() + WAIT_FOR_FIRST_MS;
    let stepMs = WAIT_FIRST_STEP_MS;
    while (!(await tryClaim())) {
      for (;;) {
        const [existing] = await db
          .select({
            requestHash: idempotencyKeys.requestHash,
            statusCode: idempotencyKeys.statusCode,
            response: idempotencyKeys.response,
          })
          .from(idempotencyKeys)
          .where(mine);
        // released or expired since our claim attempt: claim again
        if (!existing) break;

        if (existing.requestHash !== requestHash) {
          throw new AppError(
            "This Idempotency-Key was already used for a different request",
            422,
            "IDEMPOTENCY_KEY_REUSED",
          );
        }
        if (existing.statusCode !== IN_FLIGHT) {
          return c.json(
            existing.response,
            existing.statusCode as ContentfulStatusCode,
          );
        }
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          throw new TooManyRequestsError(
            "The first attempt is still being processed, try again in a moment",
          );
        }
        await sleep(Math.min(stepMs, remainingMs));
        stepMs = Math.min(stepMs * 2, WAIT_MAX_STEP_MS);
      }
    }

    const release = () => db.delete(idempotencyKeys).where(mine);
    try {
      await next();
    } catch (error) {
      await release();
      throw error;
    }

    // `next()` does not throw for a handler error: Hono turns it into `c.error` + an error response.
    const status = c.res.status;
    if (c.error || status < 200 || status > 299) {
      await release();
      return;
    }
    try {
      const answer = (await c.res.clone().json()) as unknown;
      await db
        .update(idempotencyKeys)
        .set({ statusCode: status, response: answer })
        .where(mine);
    } catch (error) {
      // The write already happened and the client still gets its answer. The
      // claim stays: freeing it would let a retry with this key create the
      // record a second time. (Left unanswered it counts as abandoned after 60 s.)
      console.error("Could not store the idempotent answer", error);
    }
  };
}

/**
 * Deletes `idempotency_keys` rows created more than 48 h before `now` and
 * returns how many were removed (BR-REC-165). `now` is an argument: no clock.
 */
export async function pruneIdempotencyKeys(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_HOURS * 3_600_000);
  const removed = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, cutoff))
    .returning({ key: idempotencyKeys.key });
  return removed.length;
}
