// Spec: docs/specs/member-records/progress.md (v2)
//   BR-REC-110 Gym progress and leaderboards always include the latest saves: computed on every request (no
//              server cache, v2) "and the screens fetch them again on every open". Example: save Surya's body fat ->
//              progress n goes 12 -> 13 at once.
//   P1         the admin queries use `staleTime: 0`.
//   BR-REC-115 leaderboard: top 10 with "Show more" (Q3); P6 paged with `page` / `pageSize` (default 10 = "top 10";
//              "Show more" asks for the next page).
//   BR-REC-111 E36 query: metric, joined month from-to, plan, sex, age band.
// Interface: .pipeline/member-records-progress/contract.md "Admin app interfaces" — `@/lib/api/progress/queries`:
//   `progressKeys` (`all`, `reportCard(memberId)`, `stats(query)`, `leaderboard(metricId, sex)`, `activeByPlan()`),
//   `reportCardQueryOptions(memberId)`, `progressStatsQueryOptions(query)`, `activeByPlanQueryOptions()`,
//   `leaderboardInfiniteQueryOptions(metricId, sex)`; every option has `staleTime: 0`; leaderboard pages of 10.
//   Endpoints: E35 GET /api/members/:memberId/report-card, E36 GET /api/reports/progress
//   (`metricId`, `joinedFrom`, `joinedTo`, `plan`, `sex`, `ageBand`), E37 GET /api/reports/leaderboard
//   (`metricId`, `sex`, `page`, `pageSize`), E38 GET /api/reports/active-by-plan.
//   The tests drive the options only through a real `QueryClient` and a stubbed `fetch`; the fetchers' own names
//   are not fixed by the contract, so they are reached through `queryFn`.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { installFetch, jsonResponse, setAuthEnv } from '../auth/helpers';

type Sex = 'male' | 'female';

interface StatsQuery {
  metricId: string;
  joinedFrom?: string;
  joinedTo?: string;
  plan?: string;
  sex?: string;
  ageBand?: string;
}

interface Options {
  queryKey: readonly unknown[];
  staleTime?: number;
  queryFn?: unknown;
}

interface Queries {
  progressKeys: {
    all: readonly unknown[];
    reportCard(memberId: string): readonly unknown[];
    stats(query: StatsQuery): readonly unknown[];
    leaderboard(metricId: string, sex: Sex): readonly unknown[];
    activeByPlan(): readonly unknown[];
  };
  reportCardQueryOptions(memberId: string): Options;
  progressStatsQueryOptions(query: StatsQuery): Options;
  activeByPlanQueryOptions(): Options;
  leaderboardInfiniteQueryOptions(metricId: string, sex: Sex): Options;
}

interface InfiniteResult {
  pages: unknown[];
  pageParams: unknown[];
}

let queries: Queries;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  queries = (await import('@/lib/api/progress/queries')) as unknown as Queries;
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

const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const METRIC_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_METRIC_ID = '55555555-5555-4555-8555-555555555555';

const REPORT_CARD_PATH = `/api/members/${MEMBER_ID}/report-card`;
const PROGRESS_PATH = '/api/reports/progress';
const LEADERBOARD_PATH = '/api/reports/leaderboard';
const ACTIVE_PATH = '/api/reports/active-by-plan';

interface ServerState {
  gymName: string;
  n: number;
  leaderboardTotal: number;
}

const newState = (): ServerState => ({ gymName: 'Fionis CrossFit', n: 12, leaderboardTotal: 25 });

const PAGE_SIZE_SERVED = 10;

function leaderboardBody(state: ServerState, page: number) {
  const totalPages = Math.max(1, Math.ceil(state.leaderboardTotal / PAGE_SIZE_SERVED));
  const before = (page - 1) * PAGE_SIZE_SERVED;
  const onPage = Math.max(0, Math.min(PAGE_SIZE_SERVED, state.leaderboardTotal - before));
  return {
    success: true,
    data: Array.from({ length: onPage }, (_, index) => ({
      rank: before + index + 1,
      memberId: `66666666-6666-4666-8666-${String(before + index).padStart(12, '0')}`,
      fullName: `page${page}-row${index}`,
      value: 18 + before + index,
      on: '2026-09-12',
    })),
    meta: {
      page,
      pageSize: PAGE_SIZE_SERVED,
      total: state.leaderboardTotal,
      totalPages,
    },
  };
}

