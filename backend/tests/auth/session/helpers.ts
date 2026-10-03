// Shared fixtures and HTTP helpers for the session tests (BR-REC-30…33, 37, 38, 43, 44).
// Everything here talks to the app only through its public surface: HTTP routes via
// `createApp().request`, the Drizzle tables, and the `bootstrap-admin` command.
import { createHmac } from "node:crypto";
import { join } from "node:path";

import { and, eq, gt, like, sql } from "drizzle-orm";
import { decodeJwt, type JWTPayload, SignJWT } from "jose";

import { createApp } from "../../../src/app";
import { db } from "../../../src/db/client";
import {
  appAccount,
  auditLog,
  authSessions,
  loginAttempts,
} from "../../../src/db/schemas";
import {
  type ApiBody,
  PROBE_MARKER,
  type ProbeResult,
  type ProbeStep,
} from "./probe-types";

export type { ApiBody, ProbeResult, ProbeStep };

export const BACKEND_DIR = join(import.meta.dir, "../../..");

/** The one public address of the app, as a browser sends it in `Origin`. */
export const APP_ORIGIN = new URL(
  process.env.APP_ORIGIN ?? "http://localhost:3000",
).origin;

/** Lower-case on purpose: usernames are stored lower-case (contract E01). */
export const TEST_USERNAME = "test_auth_session";
export const TEST_PASSWORD = "TEST_auth_session_Pw#1";

export const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET ?? "";
export const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET ?? "";

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const ago = (ms: number): Date => new Date(Date.now() - ms);
export const fromNow = (ms: number): Date => new Date(Date.now() + ms);

/** True when `actual` is within `toleranceMs` of `expected` (default 2 minutes). */
export function isNear(
  actual: Date | string | number,
  expected: Date | number,
  toleranceMs = 2 * MINUTE,
): boolean {
  const a = new Date(actual).getTime();
  const e = new Date(expected).getTime();
  return Number.isFinite(a) && Math.abs(a - e) <= toleranceMs;
}

// ---------------------------------------------------------------------------
// Database fixture: the one shared login, the one lock row, the change log
// ---------------------------------------------------------------------------

export type Fixture = {
  accountId: string;
  /** Highest `audit_log.id` that existed before the test file started. */
  auditBaseline: number;
  restore: () => Promise<void>;
};

/** argon2id at the cheapest sensible cost; the app verifies any argon2id hash. */
export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, {
    algorithm: "argon2id",
    memoryCost: 1024,
    timeCost: 1,
  });
}

export async function resetLock(): Promise<void> {
  await db
    .insert(loginAttempts)
    .values({ id: 1, failedCount: 0, windowStartedAt: null, lockedUntil: null })
    .onConflictDoUpdate({
      target: loginAttempts.id,
      set: { failedCount: 0, windowStartedAt: null, lockedUntil: null },
    });
}

export async function currentAuditBaseline(): Promise<number> {
  const [row] = await db
    .select({ maxId: sql<string>`coalesce(max(${auditLog.id}), 0)` })
    .from(auditLog);
  return Number(row?.maxId ?? 0);
}

/**
 * Makes `TEST_USERNAME` / `TEST_PASSWORD` the one login of the test database
 * (the account table holds exactly one row, BR-REC-168), with a clean lock
 * counter. Whatever was there before is saved and put back by `restore()`.
 * `restore()` also removes every `auth.*` change-log row written since.
 */
export async function installTestLogin(): Promise<Fixture> {
  const savedAccounts = await db.select().from(appAccount);
  const savedSessions = await db.select().from(authSessions);
  const savedAttempts = await db.select().from(loginAttempts);
  const auditBaseline = await currentAuditBaseline();

  await db.delete(appAccount); // sessions go with it (on delete cascade)
  const [account] = await db
    .insert(appAccount)
    .values({
      username: TEST_USERNAME,
      passwordHash: await hashPassword(TEST_PASSWORD),
      passwordChangedAt: new Date(),
    })
    .returning({ id: appAccount.id });
  if (!account) throw new Error("could not create the TEST login");
  await resetLock();

  return {
    accountId: account.id,
    auditBaseline,
    restore: async () => {
      await db
        .delete(auditLog)
        .where(
          and(gt(auditLog.id, auditBaseline), like(auditLog.action, "auth.%")),
        );
      await db.delete(appAccount);
      if (savedAccounts.length > 0) {
        await db.insert(appAccount).values(savedAccounts);
      }
      if (savedSessions.length > 0) {
        await db.insert(authSessions).values(savedSessions);
      }
      await db.delete(loginAttempts);
      if (savedAttempts.length > 0) {
        await db.insert(loginAttempts).values(savedAttempts);
      }
    },
  };
}

export async function setAccountPassword(plain: string): Promise<void> {
  await db.update(appAccount).set({ passwordHash: await hashPassword(plain) });
}

export async function sessionRow(sid: string) {
  const [row] = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sid));
  return row;
}

