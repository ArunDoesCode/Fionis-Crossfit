// Spec: docs/specs/member-records/auth.md — BR-REC-01 (every page except Login needs the shared login),
// BR-REC-39 (Login, then back to the page asked for; `next` stays inside the app; the guard never runs
// on /api), BR-REC-40 (expired access cookie + valid refresh cookie: refresh on the server before the
// page renders), BR-REC-42 (Login while signed in goes to Home).
// Interface: .pipeline/member-records-auth/contract.md "Admin app (frontend)" — the page guard is
// `src/proxy.ts` (`proxy`, `config.matcher`, the Next.js proxy contract). The forwarded request's
// cookies are read from Next's own `x-middleware-request-*` / `x-middleware-override-headers`
// response headers, which is how a proxy hands changed request headers to the page.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import {
  API_INTERNAL_URL,
  APP_ORIGIN,
  installFetch,
  jsonResponse,
  prepareNextRuntime,
  setAuthEnv,
} from './helpers';

type NextModules = {
  NextRequest: typeof import('next/server').NextRequest;
  proxy: (request: import('next/server').NextRequest) => Response | Promise<Response>;
  config: { matcher: string | string[] };
  doesMatch: typeof import('next/experimental/testing/server').unstable_doesMiddlewareMatch;
};

let next: NextModules;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  prepareNextRuntime();
  const server = await import('next/server');
  const testing = await import('next/experimental/testing/server');
  const guard = await import('@/proxy');
  next = {
    NextRequest: server.NextRequest,
    proxy: guard.proxy as NextModules['proxy'],
    config: guard.config as NextModules['config'],
    doesMatch: testing.unstable_doesMiddlewareMatch,
  };
});

afterEach(() => {
  fetchSpy?.restore();
  fetchSpy = undefined;
});