/** A server for E35-E38 that answers like the API. */
function progressServer(state: ServerState = newState()) {
  return installFetch((call) => {
    const path = pathOf(call.url);
    if (path === REPORT_CARD_PATH || path === `/api/members/${OTHER_MEMBER_ID}/report-card`) {
      return jsonResponse(200, {
        success: true,
        data: {
          gymName: state.gymName,
          printedOn: '2026-10-03',
          member: {
            fullName: 'Surya Pratap',
            age: 44,
            sex: 'male',
            plan: 'annual',
            membershipStatus: 'active',
            joinedOn: '2025-06-01',
          },
          types: [],
          segmental: null,
        },
      });
    }
    if (path === PROGRESS_PATH) {
      return jsonResponse(200, {
        success: true,
        data: {
          metric: {
            id: METRIC_ID,
            name: 'Body fat %',
            unit: '%',
            datatype: 'number',
            decimals: 1,
            better: 'lower',
          },
          n: state.n,
          notCounted: 5,
          avgChange: -2.1,
          improved: 8,
          noChange: 3,
          worse: 1,
        },
      });
    }
    if (path === LEADERBOARD_PATH) {
      const page = Number(paramsOf(call.url).get('page') ?? '1');
      return jsonResponse(200, leaderboardBody(state, page));
    }
    if (path === ACTIVE_PATH) {
      return jsonResponse(200, {
        success: true,
        data: { monthly: 40, quarterly: 22, halfAnnual: 9, annual: 31, total: 102 },
      });
    }
    return jsonResponse(404, { success: false, message: 'no', code: 'NOT_FOUND' });
  });
}

const getCalls = (path: string) =>
  fetchSpy?.calls.filter((call) => call.method === 'GET' && pathOf(call.url) === path) ?? [];

const FULL_QUERY: StatsQuery = {
  metricId: METRIC_ID,
  joinedFrom: '2026-01',
  joinedTo: '2026-03',
  plan: 'half_annual',
  sex: 'female',
  ageBand: '20to29',
};

