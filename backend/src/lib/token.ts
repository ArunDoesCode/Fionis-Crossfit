import { jwtVerify, SignJWT } from "jose";

import { env } from "./env";
import { PERMISSION_KEYS, type PermissionKey } from "./permissions";

export type TokenPayload = {
  userId: string;
  userName: string;
  /** Permission keys granted to this actor. Skeleton: auth module decides the real source. */
  permissions: PermissionKey[];
};

const accessSecret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
const refreshSecret = new TextEncoder().encode(env.REFRESH_TOKEN_SECRET);

const isPermissionKeyList = (value: unknown): value is PermissionKey[] =>
  Array.isArray(value) &&
  value.every((v) => PERMISSION_KEYS.includes(v as PermissionKey));

function toPayload(raw: Record<string, unknown>): TokenPayload {
  const { userId, userName, permissions } = raw;
  if (
    typeof userId !== "string" ||
    typeof userName !== "string" ||
    !isPermissionKeyList(permissions)
  ) {
    throw new Error("Malformed token payload");
  }
  return { userId, userName, permissions };
}

export async function signAccessToken(payload: TokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: TokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${env.REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret, {
    algorithms: ["HS256"],
  });
  return toPayload(payload);
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, refreshSecret, {
    algorithms: ["HS256"],
  });
  return toPayload(payload);
}
