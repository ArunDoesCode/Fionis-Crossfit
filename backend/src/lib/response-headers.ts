import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./types";

/** gzip threshold in bytes: smaller bodies are sent as they are (BR-REC-161). */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

/** True unless the header refuses gzip (`gzip;q=0`) or does not list it (`*` counts). */
function acceptsGzip(header: string | undefined): boolean {
  if (!header) return false;
  for (const part of header.split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (name !== "gzip" && name !== "*") continue;
    const q = params
      .map((p) => p.trim())
      .find((p) => p.startsWith("q="))
      ?.slice(2);
    return q === undefined || Number(q) > 0;
  }
  return false;
}

/** `application/json` and `application/*+json`: the only bodies this middleware compresses. */
const JSON_CONTENT_TYPE = /^\s*application\/(?:[\w.+-]+\+)?json\s*(?:;|$)/i;

/**
 * Global middleware for API responses (BR-REC-161): sets
 * `Cache-Control: private, no-store` and gzip-compresses a JSON body over
 * `COMPRESSION_THRESHOLD_BYTES` when the client accepts gzip
 * (`Content-Encoding: gzip`).
 *
 * Only JSON is touched: this API builds every JSON body whole (`c.json`), so its
 * size is known once it is read. Streamed replies (the E39 CSV export, SSE) have
 * other content types and pass through untouched, so their first byte is never
 * held back (BR-REC-147); the HTTPS front may compress them.
 * Hono's `compress()` is not used: it only applies its size threshold when a
 * `Content-Length` header exists, which `c.json()` does not set.
 */
export function dataResponseHeaders(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    c.header("Cache-Control", "private, no-store");

    const res = c.res;
    const declaredLength = res.headers.get("Content-Length");
    if (
      c.req.method === "HEAD" ||
      res.body === null ||
      res.headers.has("Content-Encoding") ||
      res.headers.has("Transfer-Encoding") ||
      !JSON_CONTENT_TYPE.test(res.headers.get("Content-Type") ?? "") ||
      (declaredLength !== null &&
        Number(declaredLength) <= COMPRESSION_THRESHOLD_BYTES) ||
      !acceptsGzip(c.req.header("Accept-Encoding"))
    ) {
      return;
    }

    // Reading the body uses it up, so `c.res` is always replaced by a fresh
    // response built from the bytes (an empty reply on Bun.serve otherwise).
    const body = new Uint8Array(await res.arrayBuffer());
    const compress = body.byteLength > COMPRESSION_THRESHOLD_BYTES;
    c.res = new Response(compress ? Bun.gzipSync(body) : body, res);
    if (!compress) return;

    // `c.res = ...` copies the old headers over the new response, so the
    // compressed-body headers are set on the response now stored in `c.res`.
    const headers = c.res.headers;
    headers.set("Content-Encoding", "gzip");
    headers.delete("Content-Length");
    const vary = headers.get("Vary");
    if (!vary) headers.set("Vary", "Accept-Encoding");
    else if (!/(^|,)\s*accept-encoding\s*(,|$)/i.test(vary)) {
      headers.set("Vary", `${vary}, Accept-Encoding`);
    }
    const etag = headers.get("ETag");
    if (etag && !etag.startsWith("W/")) headers.set("ETag", `W/${etag}`);
  };
}
