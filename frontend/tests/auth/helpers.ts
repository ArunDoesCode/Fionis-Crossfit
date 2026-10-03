// Shared helpers for the auth tests (admin-app side of docs/specs/member-records/auth.md).
// Interface sources: .pipeline/member-records-auth/contract.md "Admin app (frontend)" and the
// framework contract of Next.js (`proxy` / `config.matcher`), never the implementation.
import { mock } from 'bun:test';
import { AsyncLocalStorage } from 'node:async_hooks';

/** The one public address of the app (D-018); the page guard sends it as `Origin` (BR-REC-37). */
export const APP_ORIGIN = 'https://gym.example.test';
/** The API's internal address on the same server; ends in `/api` like the backend routes. */
export const API_INTERNAL_URL = 'http://api.internal:4000/api';

type EnvKey = 'NEXT_PUBLIC_API_URL' | 'API_URL' | 'APP_ORIGIN';

/**
 * Sets the env the admin app reads and returns a function that puts the old values back.
 * `.env.local` is not loaded by `bun test`, so the tests set what they need themselves.
 */
export function setAuthEnv(): () => void {
  const values: Record<EnvKey, string> = {
    NEXT_PUBLIC_API_URL: '/api',
    API_URL: API_INTERNAL_URL,
    APP_ORIGIN,
  };
  const before: Partial<Record<EnvKey, string | undefined>> = {};
  for (const key of Object.keys(values) as EnvKey[]) {
    before[key] = process.env[key];
    process.env[key] = values[key];
  }
  return () => {
    for (const key of Object.keys(values) as EnvKey[]) {
      const old = before[key];
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    }
  };
}

/**
 * Next reads `globalThis.AsyncLocalStorage` when its modules load; its own Node runtime sets it,
 * `bun test` does not. Everything from `next/*` must therefore be imported after this runs.
 */
export function prepareNextRuntime(): void {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
  // `server-only` throws outside the React server build; the page guard runs there in production.
  mock.module('server-only', () => ({}));
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
}

/** Headers given on a `Request` object plus those in `init` (a caller may use either form). */
function mergedHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, name) => {
    headers.set(name, value);
  });
  return headers;
}

/** Replaces `globalThis.fetch`; every call is recorded and answered by `handler`. */
export function installFetch(handler: (call: RecordedCall) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const call: RecordedCall = {
      url,
      method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
      headers: mergedHeaders(input, init),
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function jsonResponse(status: number, body: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

/** The error envelope every API error uses: `{ success: false, message, code, details? }`. */
export function errorResponse(
  status: number,
  code: string,
  message = code,
  details?: unknown,
): Response {
  return jsonResponse(status, { success: false, message, code, ...(details ? { details } : {}) });
}
