import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createApp } from "../../src/app";
import { ACCESS_COOKIE } from "../../src/lib/auth-middleware";
import {
  createSignedInSession,
  type SignedInSession,
} from "../helpers/session";

// R-1 / RV-1 regression: BR-REC-161 (Cache-Control, Server-Timing, gzip over 1 KB) and
// BR-REC-147 + api-contract changelog (E39 CSV is streamed, not buffered, not gzip-compressed).
//
// `app.request()` never sends `Accept-Encoding`, so the unit tests in
// response-headers.test.ts cannot see what a browser sees. These tests serve the real
// `createApp()` stack with Bun.serve on a free port and fetch it over HTTP, the way a
// browser does (it always sends `Accept-Encoding: gzip, ...`).

const PROBE = "/api/test-foundation-probe";

/** Browser-like `Accept-Encoding` values: none asked for, gzip only, and what Chrome/Firefox send. */
const ENCODINGS: [label: string, header: string][] = [
  ["identity", "identity"],
  ["gzip", "gzip"],
  ["a browser list", "gzip, deflate, br, zstd"],
];

const wantsGzip = (header: string) => header.includes("gzip");

const smallBody = { success: true, data: { filler: "x".repeat(200) } };
const largeBody = { success: true, data: { filler: "y".repeat(3000) } };

let server: ReturnType<typeof Bun.serve>;
let session: SignedInSession;
let releaseCsv: () => void = () => {};
const base = () => `http://localhost:${server.port}`;

beforeAll(async () => {
  session = await createSignedInSession();
  const app = createApp();
  // Extra probe routes on the real app, so the real middleware stack answers them.
  app.get(`${PROBE}/small`, (c) => c.json(smallBody));
  app.get(`${PROBE}/large`, (c) => c.json(largeBody));
  const csvResponse = (body: ReadableStream<Uint8Array>) =>
    new Response(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  app.get(`${PROBE}/csv-quick`, () => {
    const encoder = new TextEncoder();
    return csvResponse(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("id,name\n1,Surya\n"));
          controller.enqueue(encoder.encode("2,Meera\n"));
          controller.close();
        },
      }),
    );
  });
  app.get(`${PROBE}/csv`, () => {
    const encoder = new TextEncoder();
    const gate = new Promise<void>((resolve) => {
      releaseCsv = resolve;
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("id,name\n"));
        controller.enqueue(encoder.encode("1,Surya\n"));
        // The export is not finished until the test lets it finish.
        void gate.then(() => {
          controller.enqueue(encoder.encode("2,Meera\n"));
          controller.close();
        });
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  });
  server = Bun.serve({ port: 0, fetch: app.fetch });
});

afterAll(async () => {
  releaseCsv();
  await server?.stop(true);
  await session?.cleanup();
});

type Fetched = { res: Response; bytes: Uint8Array<ArrayBuffer> };

/** One HTTP call, answer kept exactly as sent (no automatic decompression). */
async function fetchRaw(
  path: string,
  options: { encoding?: string; signedIn?: boolean } = {},
): Promise<Fetched> {
  const headers: Record<string, string> = {};
  if (options.encoding) headers["Accept-Encoding"] = options.encoding;
  if (options.signedIn) headers.Cookie = `${ACCESS_COOKIE}=${session.token}`;
  const res = await fetch(`${base()}${path}`, {
    headers,
    decompress: false,
  } as RequestInit);
  return { res, bytes: new Uint8Array(await res.arrayBuffer()) };
}

/** The text a client ends up with: gunzipped when the answer says it is gzip. */
function textOf({ res, bytes }: Fetched): string {
  const encoding = res.headers.get("content-encoding");
  if (encoding !== null && encoding !== "gzip") {
    throw new Error(`unexpected content-encoding ${encoding}`);
  }
  return new TextDecoder().decode(
    encoding === "gzip" ? Bun.gunzipSync(bytes) : bytes,
  );
}

function expectLengthMatches({ res, bytes }: Fetched) {
  const length = res.headers.get("content-length");
  if (length !== null) expect(Number(length)).toBe(bytes.length);
}

