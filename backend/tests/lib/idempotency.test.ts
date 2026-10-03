import { afterAll, describe, expect, test } from "bun:test";

import { eq, inArray, like } from "drizzle-orm";

import { db } from "../../src/db/client";
import { idempotencyKeys } from "../../src/db/schemas";
import { ConflictError } from "../../src/lib/errors";
import {
  IDEMPOTENCY_TTL_HOURS,
  idempotency,
  pruneIdempotencyKeys,
} from "../../src/lib/idempotency";
import { call, miniApp } from "../helpers/http";

// BR-REC-156: create endpoints E17 and E22 need an Idempotency-Key (UUID); a
// repeat with the same key within 48 h returns the first answer; the same key
// with a different body is 422 IDEMPOTENCY_KEY_REUSED.
// BR-REC-165: idempotency keys are deleted after 48 h.

const P = "TEST_foundation_idem_";
const sessions: string[] = [];

afterAll(async () => {
  if (sessions.length > 0) {
    await db
      .delete(idempotencyKeys)
      .where(inArray(idempotencyKeys.sessionId, sessions));
  }
  await db
    .delete(idempotencyKeys)
    .where(like(idempotencyKeys.endpoint, `${P}%`));
});

function newSession(): string {
  const id = crypto.randomUUID();
  sessions.push(id);
  return id;
}

/** A create route: counts how often the handler really ran. */
function buildApp() {
  const app = miniApp();
  let runs = 0;
  app.post("/create", idempotency(), async (c) => {
    runs++;
    const body = await c.req.json();
    return c.json({ success: true, data: { run: runs, body } }, 201);
  });
  return { app, runs: () => runs };
}

const send = (
  app: ReturnType<typeof buildApp>["app"],
  options: { session: string; key?: string; body?: unknown },
) => {
  const headers: Record<string, string> = { "x-test-session": options.session };
  if (options.key !== undefined) headers["Idempotency-Key"] = options.key;
  return call(app, "POST", "/create", {
    token: null,
    headers,
    body: options.body ?? { fullName: "Surya Pratap" },
  });
};

describe("idempotency middleware", () => {
  test("BR-REC-156 a create without an Idempotency-Key is 400 IDEMPOTENCY_KEY_MISSING and nothing runs", async () => {
    const { app, runs } = buildApp();
    const reply = await send(app, { session: newSession() });
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({
      success: false,
      code: "IDEMPOTENCY_KEY_MISSING",
    });
    expect(runs()).toBe(0);
  });

  test("BR-REC-156 a key that is not a UUID is 400 IDEMPOTENCY_KEY_MISSING", async () => {
    const { app, runs } = buildApp();
    const reply = await send(app, { session: newSession(), key: "not-a-uuid" });
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ code: "IDEMPOTENCY_KEY_MISSING" });
    expect(runs()).toBe(0);
  });

  test("BR-REC-156 the first request runs the handler and is answered normally", async () => {
    const { app, runs } = buildApp();
    const reply = await send(app, {
      session: newSession(),
      key: crypto.randomUUID(),
    });
    expect(reply.status).toBe(201);
    expect(reply.body).toEqual({
      success: true,
      data: { run: 1, body: { fullName: "Surya Pratap" } },
    });
    expect(runs()).toBe(1);
  });

  test("BR-REC-156 a retry with the same key and body returns the first answer and the handler runs once", async () => {
    const { app, runs } = buildApp();
    const session = newSession();
    const key = crypto.randomUUID();
    const first = await send(app, { session, key });
    const retry = await send(app, { session, key });
    expect(retry.status).toBe(first.status);
    expect(retry.body).toEqual(first.body);
    expect(runs()).toBe(1);
  });

  test("BR-REC-156 the first answer is stored per session and key with its status code", async () => {
    const { app } = buildApp();
    const session = newSession();
    const key = crypto.randomUUID();
    const first = await send(app, { session, key });
    const rows = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.sessionId, session));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key, statusCode: 201 });
    expect(rows[0]?.response).toEqual(first.body);
  });

  test("BR-REC-156 the same key with a different body is 422 IDEMPOTENCY_KEY_REUSED and nothing runs", async () => {
    const { app, runs } = buildApp();
    const session = newSession();
    const key = crypto.randomUUID();
    const first = await send(app, { session, key, body: { fullName: "A" } });
    const reused = await send(app, { session, key, body: { fullName: "B" } });
    expect(reused.status).toBe(422);
    expect(reused.body).toMatchObject({
      success: false,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(runs()).toBe(1);

    const again = await send(app, { session, key, body: { fullName: "A" } });
    expect(again.status).toBe(first.status);
    expect(again.body).toEqual(first.body);
  });

  test("BR-REC-156 a different key is a new request and runs the handler again", async () => {
    const { app, runs } = buildApp();
    const session = newSession();
    await send(app, { session, key: crypto.randomUUID() });
    const second = await send(app, { session, key: crypto.randomUUID() });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ data: { run: 2 } });
    expect(runs()).toBe(2);
  });

  test("BR-REC-156 the same key from another sign-in is not a replay", async () => {
    const { app, runs } = buildApp();
    const key = crypto.randomUUID();
    await send(app, { session: newSession(), key });
    const other = await send(app, { session: newSession(), key });
    expect(other.status).toBe(201);
    expect(runs()).toBe(2);
  });
});

