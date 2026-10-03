/**
 * Black-box API harness for the sign-in tests (member-records/auth).
 *
 * Why a real server process instead of `createApp().request(...)`: the login
 * rate limit (10 / min) and `TRUST_PROXY_HOPS` are process-wide (module state
 * and env, shared by every test file in one `bun test` run). A sign-in test
 * needs many E01 calls, so each test sends its own `X-Forwarded-For` address
 * and the server runs with `TRUST_PROXY_HOPS=1` (the D-018 production value):
 * the limiter then keys on that address and the tests never trip it. A real
 * process also lets the lock tests restart the server (BR-REC-28).
 *
 * The child process gets the *_test database URL only (asserted below).
 */

import { expect } from "bun:test";
import { join } from "node:path";

export const BACKEND_DIR = join(import.meta.dir, "../../../..");

export const AUTH_PATHS = {
  login: "/api/auth/login",
  refresh: "/api/auth/refresh",
  logout: "/api/auth/logout",
  logoutAll: "/api/auth/logout-all",
  me: "/api/auth/me",
  password: "/api/auth/password",
} as const;

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export type Envelope = {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
};

export type SetCookie = {
  name: string;
  value: string;
  /** attribute name (lower-case) -> value, `true` for flags like HttpOnly */
  attrs: Map<string, string | true>;
  raw: string;
};

export type ApiResponse = {
  status: number;
  headers: Headers;
  body: Envelope;
  setCookies: SetCookie[];
};

export type CallOptions = {
  json?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  /** Network address (sent as `X-Forwarded-For`). Default: a fresh unique address. */
  ip?: string;
  /** `Origin` header. Default: `APP_ORIGIN`; `null` = send none. */
  origin?: string | null;
};

/** What a browser holds after signing in. */
export type Signed = {
  cookies: Record<string, string>;
  access: string;
  refresh: string;
  /** session id (`sid` claim of the access token) */
  sid: string;
  res: ApiResponse;
};

export type ApiServer = {
  readonly baseUrl: string;
  call(
    method: string,
    path: string,
    options?: CallOptions,
  ): Promise<ApiResponse>;
  /** E01 with `remember: true` unless given. */
  login(
    body: { username: string; password: string; remember?: boolean },
    options?: CallOptions,
  ): Promise<ApiResponse>;
  stop(): Promise<void>;
};

let ipCounter = Math.floor(Math.random() * 0xffffff);