describe('BR-REC-110 progressKeys', () => {
  test('BR-REC-110 progressKeys.all is a non-empty key', () => {
    expect(Array.isArray(queries.progressKeys.all)).toBe(true);
    expect(queries.progressKeys.all.length).toBeGreaterThan(0);
  });

  test('BR-REC-110 every key sits under progressKeys.all (one invalidate reaches all)', () => {
    const all = queries.progressKeys.all;
    for (const key of [
      queries.progressKeys.reportCard(MEMBER_ID),
      queries.progressKeys.stats(FULL_QUERY),
      queries.progressKeys.leaderboard(METRIC_ID, 'male'),
      queries.progressKeys.leaderboard(METRIC_ID, 'female'),
      queries.progressKeys.activeByPlan(),
    ]) {
      expect(key.slice(0, all.length)).toEqual([...all]);
    }
  });

  test('BR-REC-110 the four kinds of read are four different cache entries', () => {
    const keys = [
      queries.progressKeys.reportCard(MEMBER_ID),
      queries.progressKeys.stats({ metricId: METRIC_ID }),
      queries.progressKeys.leaderboard(METRIC_ID, 'male'),
      queries.progressKeys.activeByPlan(),
    ].map((key) => JSON.stringify(key));
    expect(new Set(keys).size).toBe(4);
  });

  test('BR-REC-110 a different member is a different report card entry', () => {
    expect(queries.progressKeys.reportCard(MEMBER_ID)).not.toEqual(
      queries.progressKeys.reportCard(OTHER_MEMBER_ID),
    );
  });

  test('BR-REC-111 a different measurement or filter is a different progress entry', () => {
    const base = queries.progressKeys.stats({ metricId: METRIC_ID });
    expect(base).not.toEqual(queries.progressKeys.stats({ metricId: OTHER_METRIC_ID }));
    expect(base).not.toEqual(queries.progressKeys.stats({ metricId: METRIC_ID, sex: 'female' }));
    expect(base).not.toEqual(queries.progressKeys.stats({ metricId: METRIC_ID, plan: 'annual' }));
    expect(base).not.toEqual(
      queries.progressKeys.stats({ metricId: METRIC_ID, joinedFrom: '2026-01' }),
    );
    expect(base).not.toEqual(
      queries.progressKeys.stats({ metricId: METRIC_ID, joinedTo: '2026-03' }),
    );
    expect(base).not.toEqual(
      queries.progressKeys.stats({ metricId: METRIC_ID, ageBand: '20to29' }),
    );
  });

  test('BR-REC-115 Male and Female are different leaderboard entries, and so are two measurements', () => {
    const maleKey = queries.progressKeys.leaderboard(METRIC_ID, 'male');
    expect(maleKey).not.toEqual(queries.progressKeys.leaderboard(METRIC_ID, 'female'));
    expect(maleKey).not.toEqual(queries.progressKeys.leaderboard(OTHER_METRIC_ID, 'male'));
  });

  test('BR-REC-110 the keys are stable: asking twice gives the same key', () => {
    expect(queries.progressKeys.reportCard(MEMBER_ID)).toEqual(
      queries.progressKeys.reportCard(MEMBER_ID),
    );
    expect(queries.progressKeys.stats(FULL_QUERY)).toEqual(
      queries.progressKeys.stats({ ...FULL_QUERY }),
    );
    expect(queries.progressKeys.leaderboard(METRIC_ID, 'female')).toEqual(
      queries.progressKeys.leaderboard(METRIC_ID, 'female'),
    );
    expect(queries.progressKeys.activeByPlan()).toEqual(queries.progressKeys.activeByPlan());
  });
});

describe('BR-REC-110 the query options use the keys and are never fresh', () => {
  test('BR-REC-110 reportCardQueryOptions uses progressKeys.reportCard(memberId)', () => {
    expect(queries.reportCardQueryOptions(MEMBER_ID).queryKey).toEqual(
      queries.progressKeys.reportCard(MEMBER_ID),
    );
  });

  test('BR-REC-110 progressStatsQueryOptions uses progressKeys.stats(query)', () => {
    expect(queries.progressStatsQueryOptions(FULL_QUERY).queryKey).toEqual(
      queries.progressKeys.stats(FULL_QUERY),
    );
  });

  test('BR-REC-110 activeByPlanQueryOptions uses progressKeys.activeByPlan()', () => {
    expect(queries.activeByPlanQueryOptions().queryKey).toEqual(
      queries.progressKeys.activeByPlan(),
    );
  });

  for (const sex of ['male', 'female'] as const) {
    test(`BR-REC-115 leaderboardInfiniteQueryOptions uses progressKeys.leaderboard(metric, ${sex})`, () => {
      expect(queries.leaderboardInfiniteQueryOptions(METRIC_ID, sex).queryKey).toEqual(
        queries.progressKeys.leaderboard(METRIC_ID, sex),
      );
    });
  }

  test('P1 / BR-REC-110 the report card has staleTime 0', () => {
    expect(queries.reportCardQueryOptions(MEMBER_ID).staleTime).toBe(0);
  });

  test('P1 / BR-REC-110 the gym progress has staleTime 0', () => {
    expect(queries.progressStatsQueryOptions(FULL_QUERY).staleTime).toBe(0);
  });

  test('P1 / BR-REC-110 the active-by-plan read has staleTime 0', () => {
    expect(queries.activeByPlanQueryOptions().staleTime).toBe(0);
  });

  for (const sex of ['male', 'female'] as const) {
    test(`P1 / BR-REC-110 the ${sex} leaderboard has staleTime 0`, () => {
      expect(queries.leaderboardInfiniteQueryOptions(METRIC_ID, sex).staleTime).toBe(0);
    });
  }

  test('BR-REC-110 every option has a queryFn', () => {
    expect(typeof queries.reportCardQueryOptions(MEMBER_ID).queryFn).toBe('function');
    expect(typeof queries.progressStatsQueryOptions(FULL_QUERY).queryFn).toBe('function');
    expect(typeof queries.activeByPlanQueryOptions().queryFn).toBe('function');
    expect(typeof queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male').queryFn).toBe(
      'function',
    );
  });
});

