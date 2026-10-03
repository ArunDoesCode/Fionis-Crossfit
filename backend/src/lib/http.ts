import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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

/** `{ success: false, message, code?, details? }` — used by the global error handler. */
export function failure(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
) {
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

export function setRefreshCookie(c: Context, token: string) {
  setCookie(c, "refresh_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearRefreshCookie(c: Context) {
  deleteCookie(c, "refresh_token", { path: "/" });
}

export function readRefreshCookie(c: Context) {
  return getCookie(c, "refresh_token");
}
