// Spec: docs/specs/member-records/setup.md (v2)
//   BR-REC-72  every device sees setup changes the next time it opens a form (catalog revalidated with ETag,
//              304 when unchanged). Example: coach adds Burpees on the tablet -> the phone's next form shows it.
//   BR-REC-67  the order is read from the catalog, so a fresh read after "Move up / Move down" matters.
// Interface: .pipeline/member-records-setup/contract.md "Admin app interfaces" + "Admin app" (Catalog freshness,
//   Catalog page size) — `@/lib/api/setup/queries`: `setupKeys` (`all`, `settings()`, `catalog(includeInactive)`),
//   `settingsQueryOptions()`, `assessmentTypesQueryOptions(includeInactive)`; both options have `staleTime: 0`
//   (the app's client defaults to 30 s, so 0 must be explicit); every write invalidates `setupKeys.all`.
//   The catalog is read with `pageSize=100`. The shared fetch wrapper sends `If-None-Match` and treats a 304 as
//   the cached data (`lib/api/client.ts`).
//   The tests drive the options only through a real `QueryClient` and a stubbed `fetch`; the fetchers' own
//   names are not fixed by the contract, so they are reached through `queryFn`.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { installFetch, jsonResponse, setAuthEnv } from '../auth/helpers';

type Queries = typeof import('@/lib/api/setup/queries');

let queries: Queries;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  queries = await import('@/lib/api/setup/queries');
});

afterEach(() => {
  fetchSpy?.restore();
  fetchSpy = undefined;
});

afterAll(() => {
  restoreEnv();
});

/** The same defaults the app's own client has (`staleTime: 30_000`), so an explicit 0 is what makes the difference. */
const appLikeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: false } },
  });

const pathOf = (url: string) => new URL(url, 'http://gym.test').pathname;
const paramsOf = (url: string) => new URL(url, 'http://gym.test').searchParams;

const SETTINGS = {
  gymName: 'Fionis CrossFit',
  timezone: 'Asia/Kolkata',
  upcomingLeadDays: 7,
  expiryLeadDays: 14,
};

const catalogBody = (marker: string) => ({
  success: true,
  data: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: marker,
      intervalCount: 1,
      intervalUnit: 'month',
      isActive: true,
      sortOrder: 1,
      hasValues: false,
      metrics: [],
    },
  ],
  meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
});

/** A server for settings and the catalog that answers like the API: ETag, and 304 for a matching If-None-Match. */
function etagServer(state: { etag: string; settings?: unknown; catalog?: unknown }) {
  return installFetch((call) => {
    const path = pathOf(call.url);
    const body =
      path === '/api/settings'
        ? (state.settings ?? { success: true, data: SETTINGS })
        : path === '/api/assessment-types'
          ? (state.catalog ?? catalogBody('Body composition'))
          : null;
    if (body === null)
      return jsonResponse(404, { success: false, message: 'no', code: 'NOT_FOUND' });
    if (call.headers.get('If-None-Match') === state.etag) {
      return new Response(null, { status: 304, headers: { ETag: state.etag } });
    }
    const answer = jsonResponse(200, body);
    answer.headers.set('ETag', state.etag);
    return answer;
  });
}

const getCalls = (path: string) =>
  fetchSpy?.calls.filter((call) => call.method === 'GET' && pathOf(call.url) === path) ?? [];

let etagCounter = 0;
const freshEtag = (label: string) => `"setup-${label}-${++etagCounter}-${Date.now()}"`;

describe('BR-REC-72 setupKeys', () => {
  test('BR-REC-72 setupKeys.all is a non-empty key', () => {
    expect(Array.isArray(queries.setupKeys.all)).toBe(true);
    expect((queries.setupKeys.all as readonly unknown[]).length).toBeGreaterThan(0);
  });

  test('BR-REC-72 the settings key and both catalog keys sit under setupKeys.all (one invalidate reaches all)', () => {
    const all = queries.setupKeys.all as readonly unknown[];
    for (const key of [
      queries.setupKeys.settings(),
      queries.setupKeys.catalog(true),
      queries.setupKeys.catalog(false),
    ]) {
      expect((key as readonly unknown[]).slice(0, all.length)).toEqual([...all]);
    }
  });

  test('BR-REC-72 the catalog with off items and the catalog without them are different cache entries', () => {
    expect(queries.setupKeys.catalog(true)).not.toEqual(queries.setupKeys.catalog(false));
  });

  test('BR-REC-72 the settings key is not a catalog key', () => {
    expect(queries.setupKeys.settings()).not.toEqual(queries.setupKeys.catalog(true));
    expect(queries.setupKeys.settings()).not.toEqual(queries.setupKeys.catalog(false));
  });

  test('BR-REC-72 the keys are stable: asking twice gives the same key', () => {
    expect(queries.setupKeys.settings()).toEqual(queries.setupKeys.settings());
    expect(queries.setupKeys.catalog(true)).toEqual(queries.setupKeys.catalog(true));
    expect(queries.setupKeys.catalog(false)).toEqual(queries.setupKeys.catalog(false));
  });
});