/** A unique, valid IPv4 address per call (private range). */
export function nextIp(): string {
  ipCounter = (ipCounter + 1) % 0x1000000;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export function parseSetCookie(raw: string): SetCookie {
  const [pair = "", ...rest] = raw.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  const attrs = new Map<string, string | true>();
  for (const part of rest) {
    const at = part.indexOf("=");
    if (at === -1) attrs.set(part.toLowerCase(), true);
    else attrs.set(part.slice(0, at).toLowerCase(), part.slice(at + 1));
  }
  return {
    name: eq === -1 ? pair : pair.slice(0, eq),
    value: eq === -1 ? "" : pair.slice(eq + 1),
    attrs,
    raw,
  };
}

export function cookieNamed(
  res: ApiResponse,
  name: string,
): SetCookie | undefined {
  return res.setCookies.find((c) => c.name === name);
}

/** A cookie sent by the server to clear it (`Max-Age=0`). */
export function isCleared(cookie: SetCookie | undefined): boolean {
  return cookie !== undefined && cookie.attrs.get("max-age") === "0";
}

function assertTestDatabase(): string {
  const url = process.env.DATABASE_URL ?? "";
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to start a server against '${name}': tests only use a *_test database.`,
    );
  }
  return url;
}

/** Environment for a child process: the test run's env (already pointed at the *_test DB). */
export function childEnv(
  extra: Record<string, string> = {},
): Record<string, string> {
  assertTestDatabase();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.NODE_ENV = "test";
  return { ...env, ...extra };
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port;
  if (port === undefined) throw new Error("could not pick a free port");
  await probe.stop(true);
  return port;
}

async function toResponse(res: Response): Promise<ApiResponse> {
  const text = await res.text();
  let body: Envelope;
  try {
    body = text === "" ? { success: false } : (JSON.parse(text) as Envelope);
  } catch {
    body = { success: false, message: `non-JSON body: ${text.slice(0, 200)}` };
  }
  return {
    status: res.status,
    headers: res.headers,
    body,
    setCookies: res.headers.getSetCookie().map(parseSetCookie),
  };
}

/**
 * Starts `src/index.ts` on a free port, with `.env` loading switched off so the
 * child sees exactly this process's environment (the *_test database).
 */
export async function startApi(
  options: { trustProxyHops?: number } = {},
): Promise<ApiServer> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = Bun.spawn(["bun", "--no-env-file", "src/index.ts"], {
    cwd: BACKEND_DIR,
    env: childEnv({
      PORT: String(port),
      TRUST_PROXY_HOPS: String(options.trustProxyHops ?? 1),
    }),
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  const stderr = new Response(proc.stderr).text();

  const stop = async () => {
    proc.kill("SIGTERM");
    const exited = await Promise.race([
      proc.exited,
      Bun.sleep(5000).then(() => "timeout" as const),
    ]);
    if (exited === "timeout") {
      proc.kill("SIGKILL");
      await proc.exited;
    }
  };

  const deadline = Date.now() + 20_000;
  for (;;) {
    if (proc.exitCode !== null) {
      throw new Error(
        `API server exited with ${proc.exitCode} before it was ready:\n${await stderr}`,
      );
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`API server did not become ready:\n${await stderr}`);
    }
    await Bun.sleep(50);
  }

  const call: ApiServer["call"] = async (method, path, opts = {}) => {
    const headers: Record<string, string> = {
      "x-forwarded-for": opts.ip ?? nextIp(),
      ...(opts.headers ?? {}),
    };
    const origin =
      opts.origin === undefined ? process.env.APP_ORIGIN : opts.origin;
    if (origin !== null && origin !== undefined) headers.origin = origin;
    if (opts.cookies && Object.keys(opts.cookies).length > 0) {
      headers.cookie = Object.entries(opts.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }
    let body: string | undefined;
    if (opts.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    const init: RequestInit = { method, headers, redirect: "manual" };
    if (body !== undefined) init.body = body;
    return toResponse(await fetch(`${baseUrl}${path}`, init));
  };

  return {
    baseUrl,
    call,
    login: (body, opts) =>
      call("POST", AUTH_PATHS.login, {
        ...opts,
        json: { remember: true, ...body },
      }),
    stop,
  };
}

/** The `sid` claim of an access token (read without verifying; the test only needs the id). */
export function sidOf(accessToken: string): string {
  const payload = accessToken.split(".")[1] ?? "";
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  return String(claims.sid);
}

/** Signs in through E01 and returns what the browser would now hold. Fails the test if it is not a 200. */
export async function signInAs(
  api: ApiServer,
  creds: { username: string; password: string; remember?: boolean },
  options?: CallOptions,
): Promise<Signed> {
  const res = await api.login(creds, options);
  expect(res.status).toBe(200);
  const access = cookieNamed(res, ACCESS_COOKIE)?.value ?? "";
  const refresh = cookieNamed(res, REFRESH_COOKIE)?.value ?? "";
  expect(access).not.toBe("");
  expect(refresh).not.toBe("");
  return {
    cookies: { [ACCESS_COOKIE]: access, [REFRESH_COOKIE]: refresh },
    access,
    refresh,
    sid: sidOf(access),
    res,
  };
}

/** `details.retryAfterSeconds` of a 429 LOGIN_LOCKED answer. */
export function retryAfterSeconds(res: ApiResponse): number {
  const value = res.body.details?.retryAfterSeconds;
  if (typeof value !== "number") {
    throw new Error(
      `details.retryAfterSeconds missing in ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return value;
}

export function expectError(
  res: ApiResponse,
  status: number,
  code: string,
): void {
  expect({ status: res.status, code: res.body.code }).toEqual({
    status,
    code,
  });
  expect(res.body.success).toBe(false);
}

/** The 429 the lock answers with: code, positive whole seconds, `Retry-After` header equal to them. */
export function expectLocked(res: ApiResponse): number {
  expectError(res, 429, "LOGIN_LOCKED");
  const seconds = retryAfterSeconds(res);
  expect(Number.isInteger(seconds)).toBe(true);
  expect(seconds).toBeGreaterThanOrEqual(1);
  expect(res.headers.get("retry-after")).toBe(String(seconds));
  return seconds;
}