describe('E35-E38 the options read the right endpoints', () => {
  test('E35 the report card reads GET /api/members/<id>/report-card once, and hands back the answer', async () => {
    fetchSpy = progressServer({ ...newState(), gymName: 'Marker Gym Name' });
    const result = await appLikeClient().fetchQuery(
      queries.reportCardQueryOptions(MEMBER_ID) as never,
    );
    expect(getCalls(REPORT_CARD_PATH).length).toBe(1);
    expect(fetchSpy.calls.length).toBe(1);
    expect(JSON.stringify(result)).toContain('Marker Gym Name');
  });

  test('E36 the progress reads GET /api/reports/progress with the filters under the E36 names', async () => {
    fetchSpy = progressServer();
    const result = await appLikeClient().fetchQuery(
      queries.progressStatsQueryOptions(FULL_QUERY) as never,
    );
    const calls = getCalls(PROGRESS_PATH);
    expect(calls.length).toBe(1);
    const params = paramsOf(calls[0]?.url ?? '');
    expect(Object.fromEntries(params)).toEqual({
      metricId: METRIC_ID,
      joinedFrom: '2026-01',
      joinedTo: '2026-03',
      plan: 'half_annual',
      sex: 'female',
      ageBand: '20to29',
    });
    expect(JSON.stringify(result)).toContain('"avgChange":-2.1');
  });

  test('E36 a filter that is not set is not sent', async () => {
    fetchSpy = progressServer();
    await appLikeClient().fetchQuery(
      queries.progressStatsQueryOptions({ metricId: METRIC_ID, sex: 'male' }) as never,
    );
    const params = paramsOf(getCalls(PROGRESS_PATH)[0]?.url ?? '');
    expect([...params.keys()].sort()).toEqual(['metricId', 'sex']);
  });

  test('E36 with only the measurement, only metricId is sent', async () => {
    fetchSpy = progressServer();
    await appLikeClient().fetchQuery(
      queries.progressStatsQueryOptions({ metricId: METRIC_ID }) as never,
    );
    const params = paramsOf(getCalls(PROGRESS_PATH)[0]?.url ?? '');
    expect([...params.keys()]).toEqual(['metricId']);
  });

  test('E38 the active-by-plan read is GET /api/reports/active-by-plan', async () => {
    fetchSpy = progressServer();
    const result = await appLikeClient().fetchQuery(queries.activeByPlanQueryOptions() as never);
    expect(getCalls(ACTIVE_PATH).length).toBe(1);
    expect(fetchSpy.calls.length).toBe(1);
    expect(JSON.stringify(result)).toContain('"total":102');
  });

  for (const sex of ['male', 'female'] as const) {
    test(`E37 the ${sex} leaderboard reads GET /api/reports/leaderboard with metricId, sex and pages of 10`, async () => {
      fetchSpy = progressServer();
      await appLikeClient().fetchInfiniteQuery(
        queries.leaderboardInfiniteQueryOptions(METRIC_ID, sex) as never,
      );
      const calls = getCalls(LEADERBOARD_PATH);
      expect(calls.length).toBe(1);
      const params = paramsOf(calls[0]?.url ?? '');
      expect(params.get('metricId')).toBe(METRIC_ID);
      expect(params.get('sex')).toBe(sex);
      expect(params.get('pageSize')).toBe('10');
      expect(params.get('page') ?? '1').toBe('1');
    });
  }
});

