// Spec: docs/specs/member-records/assessments.md (v2) and performance.md BR-REC-144 (cache)
//   BR-REC-20 / 81 — "previous" is read fresh: the entry-form query never serves a cached copy as fresh.
//   BR-REC-88      — due dates update at once after a write: every successful write (E26, E29, E30) invalidates
//                    the assessment reads, the member reads (`lastAssessedOn`) and the due reads.
// Interface: .pipeline/member-records-assessments/contract.md "Admin app interfaces" —
//   `@/lib/api/assessments/queries`:
//   `entryFormQueryOptions(memberId, typeId, date)` -> TanStack query options: `queryKey` =
//     `assessmentKeys.entryForm(memberId, typeId, date)`, `staleTime: 0`. It reads E25
//     `GET /members/:memberId/entry-form?typeId=&date=`.
//   `invalidateAssessmentData(queryClient)`: takes `Pick<QueryClient, 'invalidateQueries'>` and calls
//     `invalidateQueries({ queryKey })` once each for `['assessments']`, `['members']` and `['due']`; resolves
//     when all three are done.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { installFetch, jsonResponse, setAuthEnv } from '../auth/helpers';

type Key = readonly unknown[];
interface Filters {
  queryKey: Key;
}
interface InvalidateClient {
  invalidateQueries(filters: Filters): Promise<void>;
}
interface QueryOptions {
  queryKey: Key;
  staleTime?: number;
  queryFn?: unknown;
}
interface Queries {
  assessmentKeys: {
    all: Key;
    entryForm(memberId: string, typeId: string, date: string): Key;
    lists(): Key;
    list(filter: { memberId: string; typeId?: string }): Key;
    recent(memberId: string): Key;
    detail(id: string): Key;
  };
  entryFormQueryOptions(memberId: string, typeId: string, date: string): QueryOptions;
  invalidateAssessmentData(client: InvalidateClient): Promise<unknown>;
}

let queries: Queries;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  queries = (await import('@/lib/api/assessments/queries')) as unknown as Queries;
});

afterEach(() => {
  fetchSpy?.restore();
  fetchSpy = undefined;
});

afterAll(() => {
  restoreEnv();
});

const M1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const M2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const T1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const T2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const A1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DATE = '2026-10-03';

/** The same defaults the app's own client has (`staleTime: 30_000`), so an explicit 0 is what makes the difference. */
const appLikeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: false } },
  });

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
const pathOf = (url: string) => new URL(url, 'http://gym.test').pathname;
const paramsOf = (url: string) => new URL(url, 'http://gym.test').searchParams;

describe('BR-REC-20 / 81 entryFormQueryOptions', () => {
  test('BR-REC-81 the query key is assessmentKeys.entryForm(memberId, typeId, date)', () => {
    expect(queries.entryFormQueryOptions(M1, T1, DATE).queryKey as unknown).toEqual(
      queries.assessmentKeys.entryForm(M1, T1, DATE),
    );
  });

  test('BR-REC-81 the key follows member, assessment and date', () => {
    const base = queries.entryFormQueryOptions(M1, T1, DATE).queryKey;
    expect(queries.entryFormQueryOptions(M2, T1, DATE).queryKey).not.toEqual(base);
    expect(queries.entryFormQueryOptions(M1, T2, DATE).queryKey).not.toEqual(base);
    expect(queries.entryFormQueryOptions(M1, T1, '2025-12-30').queryKey).not.toEqual(base);
  });

  test('BR-REC-81 the key sits under assessmentKeys.all (a write refreshes it)', () => {
    const key = queries.entryFormQueryOptions(M1, T1, DATE).queryKey;
    expect(key.slice(0, queries.assessmentKeys.all.length)).toEqual([
      ...queries.assessmentKeys.all,
    ]);
  });

  test('BR-REC-81 staleTime is 0 (previous values must be fresh)', () => {
    expect(queries.entryFormQueryOptions(M1, T1, DATE).staleTime).toBe(0);
  });

  test('BR-REC-81 the options have a queryFn', () => {
    expect(typeof queries.entryFormQueryOptions(M1, T1, DATE).queryFn).toBe('function');
  });

  test('BR-REC-20 the form is read from GET /api/members/:memberId/entry-form?typeId=&date= (E25)', async () => {
    fetchSpy = installFetch(() =>
      jsonResponse(200, {
        success: true,
        data: {
          member: { id: M1, fullName: 'Surya Pratap Marker', joinedOn: '2025-06-01' },
          type: { id: T1, name: 'Body composition' },
          existing: null,
          metrics: [],
        },
      }),
    );
    const result = await appLikeClient().fetchQuery(
      queries.entryFormQueryOptions(M1, T1, DATE) as unknown as Parameters<
        QueryClient['fetchQuery']
      >[0],
    );
    expect(fetchSpy.calls).toHaveLength(1);
    const call = fetchSpy.calls[0];
    expect(call?.method).toBe('GET');
    expect(pathOf(call?.url ?? '')).toBe(`/api/members/${M1}/entry-form`);
    expect(paramsOf(call?.url ?? '').get('typeId')).toBe(T1);
    expect(paramsOf(call?.url ?? '').get('date')).toBe(DATE);
    expect(JSON.stringify(result)).toContain('Surya Pratap Marker');
  });

  test('BR-REC-81 the next read asks the server again although the app default is 30 s (staleTime 0)', async () => {
    fetchSpy = installFetch(() =>
      jsonResponse(200, {
        success: true,
        data: {
          member: { id: M1, fullName: 'Surya Pratap', joinedOn: '2025-06-01' },
          type: { id: T1, name: 'Body composition' },
          existing: null,
          metrics: [],
        },
      }),
    );
    const client = appLikeClient();
    const options = queries.entryFormQueryOptions(M1, T1, DATE) as unknown as Parameters<
      QueryClient['fetchQuery']
    >[0];
    await client.fetchQuery(options);
    await client.fetchQuery(options);
    expect(fetchSpy.calls).toHaveLength(2);
  });
});

