import { describe, expect, test } from "bun:test";

import { etagMiddleware } from "../../src/lib/etag";
import { call, miniApp } from "../helpers/http";

// BR-REC-160: E07 settings and E09 catalog send an ETag; a matching
// If-None-Match gets 304 with no body.

function etagApp() {
  const app = miniApp();
  const state = { value: { gymName: "Fionis CrossFit", upcomingLeadDays: 7 } };
  app.get("/thing", etagMiddleware(), (c) =>
    c.json({ success: true, data: state.value }),
  );
  return { app, state };
}

const etagOf = (headers: Headers) => headers.get("etag") ?? "";

describe("etagMiddleware", () => {
  test("BR-REC-160 a 200 answer carries a quoted ETag", async () => {
    const { app } = etagApp();
    const reply = await call(app, "GET", "/thing", { token: null });
    expect(reply.status).toBe(200);
    expect(etagOf(reply.headers)).toMatch(/^(W\/)?"[^"]+"$/);
  });

  test("BR-REC-160 the same data gives the same ETag", async () => {
    const { app } = etagApp();
    const first = await call(app, "GET", "/thing", { token: null });
    const second = await call(app, "GET", "/thing", { token: null });
    expect(etagOf(first.headers)).not.toBe("");
    expect(etagOf(second.headers)).toBe(etagOf(first.headers));
  });

  test("BR-REC-160 a matching If-None-Match gets 304 with no body", async () => {
    const { app } = etagApp();
    const first = await call(app, "GET", "/thing", { token: null });
    const second = await call(app, "GET", "/thing", {
      token: null,
      headers: { "If-None-Match": etagOf(first.headers) },
    });
    expect(second.status).toBe(304);
    expect(await second.res.text()).toBe("");
  });

  test("BR-REC-160 a changed answer gets a new ETag and a full 200 even with the old If-None-Match", async () => {
    const { app, state } = etagApp();
    const first = await call(app, "GET", "/thing", { token: null });
    state.value = { gymName: "Fionis CrossFit", upcomingLeadDays: 10 };
    const second = await call(app, "GET", "/thing", {
      token: null,
      headers: { "If-None-Match": etagOf(first.headers) },
    });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      success: true,
      data: { upcomingLeadDays: 10 },
    });
    expect(etagOf(second.headers)).not.toBe(etagOf(first.headers));
  });

  test("BR-REC-160 a non-matching If-None-Match gets the full answer", async () => {
    const { app } = etagApp();
    const reply = await call(app, "GET", "/thing", {
      token: null,
      headers: { "If-None-Match": '"something-else"' },
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ success: true });
  });
});
