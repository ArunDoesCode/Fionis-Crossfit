import { createHmac, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { uuidSchema } from "../types/common.types";
import { env } from "./env";
import { PERMISSION_KEYS, type PermissionKey } from "./permissions";

export type TokenPayload = {
  userId: string;
  userName: string;
  /** Sign-in session id (uuid); `idempotency_keys` and `audit_log` are keyed by it (D-019). */
  sid: string;
  /** Permission keys granted to this actor. Skeleton: auth module decides the real source. */
  permissions: PermissionKey[];
};

/** `iss` / `aud` claims of every access token (BR-REC-30); a token without them is refused. */
export const ACCESS_TOKEN_ISSUER = "fionis-crossfit-api";
export const ACCESS_TOKEN_AUDIENCE = "fionis-crossfit-app";

const accessSecret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);

const isPermissionKeyList = (value: unknown): value is PermissionKey[] =>
  Array.isArray(value) &&
  value.every((v) => PERMISSION_KEYS.includes(v as PermissionKey));

function toPayload(raw: Record<string, unknown>): TokenPayload {
  const { userId, userName, permissions } = raw;
  const sid = uuidSchema.safeParse(raw.sid);
  if (
    typeof userId !== "string" ||
    typeof userName !== "string" ||
    !sid.success ||
    !isPermissionKeyList(permissions)
  ) {
    throw new Error("Malformed token payload");
  }
  return { userId, userName, sid: sid.data, permissions };
}

export async function signAccessToken(payload: TokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

/** Signature, expiry, issuer and audience only: never reads the database (BR-REC-33). */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret, {
    algorithms: ["HS256"],
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
  });
  return toPayload(payload);
}

/** A new refresh token: 32 random bytes, base64url (BR-REC-30). Only its HMAC is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What the database keeps of a refresh token: HMAC-SHA256 keyed with
 * `REFRESH_TOKEN_SECRET`, hex. Rotating that secret orphans every stored token,
 * which signs every device out (BR-REC-44).
 */
export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env.REFRESH_TOKEN_SECRET)
    .update(token)
    .digest("hex");
}
