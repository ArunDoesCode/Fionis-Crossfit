import { describe, expect, test } from "bun:test";

import { createApp } from "../src/app";

describe("app smoke", () => {
  test("GET /api/health responds 200 with ok/up when the test DB is reachable", async () => {
    const res = await createApp().request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { status: "ok", db: "up" },
    });
  });

  test("tests run against a *_test database", () => {
    const name = new URL(process.env.DATABASE_URL ?? "").pathname.replace(
      /^\//,
      "",
    );
    expect(name.endsWith("_test")).toBe(true);
  });

  test("unknown path returns the 404 error envelope", async () => {
    const res = await createApp().request("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "NOT_FOUND",
    });
  });

  test("CORS allows the configured APP_ORIGIN", async () => {
    const origin = process.env.APP_ORIGIN ?? "";
    const res = await createApp().request("/api/health", {
      headers: { Origin: origin },
    });

    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
  });

  test("request bodies over 1 MiB are rejected with 413 PAYLOAD_TOO_LARGE", async () => {
    const body = "x".repeat(1024 * 1024 + 1);
    const res = await createApp().request("/api/health", {
      method: "POST",
      headers: { "Content-Length": String(body.length) },
      body,
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});
