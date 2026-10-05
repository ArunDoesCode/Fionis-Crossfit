// Spec: docs/specs/member-records/auth.md BR-REC-41 — when an API call gets 401 the app refreshes once and
// retries; one refresh in flight for parallel 401s; if the refresh fails the 401 reaches the app so it can
// open Login. Also BR-REC-29 / BR-REC-01: the wrapper keeps the server's error code and details so the
// Login page can build its own error line (E01's 401 INVALID_CREDENTIALS and E06's 400 never refresh).
// Interface: docs/specs/member-records/auth.md — the fetch wrapper (browser):
// only a 401 with code UNAUTHORIZED triggers a refresh; one `POST /api/auth/refresh` in flight (same
// origin); retry the call once. Existing exports used: `api` (`@/lib/api/client`), `ApiError` / `isApiError`
// (`@/lib/api/errors`), `API_ROUTES` (`@/lib/api/routes`). The wrapper is driven only through `fetch`.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ApiError, isApiError } from '@/lib/api/errors';
import { API_ROUTES } from '@/lib/api/routes';
import { errorResponse, installFetch, jsonResponse, setAuthEnv } from './helpers';

type Api = typeof import('@/lib/api/client').api;

let api: Api;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  api = (await import('@/lib/api/client')).api;
});

afterEach(() => {
  fetchSpy?.restore();
  fetchSpy = undefined;
});

afterAll(() => {
  restoreEnv();
});

const REFRESH_URL = `/api${API_ROUTES.AUTH.REFRESH}`; // same address as the app, no other host
const MEMBERS_URL = '/api/members';

const refreshCalls = () => fetchSpy?.calls.filter((call) => call.url === REFRESH_URL) ?? [];
const callsTo = (path: string) =>
  fetchSpy?.calls.filter((call) => call.url.split('?')[0] === path) ?? [];

const unauthorized = () => errorResponse(401, 'UNAUTHORIZED', 'Sign in required');
const refreshOk = () =>
  jsonResponse(200, { success: true, data: { expiresAt: '2026-10-10T10:00:00Z' } });
const refreshRejected = () => errorResponse(401, 'SESSION_EXPIRED', 'Sign in again');
const membersOk = () =>
  jsonResponse(200, { success: true, data: [{ marker: 'members-after-refresh' }] });

/** A server where the access cookie has expired until the refresh answered 200. */
function expiredUntilRefreshed(refresh: () => Response | Promise<Response> = refreshOk) {
  let refreshed = false;
  return installFetch(async (call) => {
    if (call.url === REFRESH_URL) {
      await Bun.sleep(15); // long enough for parallel calls to overlap
      const answer = await refresh();
      refreshed = answer.ok;
      return answer;
    }
    return refreshed ? membersOk() : unauthorized();
  });
}

