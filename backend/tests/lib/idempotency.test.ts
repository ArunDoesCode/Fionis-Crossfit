import { afterAll, describe, expect, test } from "bun:test";

import { eq, inArray, like } from "drizzle-orm";

import { db } from "../../src/db/client";
import { idempotencyKeys } from "../../src/db/schemas";
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