describe('BR-REC-72 the query options use the keys and are never fresh', () => {
  test('BR-REC-72 settingsQueryOptions uses setupKeys.settings()', () => {
    expect(queries.settingsQueryOptions().queryKey as unknown).toEqual(
      queries.setupKeys.settings(),
    );
  });

  for (const includeInactive of [true, false]) {
    test(`BR-REC-72 assessmentTypesQueryOptions(${includeInactive}) uses setupKeys.catalog(${includeInactive})`, () => {
      expect(queries.assessmentTypesQueryOptions(includeInactive).queryKey as unknown).toEqual(
        queries.setupKeys.catalog(includeInactive),
      );
    });
  }

  test('BR-REC-72 settingsQueryOptions has staleTime 0', () => {
    expect(queries.settingsQueryOptions().staleTime).toBe(0);
  });

  for (const includeInactive of [true, false]) {
    test(`BR-REC-72 assessmentTypesQueryOptions(${includeInactive}) has staleTime 0`, () => {
      expect(queries.assessmentTypesQueryOptions(includeInactive).staleTime).toBe(0);
    });
  }

  test('BR-REC-72 both options have a queryFn', () => {
    expect(typeof queries.settingsQueryOptions().queryFn).toBe('function');
    expect(typeof queries.assessmentTypesQueryOptions(true).queryFn).toBe('function');
  });
});

describe('BR-REC-72 the options read the right endpoints', () => {
  test('BR-REC-72 settingsQueryOptions reads GET /api/settings (E07)', async () => {
    fetchSpy = etagServer({ etag: freshEtag('settings-url') });
    await appLikeClient().fetchQuery(queries.settingsQueryOptions());
    expect(getCalls('/api/settings').length).toBe(1);
  });

  test('BR-REC-72 the catalog with off items reads GET /api/assessment-types?includeInactive=true&pageSize=100 (E09)', async () => {
    fetchSpy = etagServer({ etag: freshEtag('catalog-true-url') });
    await appLikeClient().fetchQuery(queries.assessmentTypesQueryOptions(true));
    const calls = getCalls('/api/assessment-types');
    expect(calls.length).toBe(1);
    const params = paramsOf(calls[0]?.url ?? '');
    expect(params.get('includeInactive')).toBe('true');
    expect(params.get('pageSize')).toBe('100');
  });

  test('BR-REC-72 the catalog without off items reads GET /api/assessment-types with pageSize=100 and no "true"', async () => {
    fetchSpy = etagServer({ etag: freshEtag('catalog-false-url') });
    await appLikeClient().fetchQuery(queries.assessmentTypesQueryOptions(false));
    const calls = getCalls('/api/assessment-types');
    expect(calls.length).toBe(1);
    const params = paramsOf(calls[0]?.url ?? '');
    expect(params.get('includeInactive') ?? 'false').toBe('false');
    expect(params.get('pageSize')).toBe('100');
  });

  test('BR-REC-72 the options hand back what the API answered', async () => {
    fetchSpy = etagServer({
      etag: freshEtag('answer'),
      catalog: catalogBody('Burpees marker'),
    });
    const result = await appLikeClient().fetchQuery(queries.assessmentTypesQueryOptions(true));
    expect(JSON.stringify(result)).toContain('Burpees marker');
  });
});

