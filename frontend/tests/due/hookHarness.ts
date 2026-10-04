// Harness for the due-list tests that need a React hook or a request body (docs/specs/member-records/due-list.md v2).
// There is no DOM in `bun test`, so a hook is called while rendering to a string (react-dom/server) inside the app's
// query provider; the value it returns (`mutate`, `refetch`, `fetchNextPage`, data) is then used after the render.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

/** Runs `useIt` once inside the query provider and returns what it returned. */
export function callHook<T>(client: QueryClient, useIt: () => T): T {
  let captured: T | undefined;
  function Probe() {
    captured = useIt();
    return null;
  }
  renderToString(createElement(QueryClientProvider, { client }, createElement(Probe)));
  return captured as T;
}

/** The app's client defaults (30 s stale time, no retry in tests). */
export const appLikeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: false },
      mutations: { retry: false },
    },
  });

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Polls until `condition` is true; throws after `timeoutMs` so a missing call fails the test instead of hanging. */
export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor: condition not met in time');
    await new Promise((done) => setTimeout(done, 5));
  }
}

/** Lets callbacks that run after a request settles (toasts, cache writes) finish. */
export const flush = (ms = 40) => new Promise((done) => setTimeout(done, ms));

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  /** The request body as text; `undefined` when the request had none. */
  body: string | undefined;
}

/** Replaces `globalThis.fetch`; every call is recorded (with its body) and answered by `handler`. */
export function recordingFetch(handler: (call: RecordedRequest) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: RecordedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => {
      headers.set(name, value);
    });
    let body: string | undefined;
    if (typeof init?.body === 'string') body = init.body;
    else if (input instanceof Request) body = (await input.clone().text()) || undefined;
    const call: RecordedRequest = {
      url,
      method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
      headers,
      body,
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

export const pathOf = (url: string) => new URL(url, 'http://gym.test').pathname;
export const paramsOf = (url: string) => new URL(url, 'http://gym.test').searchParams;
