import { clientEnv } from '@/lib/env';
import type { ErrorBody } from '@/types/api';
import { ApiError } from './errors';
import { API_ROUTES } from './routes';

type Primitive = string | number | boolean;
export type QueryParams = Record<string, Primitive | Primitive[] | null | undefined>;

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

/**
 * Isomorphic fetch wrapper. Throws ApiError on non-2xx, 204 -> undefined, 10 s timeout by default.
 * `refresh` (browser only): called once on a 401, then the request is retried once. It never redirects.
 */
export function createApi(
  baseUrl: string,
  getHeaders?: () => Promise<HeadersInit> | HeadersInit,
  refresh?: () => Promise<boolean>,
) {
  async function send(path: string, opts: RequestOptions): Promise<Response> {
    const { body, query, timeoutMs = 10_000, headers, signal, ...init } = opts;
    const isForm = body instanceof FormData;
    const timeout = AbortSignal.timeout(timeoutMs);

    return fetch(`${baseUrl}${path}${toSearchParams(query)}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        ...(await getHeaders?.()),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let res = await send(path, opts);

    if (res.status === 401 && refresh && path !== API_ROUTES.AUTH.REFRESH && (await refresh())) {
      res = await send(path, opts);
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ErrorBody | null;
      throw new ApiError(res.status, err?.message ?? res.statusText, err?.code, err);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
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

export const api = createApi(clientEnv.NEXT_PUBLIC_API_URL, undefined, refreshSession);
