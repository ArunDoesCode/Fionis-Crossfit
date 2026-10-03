import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { ACCESS_COOKIE } from "./auth-middleware";
import { env } from "./env";
import { BadRequestError } from "./errors";

type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** `{ success: true, data }` */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true as const, data }, status);
}

/** `{ success: true, data, meta }` for lists. */
export function okPaginated<T>(
  c: Context,
  data: T[],
  meta: { page: number; pageSize: number; total: number },
) {
  const body: PaginationMeta = {
    ...meta,
    totalPages: Math.max(1, Math.ceil(meta.total / meta.pageSize)),
  };
  return c.json({ success: true as const, data, meta: body });
}

/**
 * `{ success: false, message, code?, details? }` — used by the global error handler.
 * A 429 whose `details.retryAfterSeconds` is a number also gets the `Retry-After` header.
 */
export function failure(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
) {
  const retryAfter = details?.retryAfterSeconds;
  if (status === 429 && typeof retryAfter === "number") {
    c.header("Retry-After", String(retryAfter));
  }
  return c.json(
    {
      success: false as const,
      message,
      ...(code === undefined ? {} : { code }),
      ...(details === undefined ? {} : { details }),
    },
    status,
  );
}

/** Reads the JSON body; unparsable or empty JSON is 400 `INVALID_JSON`. */
export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("Request body is not valid JSON", "INVALID_JSON");
  }
}

/** Name of the sign-in cookie that rotates (BR-REC-30); the access cookie is `ACCESS_COOKIE`. */
export const REFRESH_COOKIE = "refresh_token";

/** Attributes both sign-in cookies share (BR-REC-30): httpOnly, SameSite=Lax, Path=/, Secure in production. */
const baseCookie = () =>
  ({
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
  }) as const;

/** Lives as long as the access token, whether or not "Keep me signed in" is ticked. */
export function setAccessCookie(c: Context, token: string) {
  setCookie(c, ACCESS_COOKIE, token, {
    ...baseCookie(),
    maxAge: Math.round(env.ACCESS_TOKEN_TTL_SECONDS),
  });
}

/** `remember`: Max-Age 7 days (renewed on each refresh); otherwise a browser-session cookie (BR-REC-31). */
export function setRefreshCookie(c: Context, token: string, remember: boolean) {
  setCookie(
    c,
    REFRESH_COOKIE,
    token,
    remember
      ? { ...baseCookie(), maxAge: Math.round(env.REFRESH_TOKEN_TTL_SECONDS) }
      : baseCookie(),
  );
}

/** Both cookies cleared (`Max-Age=0`): sign out, sign out all. */
export function clearAuthCookies(c: Context) {
  deleteCookie(c, ACCESS_COOKIE, baseCookie());
  deleteCookie(c, REFRESH_COOKIE, baseCookie());
}

export function readRefreshCookie(c: Context) {
  return getCookie(c, REFRESH_COOKIE);
}

/** The change log keeps at most this many characters of an address or device text (BR-REC-43). */
const LOG_TEXT_MAX = 60;

type BunServerBindings = {
  requestIP?: (request: Request) => { address: string } | null;
};

/**
 * The caller's network address for the change log and session rows.
 * `TRUST_PROXY_HOPS` = 0: the connecting address (the header is ignored).
 * `TRUST_PROXY_HOPS` = n: the `X-Forwarded-For` entry n places from the right, the one our own
 * proxy appended; entries further left come from the browser and are never used (BR-REC-38).
 */
export function clientAddress(c: Context): string | null {
  if (env.TRUST_PROXY_HOPS > 0) {
    const entries = (c.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const trusted = entries[entries.length - env.TRUST_PROXY_HOPS];
    if (trusted) return trusted.slice(0, LOG_TEXT_MAX);
  }
  const server = c.env as BunServerBindings | undefined;
  return server?.requestIP?.(c.req.raw)?.address.slice(0, LOG_TEXT_MAX) ?? null;
}

// Order matters: Android before Linux, iOS before macOS, Edge/Opera before Chrome, Chrome before Safari.
const OS_RULES: readonly [RegExp, string][] = [
  [/android/i, "Android"],
  [/iphone|ipad|ipod/i, "iOS"],
  [/windows/i, "Windows"],
  [/cros/i, "ChromeOS"],
  [/mac os x|macintosh/i, "macOS"],
  [/linux/i, "Linux"],
];
const BROWSER_RULES: readonly [RegExp, string][] = [
  [/edg(?:e|a|ios)?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/firefox\/|fxios\//i, "Firefox"],
  [/chrome\/|crios\//i, "Chrome"],
  [/safari\//i, "Safari"],
];

/**
 * "Chrome on Android" from a User-Agent, at most 60 characters (BR-REC-43).
 * An unknown agent is logged as its own (cut) text; no header gives null.
 */
export function deviceLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = BROWSER_RULES.find(([re]) => re.test(userAgent))?.[1];
  const os = OS_RULES.find(([re]) => re.test(userAgent))?.[1];
  const label =
    browser && os ? `${browser} on ${os}` : (browser ?? os ?? userAgent);
  return label.slice(0, LOG_TEXT_MAX);
}