export async function sessionRowsOf(accountId: string) {
  return db
    .select()
    .from(authSessions)
    .where(eq(authSessions.accountId, accountId));
}

export async function patchSession(
  sid: string,
  patch: Partial<typeof authSessions.$inferInsert>,
): Promise<void> {
  await db.update(authSessions).set(patch).where(eq(authSessions.id, sid));
}

export async function authAuditSince(baseline: number) {
  return db
    .select()
    .from(auditLog)
    .where(and(gt(auditLog.id, baseline), like(auditLog.action, "auth.%")))
    .orderBy(auditLog.id);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export type SetCookie = {
  name: string;
  value: string;
  /** attribute name (lower-case) -> value ("" for flags such as HttpOnly) */
  attrs: Map<string, string>;
  raw: string;
};

export type Reply = {
  status: number;
  headers: Headers;
  body: ApiBody | null;
  setCookies: SetCookie[];
};

export function parseSetCookie(raw: string): SetCookie {
  const [pair = "", ...parts] = raw.split(";").map((part) => part.trim());
  const at = pair.indexOf("=");
  const attrs = new Map<string, string>();
  for (const part of parts) {
    const eqAt = part.indexOf("=");
    if (eqAt === -1) attrs.set(part.toLowerCase(), "");
    else attrs.set(part.slice(0, eqAt).toLowerCase(), part.slice(eqAt + 1));
  }
  return {
    name: at === -1 ? pair : pair.slice(0, at),
    value: at === -1 ? "" : pair.slice(at + 1),
    attrs,
    raw,
  };
}

export function cookieNamed(reply: Reply, name: string): SetCookie {
  const cookie = reply.setCookies.find((c) => c.name === name);
  if (!cookie) throw new Error(`no "${name}" cookie in the response`);
  return cookie;
}

const app = createApp();

export type CallOptions = {
  method?: string;
  body?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  /** `undefined` = the app's own origin, `null` = send no Origin header. */
  origin?: string | null;
  /** Network address of the caller (connecting address and X-Forwarded-For). */
  ip?: string;
};

let ipCounter = 0;
/** A new TEST-NET-3 address, so requests do not all share one rate-limit bucket. */
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${(ipCounter % 250) + 1}`;
}

export async function call(
  path: string,
  options: CallOptions = {},
): Promise<Reply> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const origin = options.origin === undefined ? APP_ORIGIN : options.origin;
  if (origin !== null) headers.Origin = origin;
  if (options.cookies) {
    headers.Cookie = Object.entries(options.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const ip = options.ip;
  let res: Response;
  if (ip === undefined) {
    res = await app.request(path, init);
  } else {
    headers["X-Forwarded-For"] = ip;
    res = await app.request(path, init, {
      requestIP: () => ({ address: ip, family: "IPv4", port: 40000 }),
    });
  }

  return {
    status: res.status,
    headers: res.headers,
    body: (await res.json().catch(() => null)) as ApiBody | null,
    setCookies: res.headers.getSetCookie().map(parseSetCookie),
  };
}

/**
 * Sign-in and refresh share rate-limit buckets (BR-REC-38) with every other
 * test in the run. A test that is not about the limit waits it out instead of
 * failing on a 429 RATE_LIMITED it did not ask for.
 */
export async function untilNotRateLimited(
  send: () => Promise<Reply>,
): Promise<Reply> {
  const giveUpAt = Date.now() + 75 * SECOND;
  for (;;) {
    const reply = await send();
    const limited = reply.status === 429 && reply.body?.code === "RATE_LIMITED";
    if (!limited || Date.now() > giveUpAt) return reply;
    await Bun.sleep(3 * SECOND);
  }
}

export type SignedIn = {
  reply: Reply;
  /** The device's current tokens; `adopt()` replaces them after a refresh. */
  accessToken: string;
  refreshToken: string;
  /** `auth_sessions.id`, also the `sid` claim of the access token. */
  sid: string;
  remember: boolean;
  expiresAt: Date;
};

export type SignInOptions = {
  remember?: boolean;
  username?: string;
  password?: string;
  ip?: string;
  headers?: Record<string, string>;
};

export function signInRequest(options: SignInOptions = {}): Promise<Reply> {
  return untilNotRateLimited(() =>
    call("/api/auth/login", {
      method: "POST",
      body: {
        username: options.username ?? TEST_USERNAME,
        password: options.password ?? TEST_PASSWORD,
        remember: options.remember ?? true,
      },
      ip: options.ip ?? freshIp(),
      headers: options.headers ?? {},
    }),
  );
}

/** Signs in through E01 and returns the device's tokens. Throws unless the answer is 200. */
export async function signIn(options: SignInOptions = {}): Promise<SignedIn> {
  const reply = await signInRequest(options);
  if (reply.status !== 200) {
    throw new Error(
      `sign-in failed: ${reply.status} ${JSON.stringify(reply.body)}`,
    );
  }
  const accessToken = cookieNamed(reply, "access_token").value;
  const refreshToken = cookieNamed(reply, "refresh_token").value;
  const sid = decodeJwt(accessToken).sid;
  if (typeof sid !== "string") throw new Error("access token has no sid");
  return {
    reply,
    accessToken,
    refreshToken,
    sid,
    remember: options.remember ?? true,
    expiresAt: new Date(String(reply.body?.data?.expiresAt)),
  };
}

/** E02 with only the refresh cookie, like the page guard and the app's fetch wrapper. */
export function refreshSession(
  refreshToken: string,
  ip: string = freshIp(),
): Promise<Reply> {
  return untilNotRateLimited(() =>
    call("/api/auth/refresh", {
      method: "POST",
      cookies: { refresh_token: refreshToken },
      ip,
    }),
  );
}

/** Keeps the device's tokens in step with a 200 refresh answer. */
export function adopt(device: SignedIn, reply: Reply): void {
  const access = reply.setCookies.find((c) => c.name === "access_token");
  const refresh = reply.setCookies.find((c) => c.name === "refresh_token");
  if (access) device.accessToken = access.value;
  if (refresh) device.refreshToken = refresh.value;
}

export function deviceCookies(device: SignedIn): Record<string, string> {
  return {
    access_token: device.accessToken,
    refresh_token: device.refreshToken,
  };
}

/** E05 with an access token (cookie). */
export function me(accessToken: string): Promise<Reply> {
  return call("/api/auth/me", { cookies: { access_token: accessToken } });
}

export function expiresAtOf(reply: Reply): Date {
  return new Date(String(reply.body?.data?.expiresAt));
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Re-signs the claims of a real access token (so `iss` / `aud` are right) with
 * a different secret, algorithm or expiry.
 */
export function resignAccessToken(
  realToken: string,
  options: {
    secret?: string;
    alg?: "HS256" | "HS384" | "HS512";
    /** seconds since the epoch */
    expiresAt?: number;
  } = {},
): Promise<string> {
  const claims: JWTPayload = decodeJwt(realToken);
  const jwt = new SignJWT({ ...claims }).setProtectedHeader({
    alg: options.alg ?? "HS256",
    typ: "JWT",
  });
  if (options.expiresAt !== undefined) jwt.setExpirationTime(options.expiresAt);
  return jwt.sign(new TextEncoder().encode(options.secret ?? ACCESS_SECRET));
}

/** The claims of a real token with `alg: none` and no signature. */
export function unsignedAccessToken(realToken: string): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part(decodeJwt(realToken))}.`;
}