describe('BR-REC-115 the leaderboard: "Show more" asks for the next page of 10', () => {
  test('BR-REC-115 the first read is only the top 10: one request, one page', async () => {
    fetchSpy = progressServer({ ...newState(), leaderboardTotal: 25 });
    const result = (await appLikeClient().fetchInfiniteQuery(
      queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male') as never,
    )) as unknown as InfiniteResult;
    expect(getCalls(LEADERBOARD_PATH).length).toBe(1);
    expect(result.pages.length).toBe(1);
    expect(JSON.stringify(result)).toContain('page1-row0');
    expect(JSON.stringify(result)).not.toContain('page2-row0');
  });

  test('BR-REC-115 "Show more" asks for page 2 with the same pageSize, and keeps the first page', async () => {
    fetchSpy = progressServer({ ...newState(), leaderboardTotal: 25 });
    const result = (await appLikeClient().fetchInfiniteQuery({
      ...queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male'),
      pages: 2,
    } as never)) as unknown as InfiniteResult;
    const calls = getCalls(LEADERBOARD_PATH);
    expect(calls.length).toBe(2);
    expect(paramsOf(calls[0]?.url ?? '').get('page') ?? '1').toBe('1');
    expect(paramsOf(calls[1]?.url ?? '').get('page')).toBe('2');
    expect(paramsOf(calls[1]?.url ?? '').get('pageSize')).toBe('10');
    expect(paramsOf(calls[1]?.url ?? '').get('metricId')).toBe(METRIC_ID);
    expect(paramsOf(calls[1]?.url ?? '').get('sex')).toBe('male');
    expect(result.pages.length).toBe(2);
    expect(JSON.stringify(result)).toContain('page1-row0');
    expect(JSON.stringify(result)).toContain('page2-row0');
  });

  test('BR-REC-115 the pages go on until the last one (25 members: pages 1, 2, 3, then no more)', async () => {
    fetchSpy = progressServer({ ...newState(), leaderboardTotal: 25 });
    const result = (await appLikeClient().fetchInfiniteQuery({
      ...queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'female'),
      pages: 6,
    } as never)) as unknown as InfiniteResult;
    const calls = getCalls(LEADERBOARD_PATH);
    expect(calls.map((call) => paramsOf(call.url).get('page') ?? '1')).toEqual(['1', '2', '3']);
    expect(result.pages.length).toBe(3);
    expect(JSON.stringify(result)).toContain('page3-row4');
    expect(JSON.stringify(result)).not.toContain('page3-row5');
  });

  test('BR-REC-115 ten members or fewer: there is no next page to ask for ("Show more" stays hidden)', async () => {
    fetchSpy = progressServer({ ...newState(), leaderboardTotal: 7 });
    const result = (await appLikeClient().fetchInfiniteQuery({
      ...queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male'),
      pages: 3,
    } as never)) as unknown as InfiniteResult;
    expect(getCalls(LEADERBOARD_PATH).length).toBe(1);
    expect(result.pages.length).toBe(1);
  });

  test('BR-REC-115 exactly ten members: there is no second page', async () => {
    fetchSpy = progressServer({ ...newState(), leaderboardTotal: 10 });
    await appLikeClient().fetchInfiniteQuery({
      ...queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male'),
      pages: 3,
    } as never);
    expect(getCalls(LEADERBOARD_PATH).length).toBe(1);
  });

  test('BR-REC-115 nobody on the board: one request and no next page', async () => {
    fetchSpy = progressServer({ ...newState(), leaderboardTotal: 0 });
    await appLikeClient().fetchInfiniteQuery({
      ...queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male'),
      pages: 3,
    } as never);
    expect(getCalls(LEADERBOARD_PATH).length).toBe(1);
  });

  test('BR-REC-115 the Male and the Female tab keep their own pages', async () => {
    fetchSpy = progressServer({ ...newState(), leaderboardTotal: 25 });
    const client = appLikeClient();
    await client.fetchInfiniteQuery({
      ...queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male'),
      pages: 2,
    } as never);
    await client.fetchInfiniteQuery(
      queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'female') as never,
    );
    const male = client.getQueryData(queries.progressKeys.leaderboard(METRIC_ID, 'male')) as
      | InfiniteResult
      | undefined;
    const female = client.getQueryData(queries.progressKeys.leaderboard(METRIC_ID, 'female')) as
      | InfiniteResult
      | undefined;
    expect(male?.pages.length).toBe(2);
    expect(female?.pages.length).toBe(1);
  });
});