/**
 * A create route whose behaviour the test controls per run (`run` counts from 1):
 * how often the handler really ran is what the key rules are about.
 */
function buildControlledApp(
  step: (run: number, body: Record<string, unknown>) => Promise<Response>,
) {
  const app = miniApp();
  let runs = 0;
  app.post("/create", idempotency(), async (c) => {
    runs++;
    const body = (await c.req.json()) as Record<string, unknown>;
    return step(runs, body);
  });
  return { app, runs: () => runs };
}

const created = (run: number, body: unknown) =>
  Response.json({ success: true, data: { run, body } }, { status: 201 });

const storedRows = (session: string) =>
  db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.sessionId, session));

describe("idempotency middleware: concurrent duplicates (BR-REC-156, api-contract changelog)", () => {
  test("BR-REC-156 duplicates sent at the same moment with one key run the handler once and all get the first answer", async () => {
    const { app, runs } = buildControlledApp(async (run, body) => {
      await Bun.sleep(300); // the first is still running when the duplicates arrive
      return created(run, body);
    });
    const session = newSession();
    const key = crypto.randomUUID();
    const replies = await Promise.all(
      Array.from({ length: 5 }, () => send(app, { session, key })),
    );
    expect(runs()).toBe(1);
    for (const reply of replies) {
      expect(reply.status).toBe(201);
      expect(reply.body).toEqual({
        success: true,
        data: { run: 1, body: { fullName: "Surya Pratap" } },
      });
    }
    const rows = await storedRows(session);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key, statusCode: 201 });
  });

  test("BR-REC-156 two different keys sent at the same moment both run", async () => {
    const { app, runs } = buildControlledApp(async (run, body) => {
      await Bun.sleep(100);
      return created(run, body);
    });
    const session = newSession();
    const replies = await Promise.all([
      send(app, { session, key: crypto.randomUUID() }),
      send(app, { session, key: crypto.randomUUID() }),
    ]);
    expect(runs()).toBe(2);
    expect(replies.map((r) => r.status)).toEqual([201, 201]);
  });

  test("BR-REC-156 a duplicate that arrives while the first is still running gets 429 RATE_LIMITED after the wait, runs nothing, and does not free the key", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: () => void = () => {};
    const handlerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { app, runs } = buildControlledApp(async (run, body) => {
      started();
      await gate; // the first request does not finish until the test says so
      return created(run, body);
    });
    const session = newSession();
    const key = crypto.randomUUID();

    const first = send(app, { session, key });
    try {
      await handlerStarted;
      const t0 = performance.now();
      const duplicate = await send(app, { session, key });
      const waitedMs = performance.now() - t0;

      expect(duplicate.status).toBe(429);
      expect(duplicate.body).toMatchObject({
        success: false,
        code: "RATE_LIMITED",
      });
      expect(waitedMs).toBeLessThan(12_000); // "waits up to 10 s"
      expect(runs()).toBe(1);
    } finally {
      release();
    }

    const answer = await first;
    expect(answer.status).toBe(201);
    // the 429 did not free the claim: the key now replays the first answer, nothing runs again
    const replay = await send(app, { session, key });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(answer.body);
    expect(runs()).toBe(1);
  }, 20_000);
});