describe('BR-REC-88 invalidateAssessmentData calls invalidateQueries for the three key roots', () => {
  function spyClient(gatedRoot?: string) {
    const calls: Filters[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client: InvalidateClient = {
      invalidateQueries: (filters) => {
        calls.push(filters);
        return filters.queryKey[0] === gatedRoot ? gate : Promise.resolve();
      },
    };
    return { client, calls, release: () => release() };
  }

  test('BR-REC-88 it calls invalidateQueries exactly three times', async () => {
    const spy = spyClient();
    await queries.invalidateAssessmentData(spy.client);
    expect(spy.calls).toHaveLength(3);
  });

  test('BR-REC-88 once each for ["assessments"], ["members"] and ["due"], as { queryKey }', async () => {
    const spy = spyClient();
    await queries.invalidateAssessmentData(spy.client);
    const sorted = [...spy.calls].sort((a, b) =>
      String(a.queryKey[0]).localeCompare(String(b.queryKey[0])),
    );
    expect(sorted).toEqual([
      { queryKey: ['assessments'] },
      { queryKey: ['due'] },
      { queryKey: ['members'] },
    ]);
  });

  test('BR-REC-88 the assessments key is assessmentKeys.all', async () => {
    const spy = spyClient();
    await queries.invalidateAssessmentData(spy.client);
    expect(spy.calls.map((call) => call.queryKey)).toContainEqual([...queries.assessmentKeys.all]);
  });

  test('BR-REC-88 a second call invalidates again (three more calls)', async () => {
    const spy = spyClient();
    await queries.invalidateAssessmentData(spy.client);
    await queries.invalidateAssessmentData(spy.client);
    expect(spy.calls).toHaveLength(6);
  });

  test.each(['assessments', 'members', 'due'])(
    'BR-REC-88 it resolves only when the "%s" invalidation is done too',
    async (root) => {
      const spy = spyClient(root);
      let done = false;
      const run = queries.invalidateAssessmentData(spy.client).then(() => {
        done = true;
      });
      await tick();
      await tick();
      expect(done).toBe(false); // one invalidation is still running
      spy.release();
      await run;
      expect(done).toBe(true);
      expect(spy.calls).toHaveLength(3);
    },
  );
});

describe('BR-REC-88 invalidateAssessmentData on a real query client', () => {
  const stateOf = (client: QueryClient, key: Key) => client.getQueryState(key)?.isInvalidated;

  test('BR-REC-88 every assessment read, member read and due read is marked out of date; others are not', async () => {
    const client = new QueryClient();
    const marked: Key[] = [
      queries.assessmentKeys.entryForm(M1, T1, DATE),
      queries.assessmentKeys.list({ memberId: M1 }),
      queries.assessmentKeys.list({ memberId: M1, typeId: T1 }),
      queries.assessmentKeys.recent(M1),
      queries.assessmentKeys.detail(A1),
      ['members'],
      ['members', 'list', { q: 'sur' }],
      ['members', 'detail', M1],
      ['due'],
      ['due', 'home'],
    ];
    const untouched: Key[] = [
      ['setup', 'catalog'],
      ['auth', 'me'],
      ['reports', 'progress'],
    ];
    for (const key of [...marked, ...untouched]) client.setQueryData(key, { stored: true });

    await queries.invalidateAssessmentData(client);

    for (const key of marked) expect(stateOf(client, key)).toBe(true);
    for (const key of untouched) expect(stateOf(client, key)).toBe(false);
  });
});
