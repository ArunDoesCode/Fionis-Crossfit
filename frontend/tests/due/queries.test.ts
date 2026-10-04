// Spec: docs/specs/member-records/due-list.md (v2)
//   C13 / BR-REC-101 / 70 / 88  due data is always fresh: E31 / E32 queries use `staleTime: 0`, so setup or
//              assessment changes show on the next visit; every write ends with `invalidate(dueKeys.all)`.
//   BR-REC-101 / C11  Home asks E31 with `pageSize=5` per section and shows `meta.total` as the count.
//   BR-REC-104 / C11  S3 loads 25 per page; the filter sets `typeId`; E31 `status` is `overdue` | `upcoming`.
//   BR-REC-131 a part that fails to load fails on its own (the query rejects; nothing half-valid is returned).
// Interface: .pipeline/member-records-due-list/contract.md "Admin app interfaces" — `@/lib/api/due/queries`:
//   `dueKeys` (`all: ['due']`, `list(status, typeId, pageSize)`, `infinite(status, typeId)`, `member(memberId)`),
//   `dueListQueryOptions(status, typeId, pageSize)`, `memberDueQueryOptions(memberId)`; all due queries `staleTime: 0`.
//   E31 = GET /api/due?status=&typeId=&page=&pageSize=; E32 = GET /api/members/:memberId/due (contract "Endpoints").
//   The tests drive the options through a real `QueryClient` and a stubbed `fetch`; the fetchers' own names and
//   signatures are not used.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { errorResponse, installFetch, jsonResponse, setAuthEnv } from '../auth/helpers';
import {
  type DueListStatus,
  dueRow,
  MEMBER_ANITA,
  MEMBER_SURYA,
  memberLine,
  TYPE_BODY,
  TYPE_FITNESS,
} from './helpers';

type Options = Parameters<QueryClient['fetchQuery']>[0];

interface DueKeys {
  all: readonly unknown[];
  list(status: DueListStatus, typeId: string | null, pageSize: number): readonly unknown[];
  infinite(status: DueListStatus, typeId: string | null): readonly unknown[];
  member(memberId: string): readonly unknown[];
}

interface QueriesModule {
  dueKeys: DueKeys;
  dueListQueryOptions(status: DueListStatus, typeId: string | null, pageSize: number): Options;
  memberDueQueryOptions(memberId: string): Options;
}

let queries: QueriesModule;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  queries = (await import('@/lib/api/due/queries')) as unknown as QueriesModule;
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

/** A page of E31 the way the API answers it. `marker` is a name that proves which answer a read returned. */
const listBody = (marker: string, total = 37) => ({
  success: true,
  data: [dueRow({ fullName: marker })],
  meta: { page: 1, pageSize: 5, total, totalPages: Math.ceil(total / 5) },
});

/** E32 answers a plain array (no `meta`). */
const memberBody = (marker: string) => ({
  success: true,
  data: [memberLine({ typeName: marker })],
});

interface ServerState {
  list?: unknown;
  member?: unknown;
  fail?: boolean;
}

function dueServer(state: ServerState = {}) {
  return installFetch((call) => {
    if (state.fail) return errorResponse(500, 'INTERNAL_ERROR');
    const path = pathOf(call.url);
    if (path === '/api/due') return jsonResponse(200, state.list ?? listBody('Default Member'));
    if (/^\/api\/members\/[^/]+\/due$/.test(path)) {
      return jsonResponse(200, state.member ?? memberBody('Default Assessment'));
    }
    return errorResponse(404, 'NOT_FOUND');
  });
}

const callsTo = (matcher: (path: string) => boolean) =>
  fetchSpy?.calls.filter((call) => call.method === 'GET' && matcher(pathOf(call.url))) ?? [];
const listCalls = () => callsTo((path) => path === '/api/due');
const memberCalls = () => callsTo((path) => /^\/api\/members\/[^/]+\/due$/.test(path));