describe("idempotency middleware: a failed request frees its key (BR-REC-156, api-contract changelog)", () => {
  const FAILURES: [string, () => Promise<Response>][] = [
    [
      "answers 400",
      async () =>
        Response.json(
          { success: false, message: "bad", code: "VALIDATION_ERROR" },
          { status: 400 },
        ),
    ],
    [
      "throws a 409 AppError",
      async () => {
        throw new ConflictError("overlap", "PERIOD_OVERLAP");
      },
    ],
    [
      "throws an unexpected error (500)",
      async () => {
        throw new Error("boom");
      },
    ],
  ];

  for (const [label, fail] of FAILURES) {
    test(`BR-REC-156 when the handler ${label}, a retry with the same key and body runs again and is answered normally`, async () => {
      const { app, runs } = buildControlledApp((run, body) =>
        run === 1 ? fail() : Promise.resolve(created(run, body)),
      );
      const session = newSession();
      const key = crypto.randomUUID();

      const failed = await send(app, { session, key });
      expect(failed.status).toBeGreaterThanOrEqual(400);

      const retry = await send(app, { session, key });
      expect(retry.status).toBe(201);
      expect(retry.body).toMatchObject({ success: true, data: { run: 2 } });
      expect(runs()).toBe(2);

      const rows = await storedRows(session);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ key, statusCode: 201 });
    });
  }

  test("BR-REC-156 a failed answer is never stored or replayed", async () => {
    const { app, runs } = buildControlledApp(async () =>
      Response.json(
        { success: false, message: "bad", code: "VALIDATION_ERROR" },
        { status: 400 },
      ),
    );
    const session = newSession();
    const key = crypto.randomUUID();
    const first = await send(app, { session, key });
    expect(first.status).toBe(400);
    const rows = await storedRows(session);
    expect(rows.filter((r) => r.statusCode >= 300)).toEqual([]);

    const again = await send(app, { session, key });
    expect(again.status).toBe(400);
    expect(runs()).toBe(2); // run again, not replayed from a stored 400
  });

  test("BR-REC-156 a corrected retry (same key, fixed body) after a failure runs normally, not 422 IDEMPOTENCY_KEY_REUSED", async () => {
    const { app, runs } = buildControlledApp(async (run, body) =>
      body.fullName === ""
        ? Response.json(
            { success: false, message: "name", code: "VALIDATION_ERROR" },
            { status: 400 },
          )
        : created(run, body),
    );
    const session = newSession();
    const key = crypto.randomUUID();

    const bad = await send(app, { session, key, body: { fullName: "" } });
    expect(bad.status).toBe(400);

    const fixed = await send(app, {
      session,
      key,
      body: { fullName: "Surya Pratap" },
    });
    expect(fixed.status).toBe(201);
    expect(fixed.body).toMatchObject({
      success: true,
      data: { run: 2, body: { fullName: "Surya Pratap" } },
    });
    expect(runs()).toBe(2);

    // and once it succeeded, the key is taken by that body again
    const reused = await send(app, {
      session,
      key,
      body: { fullName: "Other" },
    });
    expect(reused.status).toBe(422);
    expect(reused.body).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  test("BR-REC-156 after a failure, retries sent at the same moment still create only once", async () => {
    const { app, runs } = buildControlledApp(async (run, body) => {
      if (run === 1) {
        return Response.json(
          { success: false, message: "bad", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      await Bun.sleep(200);
      return created(run, body);
    });
    const session = newSession();
    const key = crypto.randomUUID();
    const failed = await send(app, { session, key });
    expect(failed.status).toBe(400);

    const retries = await Promise.all(
      Array.from({ length: 4 }, () => send(app, { session, key })),
    );
    expect(runs()).toBe(2); // the failed run + exactly one successful run
    for (const reply of retries) {
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({ data: { run: 2 } });
    }
  });
});

describe("pruneIdempotencyKeys", () => {
  const row = (createdAt: Date) => ({
    sessionId: newSession(),
    key: crypto.randomUUID(),
    endpoint: `${P}endpoint`,
    requestHash: "hash",
    statusCode: 201,
    response: { success: true },
    createdAt,
  });
  const hoursAgo = (now: Date, hours: number) =>
    new Date(now.getTime() - hours * 3_600_000);

  test("BR-REC-165 the keys live 48 hours", () => {
    expect(IDEMPOTENCY_TTL_HOURS).toBe(48);
  });

  test("BR-REC-165 keys older than 48 hours are deleted, younger ones stay, and the number deleted is returned", async () => {
    const now = new Date();
    const old = [row(hoursAgo(now, 49)), row(hoursAgo(now, 72))];
    const young = [row(hoursAgo(now, 47)), row(hoursAgo(now, 1)), row(now)];
    await db.insert(idempotencyKeys).values([...old, ...young]);

    const removed = await pruneIdempotencyKeys(now);
    expect(removed).toBeGreaterThanOrEqual(old.length);

    const left = await db
      .select({ key: idempotencyKeys.key })
      .from(idempotencyKeys)
      .where(like(idempotencyKeys.endpoint, `${P}%`));
    const keys = new Set(left.map((r) => r.key));
    for (const r of old) expect(keys.has(r.key)).toBe(false);
    for (const r of young) expect(keys.has(r.key)).toBe(true);
  });

  test("BR-REC-165 pruning twice in a row deletes nothing the second time", async () => {
    const now = new Date();
    await db.insert(idempotencyKeys).values([row(hoursAgo(now, 60))]);
    await pruneIdempotencyKeys(now);
    expect(await pruneIdempotencyKeys(now)).toBe(0);
  });
});