describe("BR-REC-161 over a real server (Bun.serve), as a browser calls it", () => {
  for (const [label, encoding] of ENCODINGS) {
    test(`BR-REC-161 a JSON reply under 1 KB arrives with its whole body (Accept-Encoding: ${label})`, async () => {
      const got = await fetchRaw(`${PROBE}/small`, { encoding });
      expect(got.res.status).toBe(200);
      expect(got.bytes.length).toBeGreaterThan(0);
      expect(JSON.parse(textOf(got))).toEqual(smallBody);
      expectLengthMatches(got);
    });

    test(`BR-REC-161 a JSON reply over 1 KB arrives intact, gzip only for a client that accepts gzip (Accept-Encoding: ${label})`, async () => {
      const got = await fetchRaw(`${PROBE}/large`, { encoding });
      expect(got.res.status).toBe(200);
      expect(got.res.headers.get("content-encoding")).toBe(
        wantsGzip(encoding) ? "gzip" : null,
      );
      expect(JSON.parse(textOf(got))).toEqual(largeBody);
      expectLengthMatches(got);
      if (wantsGzip(encoding)) {
        // it really is smaller on the wire than the 3 KB it carries
        expect(got.bytes.length).toBeLessThan(1024);
      }
    });

    test(`BR-REC-161 the health check body arrives (Accept-Encoding: ${label})`, async () => {
      const got = await fetchRaw("/api/health", { encoding });
      expect(got.res.status).toBe(200);
      expect(JSON.parse(textOf(got))).toMatchObject({ success: true });
      expectLengthMatches(got);
    });

    test(`BR-REC-154 BR-REC-161 an error reply keeps its body: 401 UNAUTHORIZED without a sign-in (Accept-Encoding: ${label})`, async () => {
      const got = await fetchRaw("/api/members", { encoding });
      expect(got.res.status).toBe(401);
      expect(JSON.parse(textOf(got))).toMatchObject({
        success: false,
        code: "UNAUTHORIZED",
      });
      expectLengthMatches(got);
    });

    test(`BR-REC-154 BR-REC-161 an error reply keeps its body: 400 VALIDATION_ERROR when signed in (Accept-Encoding: ${label})`, async () => {
      const got = await fetchRaw("/api/members?pageSize=500", {
        encoding,
        signedIn: true,
      });
      expect(got.res.status).toBe(400);
      expect(JSON.parse(textOf(got))).toMatchObject({
        success: false,
        code: "VALIDATION_ERROR",
      });
      expectLengthMatches(got);
    });
  }

  test("BR-REC-161 Cache-Control private, no-store and Server-Timing (db, total) are on every data reply a gzip client gets", async () => {
    for (const path of [`${PROBE}/small`, `${PROBE}/large`, "/api/health"]) {
      const { res } = await fetchRaw(path, { encoding: "gzip" });
      const directives = (res.headers.get("cache-control") ?? "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .sort();
      expect(directives, path).toEqual(["no-store", "private"]);
      const timing = res.headers.get("server-timing") ?? "";
      expect(timing, path).toMatch(/\bdb;dur=\d/);
      expect(timing, path).toMatch(/\btotal;dur=\d/);
    }
  });
});

describe("BR-REC-147 / api-contract E39: a streamed text/csv answer is not buffered", () => {
  const FULL_CSV = "id,name\n1,Surya\n2,Meera\n";

  for (const [label, encoding] of ENCODINGS) {
    test(`BR-REC-147 the first chunk of a CSV stream arrives while the export is still running (Accept-Encoding: ${label})`, async () => {
      const decoder = new TextDecoder();
      const answer = (async () => {
        const res = await fetch(`${base()}${PROBE}/csv`, {
          headers: { "Accept-Encoding": encoding },
        });
        const reader = (res.body as ReadableStream<Uint8Array>).getReader();
        const first = await reader.read();
        return { res, reader, first };
      })();
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 2000),
      );

      // The export is held open (releaseCsv not called yet): its first rows must already be out.
      let outcome: Awaited<typeof answer> | "timeout" | undefined;
      try {
        outcome = await Promise.race([answer, timeout]);
        expect(
          outcome === "timeout"
            ? "held back until the stream ended"
            : "streamed",
        ).toBe("streamed");
        if (outcome === "timeout") return;

        const { res, reader, first } = outcome;
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
        expect(first.done).toBe(false);
        let text = decoder.decode(first.value, { stream: true });
        expect(text.startsWith("id,name\n")).toBe(true);
        expect(text).not.toContain("Meera"); // the last row does not exist yet

        releaseCsv();
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          text += decoder.decode(next.value, { stream: true });
        }
        expect(text).toBe(FULL_CSV);
      } finally {
        // never leave the export hanging, even when an assertion above fails
        releaseCsv();
        void answer.catch(() => {});
      }
    });
  }

  test("api-contract E39 the CSV stream is not gzip-compressed by the API, even for a client that accepts gzip", async () => {
    const got = await fetchRaw(`${PROBE}/csv-quick`, { encoding: "gzip" });
    expect(got.res.headers.get("content-encoding")).toBeNull();
    expect(textOf(got)).toBe(FULL_CSV);
  });

  test("BR-REC-161 a CSV answer is a data response: Cache-Control private, no-store", async () => {
    const { res } = await fetchRaw(`${PROBE}/csv-quick`, { encoding: "gzip" });
    const directives = (res.headers.get("cache-control") ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .sort();
    expect(directives).toEqual(["no-store", "private"]);
  });

  test("BR-REC-161 JSON over 1 KB is still gzip-compressed while CSV is left alone", async () => {
    const csv = await fetchRaw(`${PROBE}/csv-quick`, { encoding: "gzip" });
    const json = await fetchRaw(`${PROBE}/large`, { encoding: "gzip" });
    expect(csv.res.headers.get("content-encoding")).toBeNull();
    expect(json.res.headers.get("content-encoding")).toBe("gzip");
    expect(JSON.parse(textOf(json))).toEqual(largeBody);
  });
});
