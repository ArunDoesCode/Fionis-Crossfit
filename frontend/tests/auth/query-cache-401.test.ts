// Spec: docs/specs/member-records/auth.md BR-REC-41 — when the refresh has failed (the 401 reaches the
// app), the app "opens Login with the current page as `next`"; one global 401 handler in the query cache
// ("How it is built → App"; contract "Admin app → Fetch wrapper").
// Interface: `getQueryClient()` from `@/lib/queryClient` (existing export) and `ApiError`.
// ASSUMPTION (not fixed by the spec): the handler opens Login by browser navigation, i.e. through
// `window.location` (assign, replace or href). The test records all three. A handler that navigates in
// another way (for example a router object) is not observable here — report it instead of changing this.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';
import { APP_ORIGIN, setAuthEnv } from './helpers';

type GetQueryClient = typeof import('@/lib/queryClient').getQueryClient;

let getQueryClient: GetQueryClient;
let restoreEnv: () => void;
let restoreBrowser: (() => void) | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  getQueryClient = (await import('@/lib/queryClient')).getQueryClient;
});

afterEach(() => {
  restoreBrowser?.();
  restoreBrowser = undefined;
});

afterAll(() => {
  restoreEnv();
});

/** A minimal browser: `window.location` for the page at `path`, recording every navigation. */
function stubBrowser(path: string, search = '') {
  const visited: string[] = [];
  let href = `${APP_ORIGIN}${path}${search}`;
  const location = {
    pathname: path,
    search,
    hash: '',
    origin: APP_ORIGIN,
    host: new URL(APP_ORIGIN).host,
    hostname: new URL(APP_ORIGIN).hostname,
    protocol: 'https:',
    assign: (url: string | URL) => {
      visited.push(String(url));
    },
    replace: (url: string | URL) => {
      visited.push(String(url));
    },
    reload: () => {},
    toString: () => href,
  };
  Object.defineProperty(location, 'href', {
    enumerable: true,
    get: () => href,
    set: (value: string) => {
      href = value;
      visited.push(String(value));
    },
  });

  const globals = globalThis as Record<string, unknown>;
  const hadWindow = 'window' in globals;
  const hadLocation = 'location' in globals;
  const oldWindow = globals.window;
  const oldLocation = globals.location;
  globals.window = { location, addEventListener: () => {}, removeEventListener: () => {} };
  globals.location = location;

  restoreBrowser = () => {
    if (hadWindow) globals.window = oldWindow;
    else delete globals.window;
    if (hadLocation) globals.location = oldLocation;
    else delete globals.location;
  };
  return { visited };
}

/** Runs one query that fails with `error` and waits until the cache has seen the failure. */
async function failQuery(error: unknown) {
  const client = getQueryClient();
  await client
    .fetchQuery({
      queryKey: ['auth-test', Math.random()],
      queryFn: () => {
        throw error;
      },
      retry: false,
    })
    .catch(() => undefined);
  await Bun.sleep(0);
}

const loginTarget = (visited: string[]) => {
  const last = visited.at(-1);
  expect(last).toBeDefined();
  return new URL(last ?? '', APP_ORIGIN);
};

describe('BR-REC-41 a 401 that survived the refresh opens Login with the current page as next', () => {
  test('BR-REC-41 a 401 UNAUTHORIZED on /admin/members/42 opens /login?next=/admin/members/42', async () => {
    const { visited } = stubBrowser('/admin/members/42');
    await failQuery(new ApiError(401, 'Sign in required', 'UNAUTHORIZED'));
    const target = loginTarget(visited);
    expect(target.origin).toBe(APP_ORIGIN);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('next')).toBe('/admin/members/42');
  });

  test('BR-REC-41 a 401 SESSION_EXPIRED opens Login too', async () => {
    const { visited } = stubBrowser('/admin/settings/account');
    await failQuery(new ApiError(401, 'Sign in again', 'SESSION_EXPIRED'));
    const target = loginTarget(visited);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('next')).toBe('/admin/settings/account');
  });

  test('BR-REC-41 the page the trainer was on is the one asked for after signing in again', async () => {
    const { visited } = stubBrowser('/admin/reports');
    await failQuery(new ApiError(401, 'Sign in required', 'UNAUTHORIZED'));
    expect(loginTarget(visited).searchParams.get('next')).toBe('/admin/reports');
  });
});

describe('BR-REC-41 only a 401 opens Login', () => {
  for (const [label, error] of [
    ['500 INTERNAL_ERROR', new ApiError(500, 'Boom', 'INTERNAL_ERROR')],
    ['404 NOT_FOUND', new ApiError(404, 'Missing', 'NOT_FOUND')],
    ['403 CSRF_ORIGIN', new ApiError(403, 'No', 'CSRF_ORIGIN')],
    ['400 VALIDATION_ERROR', new ApiError(400, 'Bad', 'VALIDATION_ERROR')],
    ['429 RATE_LIMITED', new ApiError(429, 'Slow down', 'RATE_LIMITED')],
    ['a network failure', new TypeError('fetch failed')],
  ] as const) {
    test(`BR-REC-41 ${label} does not open Login`, async () => {
      const { visited } = stubBrowser('/admin/members/42');
      await failQuery(error);
      expect(visited).toHaveLength(0);
    });
  }
});
