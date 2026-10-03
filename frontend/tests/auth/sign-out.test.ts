// Spec: docs/specs/member-records/auth.md BR-REC-35 — "Sign out" ends this device's sign-in and clears the
// app's cached data; "Sign out all devices" ends every sign-in, this one too.
//   Sign out -> back button shows Login, not member data. Check: `queryClient.clear()` called.
// Interface: .pipeline/member-records-auth/contract.md "Admin app interfaces" — `@/lib/auth/signOut`:
//   `signOutDevice(queryClient)` POST E03 `/api/auth/logout`; `signOutAllDevices(queryClient)` POST E04
//   `/api/auth/logout-all`; on success `queryClient.clear()` and then browser navigation to `/login`
//   (`window.location`, not the router); on failure no clear, the error is thrown.
// The tests drive both functions only through `fetch`, a real `QueryClient` and a stubbed `window.location`.

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/errors';
import { APP_ORIGIN, errorResponse, installFetch, jsonResponse, setAuthEnv } from './helpers';

type SignOut = typeof import('@/lib/auth/signOut');

let signOut: SignOut;
let restoreEnv: () => void;
let restoreBrowser: (() => void) | undefined;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  signOut = await import('@/lib/auth/signOut');
});

afterEach(() => {
  restoreBrowser?.();
  restoreBrowser = undefined;
  fetchSpy?.restore();
  fetchSpy = undefined;
});

afterAll(() => {
  restoreEnv();
});

const MEMBER_KEY = ['members', 42];
const MEMBER_DATA = { name: 'Cached member data' };