afterAll(() => {
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------
// helpers

const OLD_ACCESS = 'old.access.jwt';
const OLD_REFRESH = 'OLDrefreshTOKENvalue_-123';
const NEW_ACCESS = 'new.access.jwt';
const NEW_REFRESH = 'NEWrefreshTOKENvalue_-456';

const ACCESS_SET_COOKIE = `access_token=${NEW_ACCESS}; Max-Age=900; Path=/; HttpOnly; SameSite=Lax`;
const REFRESH_SET_COOKIE = `refresh_token=${NEW_REFRESH}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`;
const REFRESH_SESSION_ONLY_SET_COOKIE = `refresh_token=${NEW_REFRESH}; Path=/; HttpOnly; SameSite=Lax`;

const refreshSucceeds = (setCookies = [ACCESS_SET_COOKIE, REFRESH_SET_COOKIE]) =>
  jsonResponse(200, { success: true, data: { expiresAt: '2026-10-10T10:00:00.000Z' } }, setCookies);

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return new next.NextRequest(`${APP_ORIGIN}${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

/** Like `request`, with extra incoming headers (what the HTTPS front puts on the visitor's request). */
function requestWithHeaders(
  path: string,
  cookies: Record<string, string>,
  headers: Record<string, string>,
) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return new next.NextRequest(`${APP_ORIGIN}${path}`, {
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}

const isRedirect = (res: Response) =>
  res.status >= 300 && res.status < 400 && res.headers.has('location');

const locationOf = (res: Response) => new URL(res.headers.get('location') ?? '', APP_ORIGIN);

/** The cookies the page will see, from the headers Next uses to forward changed request headers. */
function forwardedCookies(res: Response): Record<string, string> {
  const overridden = (res.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase());
  if (!overridden.includes('cookie')) return {};
  const raw = res.headers.get('x-middleware-request-cookie') ?? '';
  return Object.fromEntries(
    raw
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf('=');
        return [pair.slice(0, at), pair.slice(at + 1)];
      }),
  );
}

const setCookieOf = (res: Response, name: string) =>
  res.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`));

const PAGES = [
  '/admin',
  '/admin/members',
  '/admin/members/42',
  '/admin/members/42/assess',
  '/admin/due',
  '/admin/memberships',
  '/admin/reports',
  '/admin/settings',
  '/admin/settings/account',
];

// ---------------------------------------------------------------------------------------------

describe('BR-REC-01 every page except Login needs the shared login', () => {
  for (const path of PAGES) {
    test(`BR-REC-01 ${path} without a sign-in goes to Login`, async () => {
      fetchSpy = installFetch(() => {
        throw new Error('the page guard must not call the API when there are no cookies');
      });
      const res = await next.proxy(request(path));
      expect(isRedirect(res)).toBe(true);
      expect(locationOf(res).pathname).toBe('/login');
    });
  }

  test('BR-REC-01 the home alias "/" without a sign-in goes to Login', async () => {
    fetchSpy = installFetch(() => {
      throw new Error('no API call expected');
    });
    const res = await next.proxy(request('/'));
    expect(isRedirect(res)).toBe(true);
    expect(locationOf(res).pathname).toBe('/login');
  });

  test('BR-REC-01 Login itself stays open without a sign-in (no redirect loop)', async () => {
    const res = await next.proxy(request('/login'));
    expect(isRedirect(res)).toBe(false);
  });
});

describe('BR-REC-39 Login, then back to the page asked for', () => {
  test('BR-REC-39 /admin/members/42 without a sign-in goes to /login with next=/admin/members/42', async () => {
    const res = await next.proxy(request('/admin/members/42'));
    expect(isRedirect(res)).toBe(true);
    const target = locationOf(res);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('next')).toBe('/admin/members/42');
  });

  test('BR-REC-39 the settings page is remembered the same way', async () => {
    const res = await next.proxy(request('/admin/settings/account'));
    const target = locationOf(res);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('next')).toBe('/admin/settings/account');
  });

  test('BR-REC-39 the redirect to Login stays on the app address', async () => {
    const res = await next.proxy(request('/admin/members/42'));
    expect(locationOf(res).origin).toBe(APP_ORIGIN);
  });

  test('BR-REC-39 the home alias "/" is never remembered as an outside address', async () => {
    const res = await next.proxy(request('/'));
    const nextParam = locationOf(res).searchParams.get('next');
    // "/" is Home; either no `next` or a path inside the app.
    if (nextParam !== null) {
      expect(nextParam.startsWith('/')).toBe(true);
      expect(nextParam.startsWith('//')).toBe(false);
    }
  });

  test('BR-REC-39 a path that is not inside the app is never written as `next`', async () => {
    // "//evil.com/x" is an address on another site when a browser follows it.
    const res = await next.proxy(request('//evil.com/x'));
    const target = locationOf(res);
    expect(target.origin).toBe(APP_ORIGIN);
    const nextParam = target.searchParams.get('next');
    if (nextParam !== null) {
      expect(nextParam.startsWith('/')).toBe(true);
      expect(nextParam.startsWith('//')).toBe(false);
    }
  });

  test('BR-REC-39 Login with a next value is shown to a signed-out visitor, not redirected again', async () => {
    const res = await next.proxy(request('/login?next=%2Fadmin%2Fmembers%2F42'));
    expect(isRedirect(res)).toBe(false);
  });
});

describe('BR-REC-39 the page guard never runs on /api/*, static files or the manifest', () => {
  const matches = (url: string) => next.doesMatch({ config: next.config, url });

  for (const url of [
    '/api/members',
    '/api/members/42',
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/auth/me',
    '/api',
  ]) {
    test(`BR-REC-39 matcher excludes ${url}`, () => {
      expect(matches(url)).toBe(false);
    });
  }

  for (const url of [
    '/_next/static/chunks/main.js',
    '/_next/image?url=%2Flogo.png&w=64&q=75',
    '/favicon.ico',
    '/manifest.webmanifest',
  ]) {
    test(`BR-REC-39 matcher excludes ${url}`, () => {
      expect(matches(url)).toBe(false);
    });
  }

  for (const url of ['/', '/login', '/admin', '/admin/members/42', '/admin/settings/account']) {
    test(`BR-REC-39 matcher still guards the page ${url}`, () => {
      expect(matches(url)).toBe(true);
    });
  }
});

