import { clientEnv } from '@/lib/env';
import type { ErrorBody } from '@/types/api';
import { ApiError } from './errors';
import { API_ROUTES } from './routes';

type Primitive = string | number | boolean;
export type QueryParams = Record<string, Primitive | Primitive[] | null | undefined>;

export interface ApiOptions {
  /**
   * Keep the last ETag and data per GET URL, send `If-None-Match`, and treat a 304 as the cached data
   * (api-contract.md BR-REC-160, 161: the API answers `private, no-store`, so the browser never revalidates
   * on its own). Browser client only; the server client is per request and gains nothing.
   */
  etag?: boolean;
}

// Only responses that carry an ETag are kept (settings and the assessment catalog), so the cache is
// small; the cap is a safety net.
const ETAG_CACHE_LIMIT = 50;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: QueryParams;
  timeoutMs?: number;
}

export function toSearchParams(query: QueryParams = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// Only a 401 with code UNAUTHORIZED means "the access cookie is gone, try a refresh" (BR-REC-41).
// E01's 401 INVALID_CREDENTIALS and E06's 400 CURRENT_PASSWORD_WRONG are answers for the screen.
async function isUnauthorized(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as ErrorBody | null;
  return body?.code === 'UNAUTHORIZED';
}

/**
 * Isomorphic fetch wrapper. Throws ApiError on non-2xx, 204 -> undefined, 10 s timeout by default.
 * `refresh` (browser only): called once on a 401 UNAUTHORIZED, then the request is retried once. It never
 * redirects: when the refresh fails the 401 is thrown and the global handler in `queryClient.ts` opens
 * Login with the current page as `next`.
 * `options.etag`: see ApiOptions.
 */
export function createApi(
  baseUrl: string,
  getHeaders?: () => Promise<HeadersInit> | HeadersInit,
  refresh?: () => Promise<boolean>,
  options: ApiOptions = {},
) {
  const etags = new Map<string, { etag: string; data: unknown }>();

  async function send(path: string, opts: RequestOptions, useEtag: boolean): Promise<Response> {
    const { body, query, timeoutMs = 10_000, headers, signal, ...init } = opts;
    const isForm = body instanceof FormData;
    const timeout = AbortSignal.timeout(timeoutMs);
    const url = `${baseUrl}${path}${toSearchParams(query)}`;
    const cached = useEtag ? etags.get(url) : undefined;

    return fetch(url, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        ...(cached && { 'If-None-Match': cached.etag }),
        ...(await getHeaders?.()),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const useEtag = options.etag === true && opts.method === 'GET';
    const url = `${baseUrl}${path}${toSearchParams(opts.query)}`;

    let res = await send(path, opts, useEtag);

    if (
      refresh &&
      path !== API_ROUTES.AUTH.REFRESH &&
      (await isUnauthorized(res)) &&
      (await refresh())
    ) {
      res = await send(path, opts, useEtag);
    }

    if (res.status === 304) {
      const hit = etags.get(url);
      if (hit) return hit.data as T;
      // A 304 we cannot answer (our copy is gone): ask again without a condition.
      res = await send(path, opts, false);
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ErrorBody | null;
      throw new ApiError(res.status, err?.message ?? res.statusText, err?.code, err);
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json()) as T;

    const etag = useEtag ? res.headers.get('ETag') : null;
    if (etag) {
      etags.delete(url); // re-insert so the oldest entry is the first one to go
      etags.set(url, { etag, data });
      if (etags.size > ETAG_CACHE_LIMIT) etags.delete(etags.keys().next().value as string);
    }
    return data;
  }

  return {
    get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
    post: <T, B = unknown>(path: string, body?: B, opts?: RequestOptions) =>
      request<T>(path, { ...opts, method: 'POST', body }),
    patch: <T, B = unknown>(path: string, body?: B, opts?: RequestOptions) =>
      request<T>(path, { ...opts, method: 'PATCH', body }),
    put: <T, B = unknown>(path: string, body?: B, opts?: RequestOptions) =>
      request<T>(path, { ...opts, method: 'PUT', body }),
    delete: <T = void>(path: string, opts?: RequestOptions) =>
      request<T>(path, { ...opts, method: 'DELETE' }),
  };
}

// Exactly one refresh in flight; concurrent 401s wait on the same promise.
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${API_ROUTES.AUTH.REFRESH}`, {
    method: 'POST',
    credentials: 'include',
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export const api = createApi(clientEnv.NEXT_PUBLIC_API_URL, undefined, refreshSession, {
  etag: true,
});
