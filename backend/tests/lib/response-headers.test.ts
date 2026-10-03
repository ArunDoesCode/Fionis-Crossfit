import { describe, expect, test } from "bun:test";

import { createApp } from "../../src/app";
import { dataResponseHeaders } from "../../src/lib/response-headers";
import { miniApp } from "../helpers/http";

// BR-REC-161: data responses carry Cache-Control: private, no-store, and are
// gzip-compressed when over 1 KB.

function bodyOf(bytes: number) {
  return { success: true, data: { filler: "x".repeat(bytes) } };
}

function buildApp() {
  const app = miniApp();
  app.use("*", dataResponseHeaders());
  app.get("/small", (c) => c.json(bodyOf(200)));
  app.get("/large", (c) => c.json(bodyOf(3000)));
  return app;
}

const get = (
  app: ReturnType<typeof buildApp>,
  path: string,
  encoding?: string,
) =>
  app.request(path, {
    headers: encoding ? { "Accept-Encoding": encoding } : {},
  });

describe("dataResponseHeaders", () => {
  test("BR-REC-161 a data response is Cache-Control private, no-store", async () => {
    const res = await get(buildApp(), "/small");
    const directives = (res.headers.get("cache-control") ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .sort();
    expect(directives).toEqual(["no-store", "private"]);
  });

  test("BR-REC-161 a body over 1 KB is gzip-compressed for a client that accepts gzip", async () => {
    const res = await get(buildApp(), "/large", "gzip");
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const text = new TextDecoder().decode(
      Bun.gunzipSync(new Uint8Array(await res.arrayBuffer())),
    );
    expect(JSON.parse(text)).toEqual(bodyOf(3000));
  });

  test("BR-REC-161 a body under 1 KB is sent as it is", async () => {
    const res = await get(buildApp(), "/small", "gzip");
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.json()).toEqual(bodyOf(200));
  });

  test("BR-REC-161 nothing is compressed for a client that does not accept gzip", async () => {
    const res = await get(buildApp(), "/large");
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.json()).toEqual(bodyOf(3000));
  });

  test("BR-REC-161 the real app sends Cache-Control private, no-store on a data response", async () => {
    const res = await createApp().request("/api/health");
    const directives = (res.headers.get("cache-control") ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .sort();
    expect(directives).toEqual(["no-store", "private"]);
  });
});
