import type { MiddlewareHandler } from "hono";
import { COMPRESSIBLE_CONTENT_TYPE_REGEX } from "hono/utils/compress";

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

/**
 * Global middleware for API responses (BR-REC-161): sets
 * `Cache-Control: private, no-store` and gzip-compresses bodies over
 * `COMPRESSION_THRESHOLD_BYTES` when the client accepts gzip
 * (`Content-Encoding: gzip`). Hono's `compress()` is not used: it only applies
 * its size threshold when a `Content-Length` header exists, which `c.json()`
 * does not set.
 */
export function dataResponseHeaders(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    c.header("Cache-Control", "private, no-store");

    const res = c.res;
    const type = res.headers.get("Content-Type");
    if (
      c.req.method === "HEAD" ||
      res.body === null ||
      res.headers.has("Content-Encoding") ||
      !type ||
      !COMPRESSIBLE_CONTENT_TYPE_REGEX.test(type) ||
      !acceptsGzip(c.req.header("Accept-Encoding"))
    ) {
      return;
    }

    const body = new Uint8Array(await res.clone().arrayBuffer());
    if (body.byteLength <= COMPRESSION_THRESHOLD_BYTES) return;

    const compressed = new Response(Bun.gzipSync(body), res);
    compressed.headers.set("Content-Encoding", "gzip");
    compressed.headers.delete("Content-Length");
    const vary = res.headers.get("Vary");
    if (!vary) compressed.headers.set("Vary", "Accept-Encoding");
    else if (!/(^|,)\s*accept-encoding\s*(,|$)/i.test(vary)) {
      compressed.headers.set("Vary", `${vary}, Accept-Encoding`);
    }
    const etag = compressed.headers.get("ETag");
    if (etag && !etag.startsWith("W/")) {
      compressed.headers.set("ETag", `W/${etag}`);
    }
    c.res = compressed;
  };
}