describe('BR-REC-42 Login while signed in goes straight to Home', () => {
  test('BR-REC-42 a signed-in tablet opening /login goes to /admin', async () => {
    const res = await next.proxy(request('/login', { access_token: OLD_ACCESS }));
    expect(isRedirect(res)).toBe(true);
    const target = locationOf(res);
    expect(target.origin).toBe(APP_ORIGIN);
    expect(target.pathname).toBe('/admin');
  });

  test('BR-REC-42 with both cookies the answer is the same, with no API call', async () => {
    fetchSpy = installFetch(() => {
      throw new Error('no API call expected when the access cookie is present');
    });
    const res = await next.proxy(
      request('/login', { access_token: OLD_ACCESS, refresh_token: OLD_REFRESH }),
    );
    expect(locationOf(res).pathname).toBe('/admin');
  });

  test('BR-REC-39 a signed-in visitor with an outside next value is never sent outside the app', async () => {
    const res = await next.proxy(
      request('/login?next=https%3A%2F%2Fevil.com', { access_token: OLD_ACCESS }),
    );
    expect(isRedirect(res)).toBe(true);
    const target = locationOf(res);
    expect(target.origin).toBe(APP_ORIGIN);
    expect(target.hostname).not.toBe('evil.com');
    expect(target.pathname).toBe('/admin');
  });
});

