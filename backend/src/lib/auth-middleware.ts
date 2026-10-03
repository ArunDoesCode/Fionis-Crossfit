import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import { ForbiddenError, UnauthorizedError } from "./errors";
import type { PermissionKey } from "./permissions";
import { verifyAccessToken } from "./token";
import type { AppEnv } from "./types";

/** The authenticated caller. Skeleton: derived from the access token only. */
export type Actor = {
  id: string;
  name: string;
  /** The sign-in session (`sid` claim); keys idempotency records and change-log rows. */
  sessionId: string;
  permissions: ReadonlySet<PermissionKey>;
};

/** Permission decision for service-layer checks. */
export function can(actor: Actor, key: PermissionKey): boolean {
  return actor.permissions.has(key);
}

export const ACCESS_COOKIE = "access_token";

function readToken(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
): string | undefined {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return getCookie(c, ACCESS_COOKIE);
}

/** Token check (401). Sets `actor` on the context; runs once per request. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("actor")) {
    const token = readToken(c);
    if (!token) throw new UnauthorizedError("Unauthorized");

    let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
    try {
      payload = await verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError("Invalid access token");
    }

    c.set("actor", {
      id: payload.userId,
      name: payload.userName,
      sessionId: payload.sid,
      permissions: new Set(payload.permissions),
    });
  }
  await next();
};

/** `requireAuth` (401) then the permission-key check (403 PERMISSION_DENIED). */
export function requirePermission(
  key: PermissionKey,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await requireAuth(c, async () => {});
    if (!can(c.get("actor"), key)) {
      throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
        key,
      });
    }
    await next();
  };
}