describe('C13 dueKeys', () => {
  test('dueKeys.all is the key ["due"]', () => {
    expect([...queries.dueKeys.all]).toEqual(['due']);
  });

  test('every key sits under dueKeys.all (one invalidate reaches the lists, the infinite lists and the member lines)', () => {
    const all = [...queries.dueKeys.all];
    for (const key of [
      queries.dueKeys.list('overdue', null, 5),
      queries.dueKeys.list('upcoming', TYPE_BODY, 25),
      queries.dueKeys.infinite('overdue', null),
      queries.dueKeys.infinite('upcoming', TYPE_FITNESS),
      queries.dueKeys.member(MEMBER_SURYA),
    ]) {
      expect([...key].slice(0, all.length)).toEqual(all);
    }
  });

  test('the same arguments give the same key (stable)', () => {
    expect(queries.dueKeys.list('overdue', TYPE_BODY, 5)).toEqual(
      queries.dueKeys.list('overdue', TYPE_BODY, 5),
    );
    expect(queries.dueKeys.infinite('upcoming', null)).toEqual(
      queries.dueKeys.infinite('upcoming', null),
    );
    expect(queries.dueKeys.member(MEMBER_SURYA)).toEqual(queries.dueKeys.member(MEMBER_SURYA));
  });

  test('BR-REC-104 the two tabs are different cache entries', () => {
    expect(queries.dueKeys.list('overdue', null, 5)).not.toEqual(
      queries.dueKeys.list('upcoming', null, 5),
    );
    expect(queries.dueKeys.infinite('overdue', null)).not.toEqual(
      queries.dueKeys.infinite('upcoming', null),
    );
  });

  test('BR-REC-104 the assessment filter is part of the key ("All" and each assessment differ)', () => {
    const keys = [
      queries.dueKeys.list('overdue', null, 25),
      queries.dueKeys.list('overdue', TYPE_BODY, 25),
      queries.dueKeys.list('overdue', TYPE_FITNESS, 25),
    ].map((key) => JSON.stringify(key));
    expect(new Set(keys).size).toBe(3);
    const infinite = [
      queries.dueKeys.infinite('overdue', null),
      queries.dueKeys.infinite('overdue', TYPE_BODY),
      queries.dueKeys.infinite('overdue', TYPE_FITNESS),
    ].map((key) => JSON.stringify(key));
    expect(new Set(infinite).size).toBe(3);
  });

  test('BR-REC-101 the page size is part of the key (Home 5 and S3 25 never share an entry)', () => {
    expect(queries.dueKeys.list('overdue', null, 5)).not.toEqual(
      queries.dueKeys.list('overdue', null, 25),
    );
  });

  test('a one-page list and an infinite list never share a cache entry (their data shapes differ)', () => {
    expect(JSON.stringify(queries.dueKeys.infinite('overdue', null))).not.toBe(
      JSON.stringify(queries.dueKeys.list('overdue', null, 25)),
    );
    expect(JSON.stringify(queries.dueKeys.infinite('overdue', null))).not.toBe(
      JSON.stringify(queries.dueKeys.list('overdue', null, 5)),
    );
  });

  test('BR-REC-103 each member has their own member key, and it is not a list key', () => {
    expect(queries.dueKeys.member(MEMBER_SURYA)).not.toEqual(queries.dueKeys.member(MEMBER_ANITA));
    expect(JSON.stringify(queries.dueKeys.member(MEMBER_SURYA))).not.toBe(
      JSON.stringify(queries.dueKeys.list('overdue', null, 5)),
    );
    expect(JSON.stringify(queries.dueKeys.member(MEMBER_SURYA))).not.toBe(
      JSON.stringify(queries.dueKeys.infinite('overdue', null)),
    );
  });
});

describe('C13 the query options use the keys and are never fresh', () => {
  test('dueListQueryOptions uses dueKeys.list(status, typeId, pageSize)', () => {
    expect(queries.dueListQueryOptions('overdue', null, 5).queryKey as unknown).toEqual(
      queries.dueKeys.list('overdue', null, 5),
    );
    expect(queries.dueListQueryOptions('upcoming', TYPE_BODY, 25).queryKey as unknown).toEqual(
      queries.dueKeys.list('upcoming', TYPE_BODY, 25),
    );
  });

  test('memberDueQueryOptions uses dueKeys.member(memberId)', () => {
    expect(queries.memberDueQueryOptions(MEMBER_SURYA).queryKey as unknown).toEqual(
      queries.dueKeys.member(MEMBER_SURYA),
    );
  });

  test('dueListQueryOptions has staleTime 0', () => {
    expect(queries.dueListQueryOptions('overdue', null, 5).staleTime).toBe(0);
    expect(queries.dueListQueryOptions('upcoming', TYPE_FITNESS, 25).staleTime).toBe(0);
  });

  test('memberDueQueryOptions has staleTime 0', () => {
    expect(queries.memberDueQueryOptions(MEMBER_SURYA).staleTime).toBe(0);
  });

  test('both options have a queryFn', () => {
    expect(typeof queries.dueListQueryOptions('overdue', null, 5).queryFn).toBe('function');
    expect(typeof queries.memberDueQueryOptions(MEMBER_SURYA).queryFn).toBe('function');
  });
});