describe('BR-REC-40 an expired access cookie is refreshed on the server before the page renders', () => {
  test('BR-REC-40 a signed-in page with the access cookie needs no API call and is not redirected', async () => {
    fetchSpy = installFetch(() => {
      throw new Error('no API call expected when the access cookie is present');
    });
    const res = await next.proxy(
      request('/admin/members', { access_token: OLD_ACCESS, refresh_token: OLD_REFRESH }),
    );
    expect(isRedirect(res)).toBe(false);
    expect(fetchSpy.calls).toHaveLength(0);
  });

  test('BR-REC-40 access cookie alone passes the guard', async () => {
    fetchSpy = installFetch(() => {
      throw new Error('no API call expected');
    });
    const res = await next.proxy(request('/admin', { access_token: OLD_ACCESS }));
    expect(isRedirect(res)).toBe(false);
  });

  test('BR-REC-40 refresh cookie only: exactly one POST to the API refresh endpoint', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    expect(fetchSpy.calls).toHaveLength(1);
    const [call] = fetchSpy.calls;
    expect(call?.method).toBe('POST');
    const url = new URL(call?.url ?? '');
    expect(url.origin).toBe(new URL(API_INTERNAL_URL).origin);
    expect(url.pathname).toBe('/api/auth/refresh');
  });

  test('BR-REC-40 the server call carries the refresh cookie', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    const cookie = fetchSpy.calls[0]?.headers.get('cookie') ?? '';
    expect(cookie.split(';').map((pair) => pair.trim())).toContain(`refresh_token=${OLD_REFRESH}`);
  });

  test('BR-REC-40 the server call sets Origin to the app address (a server fetch sends none, BR-REC-37)', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    expect(fetchSpy.calls[0]?.headers.get('origin')).toBe(APP_ORIGIN);
  });

  test('BR-REC-40 after a good refresh the page renders: no redirect to Login', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    expect(isRedirect(res)).toBe(false);
  });

  test('BR-REC-40 every Set-Cookie of the refresh answer is copied to the response', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    expect(setCookieOf(res, 'access_token')).toContain(`access_token=${NEW_ACCESS}`);
    expect(setCookieOf(res, 'refresh_token')).toContain(`refresh_token=${NEW_REFRESH}`);
  });

  test('BR-REC-30 the copied access cookie keeps HttpOnly, SameSite=Lax, Path=/ and its 15 minutes', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    const cookie = setCookieOf(res, 'access_token') ?? '';
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
    expect(cookie).toMatch(/;\s*Max-Age=900(;|$)/i);
  });

  test('BR-REC-30 the copied refresh cookie keeps HttpOnly, SameSite=Lax, Path=/ and its 7 days', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    const cookie = setCookieOf(res, 'refresh_token') ?? '';
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
    expect(cookie).toMatch(/;\s*Max-Age=604800(;|$)/i);
  });

  test('BR-REC-31 a refresh cookie that ends with the browser is not given a lifetime on the copy', async () => {
    fetchSpy = installFetch(() =>
      refreshSucceeds([ACCESS_SET_COOKIE, REFRESH_SESSION_ONLY_SET_COOKIE]),
    );
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    const cookie = setCookieOf(res, 'refresh_token') ?? '';
    expect(cookie).toContain(`refresh_token=${NEW_REFRESH}`);
    expect(cookie).not.toMatch(/max-age/i);
    expect(cookie).not.toMatch(/expires/i);
  });

  test('BR-REC-40 the page is rendered with the new cookies in the forwarded request', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    const cookies = forwardedCookies(res);
    expect(cookies.access_token).toBe(NEW_ACCESS);
    expect(cookies.refresh_token).toBe(NEW_REFRESH);
  });

  test('BR-REC-40 the replaced refresh value is not forwarded to the page', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    expect(res.headers.get('x-middleware-request-cookie') ?? '').not.toContain(OLD_REFRESH);
  });

  for (const [label, makeAnswer] of [
    [
      '401 SESSION_EXPIRED',
      () => jsonResponse(401, { success: false, message: 'x', code: 'SESSION_EXPIRED' }),
    ],
    [
      '429 RATE_LIMITED',
      () => jsonResponse(429, { success: false, message: 'x', code: 'RATE_LIMITED' }),
    ],
    ['500', () => jsonResponse(500, { success: false, message: 'x', code: 'INTERNAL_ERROR' })],
  ] as const) {
    test(`BR-REC-40 a refresh answer of ${label} goes to /login?next= the page asked for`, async () => {
      fetchSpy = installFetch(() => makeAnswer());
      const res = await next.proxy(request('/admin/members/42', { refresh_token: OLD_REFRESH }));
      expect(isRedirect(res)).toBe(true);
      const target = locationOf(res);
      expect(target.pathname).toBe('/login');
      expect(target.searchParams.get('next')).toBe('/admin/members/42');
    });
  }

  test('BR-REC-40 a failed refresh does not hand out new cookies', async () => {
    fetchSpy = installFetch(() =>
      jsonResponse(401, { success: false, message: 'x', code: 'SESSION_EXPIRED' }),
    );
    const res = await next.proxy(request('/admin/members', { refresh_token: OLD_REFRESH }));
    expect(setCookieOf(res, 'access_token')).toBeUndefined();
  });

  test('BR-REC-39 a stale refresh cookie on /login shows Login instead of redirecting to itself', async () => {
    fetchSpy = installFetch(() =>
      jsonResponse(401, { success: false, message: 'x', code: 'SESSION_EXPIRED' }),
    );
    const res = await next.proxy(request('/login', { refresh_token: OLD_REFRESH }));
    if (isRedirect(res)) expect(locationOf(res).pathname).not.toBe('/login');
    else expect(res.status).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------------------------
// Review R-2: the server-side refresh is made on behalf of the visitor. BR-REC-38 rate-limits refresh
// "per network address ... from our own proxy's header", and BR-REC-43 logs the network address and the
// device type of sign-in events. If the guard's call to the API carried neither, every visitor's guard
// refresh would share one address (and one rate-limit bucket) and rows would show the Next.js server.

const CHROME_ON_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

describe('BR-REC-38 the page guard refresh carries the visitor’s network address', () => {
  test('BR-REC-38 the incoming X-Forwarded-For is sent on the server refresh unchanged', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(
      requestWithHeaders(
        '/admin/members',
        { refresh_token: OLD_REFRESH },
        { 'x-forwarded-for': '198.51.100.7' },
      ),
    );
    expect(fetchSpy.calls).toHaveLength(1);
    expect(fetchSpy.calls[0]?.headers.get('x-forwarded-for')).toBe('198.51.100.7');
  });

  test('BR-REC-38 a longer X-Forwarded-For chain is passed on exactly as received (no hop added, none dropped)', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(
      requestWithHeaders(
        '/admin/members',
        { refresh_token: OLD_REFRESH },
        { 'x-forwarded-for': '203.0.113.9, 198.51.100.7' },
      ),
    );
    expect(fetchSpy.calls[0]?.headers.get('x-forwarded-for')).toBe('203.0.113.9, 198.51.100.7');
  });

  test('BR-REC-38 the address of one visitor does not leak into the refresh of another', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(
      requestWithHeaders(
        '/admin/members',
        { refresh_token: OLD_REFRESH },
        { 'x-forwarded-for': '198.51.100.7' },
      ),
    );
    await next.proxy(
      requestWithHeaders(
        '/admin/members',
        { refresh_token: OLD_REFRESH },
        { 'x-forwarded-for': '198.51.100.8' },
      ),
    );
    expect(fetchSpy.calls.map((call) => call.headers.get('x-forwarded-for'))).toEqual([
      '198.51.100.7',
      '198.51.100.8',
    ]);
  });
});

