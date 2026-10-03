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

  test("BR-REC-36 the API is same-origin: a request from the app's address gets no CORS headers", async () => {
    const origin = process.env.APP_ORIGIN ?? "";
    const res = await createApp().request("/api/health", {
      headers: { Origin: origin },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("BR-REC-36 there is no CORS preflight handling (no OPTIONS answer with allow headers)", async () => {
    const origin = process.env.APP_ORIGIN ?? "";
    const res = await createApp().request("/api/members", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-methods")).toBeNull();
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