/** Every way the database could plausibly hold the HMAC-SHA256 of a refresh token (BR-REC-30). */
export function hmacCandidates(token: string, secret: string): string[] {
  const inputs: (string | Buffer)[] = [token, Buffer.from(token, "base64url")];
  const candidates: string[] = [];
  for (const input of inputs) {
    const digest = createHmac("sha256", secret).update(input).digest();
    candidates.push(
      digest.toString("hex"),
      digest.toString("base64"),
      digest.toString("base64url"),
    );
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Child processes
// ---------------------------------------------------------------------------

/**
 * Environment for a child process: ours (already pointing at the *_test
 * database), plus overrides. `DATABASE_URL_TEST` must differ from
 * `DATABASE_URL` or the child's env check refuses to start, and the parent's
 * preload removed it, so the child's `.env` would put it back equal.
 */
export function childEnv(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) env[name] = value;
  }
  const unused = new URL(env.DATABASE_URL ?? "");
  unused.pathname = "/unused_test";
  return { ...env, DATABASE_URL_TEST: unused.toString(), ...overrides };
}

async function runChild(
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd: BACKEND_DIR,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** `bun run bootstrap-admin <args>` against the *_test database, without a terminal. */
export function runBootstrapAdmin(args: string[]) {
  return runChild(["scripts/bootstrap-admin.ts", ...args], childEnv());
}

/**
 * Sends `steps` through a fresh app in a new process started with
 * `envOverrides` (NODE_ENV, TRUST_PROXY_HOPS, token secrets) and an empty
 * rate-limit store.
 */
export async function runProbe(
  steps: ProbeStep[],
  envOverrides: Record<string, string> = {},
): Promise<ProbeResult[]> {
  const { exitCode, stdout, stderr } = await runChild(
    [join(import.meta.dir, "probe.ts")],
    childEnv({ ...envOverrides, PROBE_STEPS: JSON.stringify(steps) }),
  );
  const at = stdout.lastIndexOf(PROBE_MARKER);
  if (exitCode !== 0 || at === -1) {
    throw new Error(`probe failed (exit ${exitCode}): ${stderr || stdout}`);
  }
  return JSON.parse(stdout.slice(at + PROBE_MARKER.length)) as ProbeResult[];
}

/** A valid login request for `runProbe`. */
export function loginStep(
  extra: { remember?: boolean; headers?: Record<string, string> } = {},
): ProbeStep {
  return {
    method: "POST",
    path: "/api/auth/login",
    body: {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      remember: extra.remember ?? true,
    },
    ...(extra.headers ? { headers: extra.headers } : {}),
  };
}