/** A minimal browser on `/admin/settings/account`; every navigation is pushed into `events`. */
function stubBrowser(events: string[]) {
  const path = '/admin/settings/account';
  const record = (url: string | URL) => {
    events.push(`navigate ${new URL(String(url), APP_ORIGIN).pathname}`);
  };
  let href = `${APP_ORIGIN}${path}`;
  const location = {
    pathname: path,
    search: '',
    hash: '',
    origin: APP_ORIGIN,
    host: new URL(APP_ORIGIN).host,
    hostname: new URL(APP_ORIGIN).hostname,
    protocol: 'https:',
    assign: record,
    replace: record,
    reload: () => {},
    toString: () => href,
  };
  Object.defineProperty(location, 'href', {
    enumerable: true,
    get: () => href,
    set: (value: string) => {
      href = value;
      record(value);
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
}

/** A real query cache holding member data; `clear()` is recorded in `events` and still does its job. */
function cachedClient(events: string[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(MEMBER_KEY, MEMBER_DATA);
  const realClear = queryClient.clear.bind(queryClient);
  queryClient.clear = () => {
    events.push('clear');
    realClear();
  };
  return queryClient;
}

/** What the cache holds for the member key (a typed read, so `toEqual` can compare it). */
const cachedMember = (queryClient: QueryClient) =>
  queryClient.getQueryData<typeof MEMBER_DATA>(MEMBER_KEY);

const pathOf = (url: string) => new URL(url, APP_ORIGIN).pathname;

const variants = [
  {
    name: 'signOutDevice',
    path: '/api/auth/logout',
    run: (c: QueryClient) => signOut.signOutDevice(c),
  },
  {
    name: 'signOutAllDevices',
    path: '/api/auth/logout-all',
    run: (c: QueryClient) => signOut.signOutAllDevices(c),
  },
] as const;

for (const { name, path, run } of variants) {
  describe(`BR-REC-35 ${name}`, () => {
    test(`BR-REC-35 ${name} sends one POST to ${path}`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch(() => jsonResponse(200, { success: true, data: { signedOut: 1 } }));
      await run(cachedClient(events));
      expect(fetchSpy.calls.map((call) => `${call.method} ${pathOf(call.url)}`)).toEqual([
        `POST ${path}`,
      ]);
    });

    test(`BR-REC-35 ${name} on success: the call, then clear(), then navigation to /login`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch((call) => {
        events.push(`fetch ${call.method} ${pathOf(call.url)}`);
        return jsonResponse(200, { success: true, data: { signedOut: 1 } });
      });
      await run(cachedClient(events));
      expect(events).toEqual([`fetch POST ${path}`, 'clear', 'navigate /login']);
    });

    test(`BR-REC-35 ${name} leaves no cached data behind (the back button cannot show member data)`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch(() => jsonResponse(200, { success: true, data: { signedOut: 1 } }));
      const queryClient = cachedClient(events);
      expect(cachedMember(queryClient)).toEqual(MEMBER_DATA);
      await run(queryClient);
      expect(cachedMember(queryClient)).toBeUndefined();
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });

    test(`BR-REC-35 ${name} clears the cache once and navigates once`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch(() => jsonResponse(200, { success: true, data: { signedOut: 1 } }));
      await run(cachedClient(events));
      expect(events.filter((event) => event === 'clear')).toHaveLength(1);
      expect(events.filter((event) => event.startsWith('navigate '))).toHaveLength(1);
    });

    test(`BR-REC-35 ${name} clears nothing and goes nowhere until the server has answered`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      fetchSpy = installFetch(async () => {
        await gate;
        return jsonResponse(200, { success: true, data: { signedOut: 1 } });
      });
      const queryClient = cachedClient(events);
      const pending = run(queryClient);
      await Bun.sleep(20);
      expect(events).toEqual([]);
      expect(cachedMember(queryClient)).toEqual(MEMBER_DATA);
      release();
      await pending;
      expect(events).toEqual(['clear', 'navigate /login']);
    });

    test(`BR-REC-35 ${name} when the server refuses (500): the error is thrown, nothing cleared, no navigation`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch(() => errorResponse(500, 'INTERNAL_ERROR', 'Boom'));
      const queryClient = cachedClient(events);
      const error = await run(queryClient).then(
        () => undefined,
        (err: unknown) => err ?? new Error('rejected with nothing'),
      );
      expect(error).toBeInstanceOf(Error);
      expect(events).toEqual([]);
      expect(cachedMember(queryClient)).toEqual(MEMBER_DATA);
    });

    test(`BR-REC-35 ${name} when the server refuses (500): the server's code reaches the caller`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch(() => errorResponse(500, 'INTERNAL_ERROR', 'Boom'));
      const error = await run(cachedClient(events)).then(
        () => undefined,
        (err: unknown) => err,
      );
      expect(isApiError(error)).toBe(true);
      if (isApiError(error)) {
        expect(error.status).toBe(500);
        expect(error.code).toBe('INTERNAL_ERROR');
      }
    });

    test(`BR-REC-35 ${name} when the page is refused (403 CSRF_ORIGIN): thrown, nothing cleared`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch(() => errorResponse(403, 'CSRF_ORIGIN', 'No'));
      const queryClient = cachedClient(events);
      const error = await run(queryClient).then(
        () => undefined,
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(Error);
      expect(events).toEqual([]);
      expect(cachedMember(queryClient)).toEqual(MEMBER_DATA);
    });

    test(`BR-REC-35 ${name} when the network fails: thrown, nothing cleared, no navigation`, async () => {
      const events: string[] = [];
      stubBrowser(events);
      fetchSpy = installFetch(() => {
        throw new TypeError('fetch failed');
      });
      const queryClient = cachedClient(events);
      const error = await run(queryClient).then(
        () => undefined,
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(Error);
      expect(events).toEqual([]);
      expect(cachedMember(queryClient)).toEqual(MEMBER_DATA);
    });
  });
}

describe('BR-REC-35 the two buttons end different things', () => {
  test('BR-REC-35 signOutDevice never calls the all-devices endpoint', async () => {
    const events: string[] = [];
    stubBrowser(events);
    fetchSpy = installFetch(() => jsonResponse(200, { success: true, data: {} }));
    await signOut.signOutDevice(cachedClient(events));
    expect(fetchSpy.calls.map((call) => pathOf(call.url))).not.toContain('/api/auth/logout-all');
  });

  test('BR-REC-35 signOutAllDevices never calls the single-device endpoint', async () => {
    const events: string[] = [];
    stubBrowser(events);
    fetchSpy = installFetch(() => jsonResponse(200, { success: true, data: { signedOut: 3 } }));
    await signOut.signOutAllDevices(cachedClient(events));
    expect(fetchSpy.calls.map((call) => pathOf(call.url))).not.toContain('/api/auth/logout');
  });
});