describe('BR-REC-110 every open asks the server again', () => {
  test('BR-REC-110 the report card is read again on the next read although the app default is 30 s', async () => {
    fetchSpy = progressServer();
    const client = appLikeClient();
    await client.fetchQuery(queries.reportCardQueryOptions(MEMBER_ID) as never);
    await client.fetchQuery(queries.reportCardQueryOptions(MEMBER_ID) as never);
    expect(getCalls(REPORT_CARD_PATH).length).toBe(2);
  });

  test('BR-REC-110 the gym progress is read again on the next read although the app default is 30 s', async () => {
    fetchSpy = progressServer();
    const client = appLikeClient();
    await client.fetchQuery(queries.progressStatsQueryOptions(FULL_QUERY) as never);
    await client.fetchQuery(queries.progressStatsQueryOptions(FULL_QUERY) as never);
    expect(getCalls(PROGRESS_PATH).length).toBe(2);
  });

  test('BR-REC-110 active members by plan are read again on the next read although the app default is 30 s', async () => {
    fetchSpy = progressServer();
    const client = appLikeClient();
    await client.fetchQuery(queries.activeByPlanQueryOptions() as never);
    await client.fetchQuery(queries.activeByPlanQueryOptions() as never);
    expect(getCalls(ACTIVE_PATH).length).toBe(2);
  });

  test('BR-REC-110 the leaderboard is read again on the next read although the app default is 30 s', async () => {
    fetchSpy = progressServer();
    const client = appLikeClient();
    await client.fetchInfiniteQuery(
      queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male') as never,
    );
    await client.fetchInfiniteQuery(
      queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male') as never,
    );
    expect(getCalls(LEADERBOARD_PATH).length).toBe(2);
  });

  test('BR-REC-110 a save is seen at once: n was 12, the coach saves Surya, the next open shows 13', async () => {
    const state = newState();
    fetchSpy = progressServer(state);
    const client = appLikeClient();
    const before = await client.fetchQuery(queries.progressStatsQueryOptions(FULL_QUERY) as never);
    expect(JSON.stringify(before)).toContain('"n":12');

    state.n = 13; // Surya's body fat is saved on another device
    const after = await client.fetchQuery(queries.progressStatsQueryOptions(FULL_QUERY) as never);
    expect(JSON.stringify(after)).toContain('"n":13');
    expect(JSON.stringify(after)).not.toContain('"n":12');
  });

  test('BR-REC-110 a changed report card is shown on the next open (new gym name read, not the old copy)', async () => {
    const state = { ...newState(), gymName: 'Old gym name' };
    fetchSpy = progressServer(state);
    const client = appLikeClient();
    expect(
      JSON.stringify(await client.fetchQuery(queries.reportCardQueryOptions(MEMBER_ID) as never)),
    ).toContain('Old gym name');
    state.gymName = 'New gym name';
    expect(
      JSON.stringify(await client.fetchQuery(queries.reportCardQueryOptions(MEMBER_ID) as never)),
    ).toContain('New gym name');
  });
});

describe('BR-REC-110 one invalidate of progressKeys.all reaches every progress read', () => {
  test('BR-REC-110 invalidating progressKeys.all marks the report card, progress, leaderboards and plan counts as out of date', async () => {
    fetchSpy = progressServer();
    const client = appLikeClient();
    await client.fetchQuery(queries.reportCardQueryOptions(MEMBER_ID) as never);
    await client.fetchQuery(queries.progressStatsQueryOptions(FULL_QUERY) as never);
    await client.fetchQuery(queries.activeByPlanQueryOptions() as never);
    await client.fetchInfiniteQuery(
      queries.leaderboardInfiniteQueryOptions(METRIC_ID, 'male') as never,
    );

    const keys = [
      queries.progressKeys.reportCard(MEMBER_ID),
      queries.progressKeys.stats(FULL_QUERY),
      queries.progressKeys.activeByPlan(),
      queries.progressKeys.leaderboard(METRIC_ID, 'male'),
    ];
    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    }

    await client.invalidateQueries({ queryKey: queries.progressKeys.all });

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
