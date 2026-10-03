import { describe, expect, test } from "bun:test";

import { createApp } from "../../src/app";
import {
  formatServerTiming,
  measureDb,
  serverTiming,
} from "../../src/lib/server-timing";
import { miniApp } from "../helpers/http";

// BR-REC-161: every data response carries Server-Timing with `db` and `total`.

const HEADER = /^db;dur=(\d+(?:\.\d+)?), total;dur=(\d+(?:\.\d+)?)$/;

function parse(header: string | null): { db: number; total: number } {
  const match = HEADER.exec(header ?? "");
  if (!match) throw new Error(`Unexpected Server-Timing: ${header}`);
  return { db: Number(match[1]), total: Number(match[2]) };
}

function buildApp() {
  const app = miniApp();
  app.use("*", serverTiming());
  app.get("/fast", (c) => c.json({ success: true, data: {} }));
  app.get("/db-slow", async (c) => {
    await measureDb(() => Bun.sleep(60));
    return c.json({ success: true, data: {} });
  });
  app.get("/db-twice", async (c) => {
    await measureDb(() => Bun.sleep(40));
    await measureDb(() => Bun.sleep(40));
    return c.json({ success: true, data: {} });
  });
  app.get("/other-slow", async (c) => {
    await Bun.sleep(60);
    return c.json({ success: true, data: {} });
  });
  return app;
}

describe("formatServerTiming", () => {
  test("BR-REC-161 formats db and total in milliseconds", () => {
    expect(formatServerTiming({ dbMs: 12.3, totalMs: 45.6 })).toBe(
      "db;dur=12.3, total;dur=45.6",
    );
  });

  test("BR-REC-161 zero db time is still written", () => {
    expect(formatServerTiming({ dbMs: 0, totalMs: 7 })).toMatch(
      /^db;dur=0(\.0+)?, total;dur=7(\.0+)?$/,
    );
  });
});

describe("serverTiming and measureDb", () => {
  test("BR-REC-161 every response has Server-Timing with db and total", async () => {
    const res = await buildApp().request("/fast");
    const { db, total } = parse(res.headers.get("server-timing"));
    expect(db).toBeGreaterThanOrEqual(0);
    expect(total).toBeGreaterThanOrEqual(db);
  });

  test("BR-REC-161 db counts the time spent inside measureDb, total the whole request", async () => {
    const res = await buildApp().request("/db-slow");
    const { db, total } = parse(res.headers.get("server-timing"));
    expect(db).toBeGreaterThanOrEqual(45);
    expect(total).toBeGreaterThanOrEqual(db);
  });

  test("BR-REC-161 several measureDb calls in one request add up", async () => {
    const res = await buildApp().request("/db-twice");
    const { db } = parse(res.headers.get("server-timing"));
    expect(db).toBeGreaterThanOrEqual(70);
  });

  test("BR-REC-161 time outside measureDb counts toward total only", async () => {
    const res = await buildApp().request("/other-slow");
    const { db, total } = parse(res.headers.get("server-timing"));
    expect(total).toBeGreaterThanOrEqual(45);
    expect(db).toBeLessThan(20);
  });

  test("BR-REC-161 two requests at the same time keep their own db time", async () => {
    const app = buildApp();
    const [slow, fast] = await Promise.all([
      app.request("/db-slow"),
      app.request("/fast"),
    ]);
    expect(parse(slow.headers.get("server-timing")).db).toBeGreaterThanOrEqual(
      45,
    );
    expect(parse(fast.headers.get("server-timing")).db).toBeLessThan(20);
  });

  test("BR-REC-161 measureDb returns the query's result and passes its error on", async () => {
    expect(await measureDb(async () => 42)).toBe(42);
    await expect(
      measureDb(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  test("BR-REC-161 the real app sends Server-Timing on a data response", async () => {
    const res = await createApp().request("/api/health");
    parse(res.headers.get("server-timing"));
  });
});