describe('E31 the list options read GET /api/due', () => {
  test('BR-REC-101 Home Overdue: status=overdue, pageSize=5, no assessment filter', async () => {
    fetchSpy = dueServer();
    await appLikeClient().fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    const calls = listCalls();
    expect(calls.length).toBe(1);
    const params = paramsOf(calls[0]?.url ?? '');
    expect(params.get('status')).toBe('overdue');
    expect(params.get('pageSize')).toBe('5');
    expect(params.has('typeId')).toBe(false);
  });

  test('BR-REC-101 Home Due soon: the API value is status=upcoming (not "soon")', async () => {
    fetchSpy = dueServer();
    await appLikeClient().fetchQuery(queries.dueListQueryOptions('upcoming', null, 5));
    const params = paramsOf(listCalls()[0]?.url ?? '');
    expect(params.get('status')).toBe('upcoming');
    expect(params.get('pageSize')).toBe('5');
  });

  test('BR-REC-104 S3 asks 25 at a time', async () => {
    fetchSpy = dueServer();
    await appLikeClient().fetchQuery(queries.dueListQueryOptions('overdue', null, 25));
    expect(paramsOf(listCalls()[0]?.url ?? '').get('pageSize')).toBe('25');
  });

  test('BR-REC-104 an assessment filter is sent as typeId', async () => {
    fetchSpy = dueServer();
    await appLikeClient().fetchQuery(queries.dueListQueryOptions('overdue', TYPE_FITNESS, 25));
    const params = paramsOf(listCalls()[0]?.url ?? '');
    expect(params.get('typeId')).toBe(TYPE_FITNESS);
    expect(params.get('status')).toBe('overdue');
    expect(params.get('pageSize')).toBe('25');
  });

  test('BR-REC-104 "All" sends no typeId at all', async () => {
    fetchSpy = dueServer();
    await appLikeClient().fetchQuery(queries.dueListQueryOptions('upcoming', null, 25));
    expect(paramsOf(listCalls()[0]?.url ?? '').has('typeId')).toBe(false);
  });

  test('the first page is asked for (page absent or 1)', async () => {
    fetchSpy = dueServer();
    await appLikeClient().fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    const page = paramsOf(listCalls()[0]?.url ?? '').get('page');
    expect(page === null || page === '1').toBe(true);
  });

  test('BR-REC-101 the answer carries the rows and meta.total (the count shown in the section title)', async () => {
    fetchSpy = dueServer({ list: listBody('Marker Member', 37) });
    const result = await appLikeClient().fetchQuery(
      queries.dueListQueryOptions('overdue', null, 5),
    );
    const text = JSON.stringify(result);
    expect(text).toContain('Marker Member');
    expect(text).toContain('"total":37');
  });

  test('BR-REC-101 an empty list is a normal answer: no rows, total 0', async () => {
    fetchSpy = dueServer({
      list: { success: true, data: [], meta: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
    });
    const result = await appLikeClient().fetchQuery(
      queries.dueListQueryOptions('overdue', null, 5),
    );
    expect(JSON.stringify(result)).toContain('"total":0');
  });
});

describe('E32 the member option reads GET /api/members/:memberId/due', () => {
  test('BR-REC-103 asks for that member', async () => {
    fetchSpy = dueServer();
    await appLikeClient().fetchQuery(queries.memberDueQueryOptions(MEMBER_ANITA));
    const calls = memberCalls();
    expect(calls.length).toBe(1);
    expect(pathOf(calls[0]?.url ?? '')).toBe(`/api/members/${MEMBER_ANITA}/due`);
  });

  test('BR-REC-103 hands back what the API answered', async () => {
    fetchSpy = dueServer({ member: memberBody('Fitness marker') });
    const result = await appLikeClient().fetchQuery(queries.memberDueQueryOptions(MEMBER_SURYA));
    expect(JSON.stringify(result)).toContain('Fitness marker');
  });
});

describe('C13 every visit asks the server again (staleTime 0, although the app default is 30 s)', () => {
  test('the list is read again on the next read', async () => {
    fetchSpy = dueServer();
    const client = appLikeClient();
    await client.fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    await client.fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    expect(listCalls().length).toBe(2);
  });

  test('the member lines are read again on the next read', async () => {
    fetchSpy = dueServer();
    const client = appLikeClient();
    await client.fetchQuery(queries.memberDueQueryOptions(MEMBER_SURYA));
    await client.fetchQuery(queries.memberDueQueryOptions(MEMBER_SURYA));
    expect(memberCalls().length).toBe(2);
  });

  test('a changed setup shows on the next read: the new answer replaces the old one', async () => {
    const state: ServerState = { list: listBody('Before setup change') };
    fetchSpy = dueServer(state);
    const client = appLikeClient();
    const before = await client.fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    expect(JSON.stringify(before)).toContain('Before setup change');

    state.list = listBody('After setup change');
    const after = await client.fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    expect(JSON.stringify(after)).toContain('After setup change');
    expect(JSON.stringify(after)).not.toContain('Before setup change');
  });

  test('a saved assessment shows on the next member-page visit', async () => {
    const state: ServerState = { member: memberBody('Overdue before save') };
    fetchSpy = dueServer(state);
    const client = appLikeClient();
    await client.fetchQuery(queries.memberDueQueryOptions(MEMBER_SURYA));
    state.member = memberBody('Next due after save');
    const after = await client.fetchQuery(queries.memberDueQueryOptions(MEMBER_SURYA));
    expect(JSON.stringify(after)).toContain('Next due after save');
  });
});

describe('C13 every write invalidates dueKeys.all', () => {
  test('one invalidate of dueKeys.all marks the lists, the infinite lists and the member lines as out of date', async () => {
    fetchSpy = dueServer();
    const client = appLikeClient();
    await client.fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    await client.fetchQuery(queries.dueListQueryOptions('upcoming', TYPE_BODY, 25));
    await client.fetchQuery(queries.memberDueQueryOptions(MEMBER_SURYA));
    client.setQueryData(queries.dueKeys.infinite('overdue', null), {
      pages: [listBody('Seeded page')],
      pageParams: [1],
    });

    const keys = [
      queries.dueKeys.list('overdue', null, 5),
      queries.dueKeys.list('upcoming', TYPE_BODY, 25),
      queries.dueKeys.member(MEMBER_SURYA),
      queries.dueKeys.infinite('overdue', null),
    ];
    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    }

    await client.invalidateQueries({ queryKey: queries.dueKeys.all, refetchType: 'none' });

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});

describe('BR-REC-131 a part that fails to load fails on its own', () => {
  test('a failing E31 read rejects the list query (the section then shows "Couldn\'t load this.")', async () => {
    fetchSpy = dueServer({ fail: true });
    let failure: unknown;
    try {
      await appLikeClient().fetchQuery(queries.dueListQueryOptions('overdue', null, 5));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
  });

  test('a failing E32 read rejects the member query', async () => {
    fetchSpy = dueServer({ fail: true });
    let failure: unknown;
    try {
      await appLikeClient().fetchQuery(queries.memberDueQueryOptions(MEMBER_SURYA));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
  });

  test('one failing section does not stop the other: Overdue fails, Due soon still loads', async () => {
    fetchSpy = installFetch((call) => {
      const params = paramsOf(call.url);
      if (pathOf(call.url) === '/api/due' && params.get('status') === 'overdue') {
        return errorResponse(500, 'INTERNAL_ERROR');
      }
      return jsonResponse(200, listBody('Due soon still here', 4));
    });
    const client = appLikeClient();
    const results = await Promise.allSettled([
      client.fetchQuery(queries.dueListQueryOptions('overdue', null, 5)),
      client.fetchQuery(queries.dueListQueryOptions('upcoming', null, 5)),
    ]);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    const second = results[1];
    expect(JSON.stringify(second?.status === 'fulfilled' ? second.value : null)).toContain(
      'Due soon still here',
    );
  });
});
