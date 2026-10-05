// Spec: docs/specs/member-records/due-list.md (v2)
//   BR-REC-104 "See all" lists are 25 per page with an assessment filter and the same order.
//   C11        S3 loads 25 per page ("Show more" adds the next page); its filter chips set `typeId`; the tab
//              `soon` is asked from the API as `status=upcoming`.
// Interface: docs/specs/member-records/due-list.md -> `@/lib/api/due/queries`: `useDueList(status, typeId)` is an infinite
//   query that holds `pages` of the E31 envelope `{ data, meta }` under `dueKeys.infinite(status, typeId)`.
// How: the hook is called in a server render (hookHarness.ts); its `refetch` loads page 1 and `fetchNextPage` is the
//   "Show more" button; `fetch` is stubbed with a server that answers like E31 (25 rows a page, 60 rows in all).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import type { QueryClient } from '@tanstack/react-query';
import { jsonResponse, setAuthEnv } from '../auth/helpers';
import { dueRow, TYPE_FITNESS, uuid } from './helpers';
import { appLikeClient, callHook, paramsOf, pathOf, recordingFetch } from './hookHarness';

interface DueKeys {
  infinite(status: 'overdue' | 'upcoming', typeId: string | null): readonly unknown[];
}

interface InfiniteResult {
  refetch(): Promise<unknown>;
  fetchNextPage(): Promise<unknown>;
}

interface QueriesModule {
  dueKeys: DueKeys;
  useDueList(status: 'overdue' | 'upcoming', typeId: string | null): InfiniteResult;
}

let queries: QueriesModule;
let restoreEnv: () => void;
let spy: ReturnType<typeof recordingFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  queries = (await import('@/lib/api/due/queries')) as unknown as QueriesModule;
});

afterEach(() => {
  spy?.restore();
  spy = undefined;
});

afterAll(() => {
  restoreEnv();
});

const TOTAL = 60;
const PAGE_SIZE = 25;

/** An E31 server for 60 rows: page 1 and 2 hold 25 rows, page 3 holds 10. Row names say the page and place. */
function e31Server() {
  return recordingFetch((call) => {
    const params = paramsOf(call.url);
    const page = Number(params.get('page') ?? '1');
    const size = Number(params.get('pageSize') ?? '10');
    const from = (page - 1) * size;
    const count = Math.max(0, Math.min(size, TOTAL - from));
    const data = Array.from({ length: count }, (_, i) =>
      dueRow({ memberId: uuid(5000 + from + i), fullName: `Row ${from + i + 1}` }),
    );
    return jsonResponse(200, {
      success: true,
      data,
      meta: { page, pageSize: size, total: TOTAL, totalPages: Math.ceil(TOTAL / size) },
    });
  });
}

const listCalls = () => spy?.calls.filter((call) => pathOf(call.url) === '/api/due') ?? [];

type Pages = Array<{ data: Array<{ fullName: string }>; meta: { page: number; total: number } }>;
const pagesOf = (client: QueryClient, status: 'overdue' | 'upcoming', typeId: string | null) =>
  (client.getQueryData(queries.dueKeys.infinite(status, typeId)) as { pages: Pages } | undefined)
    ?.pages ?? [];

describe('BR-REC-104 / C11 useDueList: 25 per page, "Show more" adds the next page', () => {
  test("the first load asks page 1 with pageSize=25 and the tab's status", async () => {
    spy = e31Server();
    const client = appLikeClient();
    await callHook(client, () => queries.useDueList('overdue', null)).refetch();
    const calls = listCalls();
    expect(calls.length).toBe(1);
    const params = paramsOf(calls[0]?.url ?? '');
    expect(params.get('status')).toBe('overdue');
    expect(params.get('pageSize')).toBe(String(PAGE_SIZE));
    expect(params.get('page') ?? '1').toBe('1');
  });

  test('the Due soon tab is asked as status=upcoming', async () => {
    spy = e31Server();
    const client = appLikeClient();
    await callHook(client, () => queries.useDueList('upcoming', null)).refetch();
    expect(paramsOf(listCalls()[0]?.url ?? '').get('status')).toBe('upcoming');
  });

  test('"All" sends no typeId; a picked assessment sends typeId', async () => {
    spy = e31Server();
    const all = appLikeClient();
    await callHook(all, () => queries.useDueList('overdue', null)).refetch();
    expect(paramsOf(listCalls()[0]?.url ?? '').has('typeId')).toBe(false);

    const picked = appLikeClient();
    await callHook(picked, () => queries.useDueList('overdue', TYPE_FITNESS)).refetch();
    expect(paramsOf(listCalls()[1]?.url ?? '').get('typeId')).toBe(TYPE_FITNESS);
  });

  test('the first page holds 25 rows, in the order the API sent', async () => {
    spy = e31Server();
    const client = appLikeClient();
    await callHook(client, () => queries.useDueList('overdue', null)).refetch();
    const pages = pagesOf(client, 'overdue', null);
    expect(pages.length).toBe(1);
    expect(pages[0]?.data.length).toBe(PAGE_SIZE);
    expect(pages[0]?.data[0]?.fullName).toBe('Row 1');
    expect(pages[0]?.data[24]?.fullName).toBe('Row 25');
  });

  test('"Show more" asks page 2 with the same status, filter and page size, and appends it', async () => {
    spy = e31Server();
    const client = appLikeClient();
    const list = callHook(client, () => queries.useDueList('overdue', TYPE_FITNESS));
    await list.refetch();
    await list.fetchNextPage();
    const calls = listCalls();
    expect(calls.length).toBe(2);
    const second = paramsOf(calls[1]?.url ?? '');
    expect(second.get('page')).toBe('2');
    expect(second.get('pageSize')).toBe(String(PAGE_SIZE));
    expect(second.get('status')).toBe('overdue');
    expect(second.get('typeId')).toBe(TYPE_FITNESS);

    const pages = pagesOf(client, 'overdue', TYPE_FITNESS);
    expect(pages.length).toBe(2);
    expect(pages[0]?.data[0]?.fullName).toBe('Row 1'); // page 1 is still there
    expect(pages[1]?.data[0]?.fullName).toBe('Row 26');
    expect(pages[1]?.data.length).toBe(PAGE_SIZE);
  });

  test('the last page is shorter (10 rows) and then "Show more" asks for nothing more', async () => {
    spy = e31Server();
    const client = appLikeClient();
    const list = callHook(client, () => queries.useDueList('overdue', null));
    await list.refetch();
    await list.fetchNextPage();
    await list.fetchNextPage();
    expect(listCalls().length).toBe(3);
    const pages = pagesOf(client, 'overdue', null);
    expect(pages.map((page) => page.data.length)).toEqual([25, 25, 10]);

    await list.fetchNextPage();
    expect(listCalls().length).toBe(3);
    expect(pagesOf(client, 'overdue', null).length).toBe(3);
  });

  test('the total stays what the API says on every page (meta.total 60)', async () => {
    spy = e31Server();
    const client = appLikeClient();
    const list = callHook(client, () => queries.useDueList('overdue', null));
    await list.refetch();
    await list.fetchNextPage();
    expect(pagesOf(client, 'overdue', null).map((page) => page.meta.total)).toEqual([TOTAL, TOTAL]);
  });
});