describe('BR-REC-41 a 401 refreshes once and retries the call once', () => {
  test('BR-REC-41 401 UNAUTHORIZED, refresh works: the call is retried and succeeds', async () => {
    fetchSpy = expiredUntilRefreshed();
    const result = await api.get('/members');
    expect(JSON.stringify(result)).toContain('members-after-refresh');
  });

  test('BR-REC-41 the order is: first try, one POST to /api/auth/refresh, second try', async () => {
    fetchSpy = expiredUntilRefreshed();
    await api.get('/members');
    expect(fetchSpy.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${MEMBERS_URL}`,
      `POST ${REFRESH_URL}`,
      `GET ${MEMBERS_URL}`,
    ]);
  });

  test('BR-REC-41 a retry that is refused again is not refreshed again (once, no loop)', async () => {
    fetchSpy = installFetch((call) => (call.url === REFRESH_URL ? refreshOk() : unauthorized()));
    const error = await api.get('/members').catch((err: unknown) => err);
    expect(isApiError(error) && error.status === 401).toBe(true);
    expect(refreshCalls()).toHaveLength(1);
    expect(callsTo(MEMBERS_URL)).toHaveLength(2);
  });

  test('BR-REC-41 a call that never gets a 401 never refreshes', async () => {
    fetchSpy = installFetch(() => membersOk());
    await api.get('/members');
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe('BR-REC-41 one refresh in flight for parallel 401s', () => {
  test('BR-REC-41 five parallel 401s cause exactly one POST /api/auth/refresh', async () => {
    fetchSpy = expiredUntilRefreshed();
    await Promise.all([1, 2, 3, 4, 5].map((n) => api.get('/members', { query: { page: n } })));
    expect(refreshCalls()).toHaveLength(1);
  });

  test('BR-REC-41 every one of the parallel calls is retried once and succeeds', async () => {
    fetchSpy = expiredUntilRefreshed();
    const results = await Promise.all(
      [1, 2, 3].map((n) => api.get('/members', { query: { page: n } })),
    );
    for (const result of results) expect(JSON.stringify(result)).toContain('members-after-refresh');
    expect(callsTo(MEMBERS_URL)).toHaveLength(6); // 3 first tries + 3 retries
  });

  test('BR-REC-41 parallel calls all fail with 401 when the refresh is refused, after one refresh', async () => {
    fetchSpy = expiredUntilRefreshed(refreshRejected);
    const outcomes = await Promise.allSettled(
      [1, 2, 3].map((n) => api.get('/members', { query: { page: n } })),
    );
    expect(refreshCalls()).toHaveLength(1);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('rejected');
      const reason = (outcome as PromiseRejectedResult).reason;
      expect(isApiError(reason) && reason.status === 401).toBe(true);
    }
  });

  test('BR-REC-41 "in flight" ends: a later 401 starts a new refresh', async () => {
    fetchSpy = expiredUntilRefreshed(refreshRejected);
    await api.get('/members').catch(() => undefined);
    await api.get('/members').catch(() => undefined);
    expect(refreshCalls()).toHaveLength(2);
  });
});

describe('BR-REC-41 when the refresh fails the 401 reaches the app (it opens Login)', () => {
  test('BR-REC-41 refresh answers 401: the call fails with an ApiError of status 401', async () => {
    fetchSpy = expiredUntilRefreshed(refreshRejected);
    const error = await api.get('/members').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  test('BR-REC-41 the original call is not retried after a failed refresh', async () => {
    fetchSpy = expiredUntilRefreshed(refreshRejected);
    await api.get('/members').catch(() => undefined);
    expect(callsTo(MEMBERS_URL)).toHaveLength(1);
    expect(refreshCalls()).toHaveLength(1);
  });

  test('BR-REC-41 the refresh is a same-address POST (the browser adds cookies and Origin)', async () => {
    fetchSpy = expiredUntilRefreshed();
    await api.get('/members');
    const [call] = refreshCalls();
    expect(call?.method).toBe('POST');
    expect(call?.url.startsWith('/')).toBe(true);
  });
});

describe('BR-REC-41 only a 401 UNAUTHORIZED refreshes (E01 and E06 errors never do)', () => {
  test('BR-REC-41 E01 401 INVALID_CREDENTIALS does not trigger a refresh', async () => {
    fetchSpy = installFetch(() => errorResponse(401, 'INVALID_CREDENTIALS', 'Wrong'));
    await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'wrong-pass', remember: true })
      .catch(() => undefined);
    expect(refreshCalls()).toHaveLength(0);
  });

  test('BR-REC-01 E01 401 INVALID_CREDENTIALS reaches the Login page as an ApiError with its code', async () => {
    fetchSpy = installFetch(() => errorResponse(401, 'INVALID_CREDENTIALS', 'Wrong'));
    const error = await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'wrong-pass', remember: true })
      .catch((err: unknown) => err);
    expect(isApiError(error)).toBe(true);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).code).toBe('INVALID_CREDENTIALS');
  });

  test('BR-REC-41 E01 is not sent twice after INVALID_CREDENTIALS', async () => {
    fetchSpy = installFetch(() => errorResponse(401, 'INVALID_CREDENTIALS', 'Wrong'));
    await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'wrong-pass', remember: true })
      .catch(() => undefined);
    expect(callsTo(`/api${API_ROUTES.AUTH.LOGIN}`)).toHaveLength(1);
  });

  test('BR-REC-34 E06 400 CURRENT_PASSWORD_WRONG does not trigger a refresh', async () => {
    fetchSpy = installFetch(() => errorResponse(400, 'CURRENT_PASSWORD_WRONG', 'Wrong'));
    const error = await api
      .post(API_ROUTES.AUTH.CHANGE_PASSWORD, { currentPassword: 'x', newPassword: 'long-enough-1' })
      .catch((err: unknown) => err);
    expect(refreshCalls()).toHaveLength(0);
    expect((error as ApiError).code).toBe('CURRENT_PASSWORD_WRONG');
  });

  test('BR-REC-41 a 403 CSRF_ORIGIN does not trigger a refresh', async () => {
    fetchSpy = installFetch(() => errorResponse(403, 'CSRF_ORIGIN', 'No'));
    await api.post('/members', { name: 'x' }).catch(() => undefined);
    expect(refreshCalls()).toHaveLength(0);
  });

  test('BR-REC-41 a 500 does not trigger a refresh', async () => {
    fetchSpy = installFetch(() => errorResponse(500, 'INTERNAL_ERROR', 'Boom'));
    await api.get('/members').catch(() => undefined);
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe('BR-REC-29 the Login page can read the minutes left from the error', () => {
  test('BR-REC-29 a 429 LOGIN_LOCKED keeps its code and details.retryAfterSeconds', async () => {
    fetchSpy = installFetch(() =>
      errorResponse(429, 'LOGIN_LOCKED', 'Locked', { retryAfterSeconds: 540 }),
    );
    const error = await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'right-pass-1', remember: true })
      .catch((err: unknown) => err);
    expect(isApiError(error)).toBe(true);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(429);
    expect(apiError.code).toBe('LOGIN_LOCKED');
    const body = apiError.body as { details?: { retryAfterSeconds?: number } };
    expect(body.details?.retryAfterSeconds).toBe(540);
  });

  test('BR-REC-29 a locked login is not refreshed or retried', async () => {
    fetchSpy = installFetch(() =>
      errorResponse(429, 'LOGIN_LOCKED', 'Locked', { retryAfterSeconds: 540 }),
    );
    await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'right-pass-1', remember: true })
      .catch(() => undefined);
    expect(refreshCalls()).toHaveLength(0);
    expect(fetchSpy.calls).toHaveLength(1);
  });
});