describe('BR-REC-43 the page guard refresh carries the visitor’s device type', () => {
  test('BR-REC-43 the incoming User-Agent is sent on the server refresh unchanged', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(
      requestWithHeaders(
        '/admin/members',
        { refresh_token: OLD_REFRESH },
        { 'user-agent': CHROME_ON_ANDROID },
      ),
    );
    expect(fetchSpy.calls).toHaveLength(1);
    expect(fetchSpy.calls[0]?.headers.get('user-agent')).toBe(CHROME_ON_ANDROID);
  });

  test('BR-REC-43 address and device go together, next to the refresh cookie and the app Origin', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    await next.proxy(
      requestWithHeaders(
        '/admin/members',
        { refresh_token: OLD_REFRESH },
        { 'x-forwarded-for': '198.51.100.7', 'user-agent': CHROME_ON_ANDROID },
      ),
    );
    const headers = fetchSpy.calls[0]?.headers;
    expect(headers?.get('x-forwarded-for')).toBe('198.51.100.7');
    expect(headers?.get('user-agent')).toBe(CHROME_ON_ANDROID);
    expect(headers?.get('origin')).toBe(APP_ORIGIN);
    expect((headers?.get('cookie') ?? '').split(';').map((pair) => pair.trim())).toContain(
      `refresh_token=${OLD_REFRESH}`,
    );
  });

  test('BR-REC-43 forwarding the headers does not change what the visitor gets back (new cookies, no redirect)', async () => {
    fetchSpy = installFetch(() => refreshSucceeds());
    const res = await next.proxy(
      requestWithHeaders(
        '/admin/members',
        { refresh_token: OLD_REFRESH },
        { 'x-forwarded-for': '198.51.100.7', 'user-agent': CHROME_ON_ANDROID },
      ),
    );
    expect(isRedirect(res)).toBe(false);
    expect(setCookieOf(res, 'access_token')).toContain(`access_token=${NEW_ACCESS}`);
    expect(forwardedCookies(res).access_token).toBe(NEW_ACCESS);
  });
});

// ---------------------------------------------------------------------------------------------
// Spec v2 (review R-4), BR-REC-42: "Opening Login while signed in goes straight to Home, except when the
// app just sent the device there because its sign-in ended (BR-REC-41)." The app marks that hand-over with
// `reason=expired` on the Login address (contract: "Signed in on /login -> /admin, except
// /login?reason=expired, which renders Login"). Without the exception an access cookie that the API keeps
// refusing bounces Login <-> /admin forever.

describe('BR-REC-42 v2 Login right after the app ended the sign-in is shown, not bounced to Home', () => {
  const EXPIRED_LOGIN = '/login?reason=expired&next=%2Fadmin%2Fmembers%2F42';

  test('BR-REC-42 an access cookie and ?reason=expired: Login renders (no redirect)', async () => {
    fetchSpy = installFetch(() => {
      throw new Error('no API call expected when the access cookie is present');
    });
    const res = await next.proxy(request(EXPIRED_LOGIN, { access_token: OLD_ACCESS }));
    expect(isRedirect(res)).toBe(false);
    expect(res.status).toBeLessThan(300);
  });

  test('BR-REC-42 both cookies and ?reason=expired: Login renders (no redirect)', async () => {
    fetchSpy = installFetch(() => {
      throw new Error('no API call expected when the access cookie is present');
    });
    const res = await next.proxy(
      request(EXPIRED_LOGIN, { access_token: OLD_ACCESS, refresh_token: OLD_REFRESH }),
    );
    expect(isRedirect(res)).toBe(false);
    expect(res.status).toBeLessThan(300);
  });

  test('BR-REC-42 ?reason=expired without any cookie: Login renders', async () => {
    const res = await next.proxy(request('/login?reason=expired'));
    expect(isRedirect(res)).toBe(false);
  });

  test('BR-REC-42 the same address without the marker still goes to Home when signed in', async () => {
    const res = await next.proxy(
      request('/login?next=%2Fadmin%2Fmembers%2F42', { access_token: OLD_ACCESS }),
    );
    expect(isRedirect(res)).toBe(true);
    expect(locationOf(res).pathname).toBe('/admin');
  });

  test('BR-REC-42 the exception covers Login only: a page with ?reason=expired is still guarded', async () => {
    const res = await next.proxy(request('/admin/members?reason=expired'));
    expect(isRedirect(res)).toBe(true);
    expect(locationOf(res).pathname).toBe('/login');
  });
});