describe('BR-REC-72 every open asks the server again, and an unchanged answer is a 304', () => {
  test('BR-REC-72 the settings are read again on the next read although the app default is 30 s (staleTime 0)', async () => {
    fetchSpy = etagServer({ etag: freshEtag('settings-again') });
    const client = appLikeClient();
    await client.fetchQuery(queries.settingsQueryOptions());
    await client.fetchQuery(queries.settingsQueryOptions());
    expect(getCalls('/api/settings').length).toBe(2);
  });

  test('BR-REC-72 the catalog is read again on the next read although the app default is 30 s (staleTime 0)', async () => {
    fetchSpy = etagServer({ etag: freshEtag('catalog-again') });
    const client = appLikeClient();
    await client.fetchQuery(queries.assessmentTypesQueryOptions(true));
    await client.fetchQuery(queries.assessmentTypesQueryOptions(true));
    expect(getCalls('/api/assessment-types').length).toBe(2);
  });

  test('BR-REC-72 the second settings read sends the ETag it got, and a 304 gives the same data', async () => {
    const etag = freshEtag('settings-304');
    fetchSpy = etagServer({ etag });
    const client = appLikeClient();
    const first = await client.fetchQuery(queries.settingsQueryOptions());
    const second = await client.fetchQuery(queries.settingsQueryOptions());
    const calls = getCalls('/api/settings');
    expect(calls.length).toBe(2);
    expect(calls[1]?.headers.get('If-None-Match')).toBe(etag);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toContain('Fionis CrossFit');
  });

  test('BR-REC-72 the second catalog read sends the ETag it got, and a 304 gives the same data', async () => {
    const etag = freshEtag('catalog-304');
    fetchSpy = etagServer({ etag, catalog: catalogBody('Fitness test marker') });
    const client = appLikeClient();
    const first = await client.fetchQuery(queries.assessmentTypesQueryOptions(true));
    const second = await client.fetchQuery(queries.assessmentTypesQueryOptions(true));
    const calls = getCalls('/api/assessment-types');
    expect(calls.length).toBe(2);
    expect(calls[1]?.headers.get('If-None-Match')).toBe(etag);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toContain('Fitness test marker');
  });

  test('BR-REC-72 a changed setup is shown on the next read: a new ETag gives the new data, not the old copy', async () => {
    const state = {
      etag: freshEtag('catalog-changed-old'),
      catalog: catalogBody('Before Burpees'),
    };
    fetchSpy = etagServer(state);
    const client = appLikeClient();
    const before = await client.fetchQuery(queries.assessmentTypesQueryOptions(true));
    expect(JSON.stringify(before)).toContain('Before Burpees');

    // The coach adds Burpees on the tablet: the server's data and ETag change.
    state.etag = freshEtag('catalog-changed-new');
    state.catalog = catalogBody('After Burpees');
    const after = await client.fetchQuery(queries.assessmentTypesQueryOptions(true));
    expect(JSON.stringify(after)).toContain('After Burpees');
    expect(JSON.stringify(after)).not.toContain('Before Burpees');
  });

  test('BR-REC-72 changed settings are shown on the next read: a new ETag gives the new data', async () => {
    const state = {
      etag: freshEtag('settings-changed-old'),
      settings: { success: true, data: { ...SETTINGS, gymName: 'Old gym name' } },
    };
    fetchSpy = etagServer(state);
    const client = appLikeClient();
    expect(JSON.stringify(await client.fetchQuery(queries.settingsQueryOptions()))).toContain(
      'Old gym name',
    );

    state.etag = freshEtag('settings-changed-new');
    state.settings = { success: true, data: { ...SETTINGS, gymName: 'New gym name' } };
    const after = await client.fetchQuery(queries.settingsQueryOptions());
    expect(JSON.stringify(after)).toContain('New gym name');
  });
});

describe('BR-REC-72 every write invalidates setupKeys.all', () => {
  test('BR-REC-72 one invalidate of setupKeys.all marks the settings and both catalog reads as out of date', async () => {
    fetchSpy = etagServer({ etag: freshEtag('invalidate') });
    const client = appLikeClient();
    await client.fetchQuery(queries.settingsQueryOptions());
    await client.fetchQuery(queries.assessmentTypesQueryOptions(true));
    await client.fetchQuery(queries.assessmentTypesQueryOptions(false));

    for (const key of [
      queries.setupKeys.settings(),
      queries.setupKeys.catalog(true),
      queries.setupKeys.catalog(false),
    ]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    }

    await client.invalidateQueries({ queryKey: queries.setupKeys.all });

    for (const key of [
      queries.setupKeys.settings(),
      queries.setupKeys.catalog(true),
      queries.setupKeys.catalog(false),
    ]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
