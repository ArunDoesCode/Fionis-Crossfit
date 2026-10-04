// Spec: docs/specs/member-records/due-list.md (v2) and .pipeline/member-records-due-list/contract.md
//   BR-REC-18 / 99 / 100 / C8 / C9  Assess soon is PUT {action:"flag"}, Remind me later is PUT
//              {action:"snooze", until}, either is removed with DELETE (E33, E34).
//   BR-REC-104 / C11 the lists are E31 (`status` overdue|upcoming, `typeId` only when an assessment is picked,
//              `page`, `pageSize`); the member page block is E32.
// Interface: contract "Admin app interfaces" -> `@/lib/api/due/fetchers`:
//   `fetchDueList({ status, typeId?, page, pageSize })` returns the `{ data, meta }` envelope of E31 (`typeId` sent
//   only when set); `fetchMemberDue(memberId)` (E32); `putDueAction(memberId, typeId, body)` sends PUT with the strict
//   body `{ action: 'flag' }` or `{ action: 'snooze', until }` and returns E33 `data`; `deleteDueAction(memberId,
//   typeId)` sends DELETE with no body and returns `{}`; writes carry no `Idempotency-Key` (contract "All four
//   endpoints"; BR-REC-156 covers E17 and E22 only). A non-2xx answer throws `ApiError` with the server's `code`.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';
import { errorResponse, jsonResponse, setAuthEnv } from '../auth/helpers';
import { dueRow, MEMBER_ANITA, MEMBER_SURYA, memberLine, TYPE_BODY, TYPE_FITNESS } from './helpers';
import { paramsOf, pathOf, recordingFetch } from './hookHarness';

interface FetchersModule {
  fetchDueList(query: {
    status: 'overdue' | 'upcoming';
    typeId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: unknown[]; meta: { total: number; page: number; pageSize: number } }>;
  fetchMemberDue(memberId: string): Promise<unknown>;
  putDueAction(
    memberId: string,
    typeId: string,
    body: { action: 'flag' } | { action: 'snooze'; until: string },
  ): Promise<unknown>;
  deleteDueAction(memberId: string, typeId: string): Promise<unknown>;
}

let fetchers: FetchersModule;
let restoreEnv: () => void;
let spy: ReturnType<typeof recordingFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  fetchers = (await import('@/lib/api/due/fetchers')) as unknown as FetchersModule;
});

afterEach(() => {
  spy?.restore();
  spy = undefined;
});

afterAll(() => {
  restoreEnv();
});

const meta = (total: number, page = 1, pageSize = 5) => ({
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});

const listBody = (names: string[], total = names.length) => ({
  success: true,
  data: names.map((fullName) => dueRow({ fullName })),
  meta: meta(total),
});

const only = () => {
  expect(spy?.calls.length).toBe(1);
  return spy?.calls[0] as NonNullable<typeof spy>['calls'][number];
};

describe('E31 fetchDueList', () => {
  test('BR-REC-101 GET /api/due with status, page and pageSize, and no typeId when none is picked', async () => {
    spy = recordingFetch(() => jsonResponse(200, listBody(['Surya Pratap'])));
    await fetchers.fetchDueList({ status: 'overdue', page: 1, pageSize: 5 });
    const call = only();
    expect(call.method).toBe('GET');
    expect(pathOf(call.url)).toBe('/api/due');
    const params = paramsOf(call.url);
    expect(params.get('status')).toBe('overdue');
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('5');
    expect(params.has('typeId')).toBe(false);
  });

  test('BR-REC-104 an assessment filter is sent as typeId', async () => {
    spy = recordingFetch(() => jsonResponse(200, listBody(['Anita Rao'])));
    await fetchers.fetchDueList({ status: 'overdue', typeId: TYPE_FITNESS, page: 1, pageSize: 25 });
    const params = paramsOf(only().url);
    expect(params.get('typeId')).toBe(TYPE_FITNESS);
    expect(params.get('pageSize')).toBe('25');
  });

  test('"Due soon" is asked as status=upcoming', async () => {
    spy = recordingFetch(() => jsonResponse(200, listBody([])));
    await fetchers.fetchDueList({ status: 'upcoming', page: 1, pageSize: 5 });
    expect(paramsOf(only().url).get('status')).toBe('upcoming');
  });

  test('BR-REC-104 "Show more" asks the next page: page=2', async () => {
    spy = recordingFetch(() => jsonResponse(200, listBody(['Ravi K'])));
    await fetchers.fetchDueList({ status: 'overdue', page: 2, pageSize: 25 });
    const params = paramsOf(only().url);
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('25');
  });

  test('it returns the { data, meta } envelope: the rows and meta.total (the section count)', async () => {
    spy = recordingFetch(() => jsonResponse(200, listBody(['Surya Pratap', 'Anita Rao'], 37)));
    const result = await fetchers.fetchDueList({ status: 'overdue', page: 1, pageSize: 5 });
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.map((row) => (row as { fullName: string }).fullName)).toEqual([
      'Surya Pratap',
      'Anita Rao',
    ]);
    expect(result.meta.total).toBe(37);
  });

  test('a failing answer throws ApiError with the server code', async () => {
    spy = recordingFetch(() => errorResponse(400, 'VALIDATION_ERROR'));
    const failure = await fetchers
      .fetchDueList({ status: 'overdue', page: 0, pageSize: 5 })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('VALIDATION_ERROR');
  });
});

describe('E32 fetchMemberDue', () => {
  test('BR-REC-103 GET /api/members/<memberId>/due', async () => {
    spy = recordingFetch(() => jsonResponse(200, { success: true, data: [memberLine()] }));
    await fetchers.fetchMemberDue(MEMBER_ANITA);
    const call = only();
    expect(call.method).toBe('GET');
    expect(pathOf(call.url)).toBe(`/api/members/${MEMBER_ANITA}/due`);
  });

  test('BR-REC-103 it returns the member lines', async () => {
    spy = recordingFetch(() =>
      jsonResponse(200, { success: true, data: [memberLine({ typeName: 'Line marker' })] }),
    );
    const result = await fetchers.fetchMemberDue(MEMBER_SURYA);
    expect(JSON.stringify(result)).toContain('Line marker');
  });

  test('an unknown member throws ApiError NOT_FOUND', async () => {
    spy = recordingFetch(() => errorResponse(404, 'NOT_FOUND'));
    const failure = await fetchers.fetchMemberDue(MEMBER_ANITA).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('NOT_FOUND');
  });
});

describe('E33 putDueAction', () => {
  const E33_FLAG = { success: true, data: { kind: 'flag', setOn: '2026-10-03', untilOn: null } };
  const E33_SNOOZE = {
    success: true,
    data: { kind: 'snooze', setOn: '2026-10-03', untilOn: '2026-11-03' },
  };

  test('BR-REC-18 Assess soon: PUT /api/members/<memberId>/due-actions/<typeId>', async () => {
    spy = recordingFetch(() => jsonResponse(200, E33_FLAG));
    await fetchers.putDueAction(MEMBER_ANITA, TYPE_FITNESS, { action: 'flag' });
    const call = only();
    expect(call.method).toBe('PUT');
    expect(pathOf(call.url)).toBe(`/api/members/${MEMBER_ANITA}/due-actions/${TYPE_FITNESS}`);
  });

  test('BR-REC-18 Assess soon sends exactly {"action":"flag"} (the API refuses any other key)', async () => {
    spy = recordingFetch(() => jsonResponse(200, E33_FLAG));
    await fetchers.putDueAction(MEMBER_ANITA, TYPE_FITNESS, { action: 'flag' });
    expect(JSON.parse(only().body ?? 'null')).toEqual({ action: 'flag' });
  });

  test('BR-REC-99 Remind me later sends {"action":"snooze","until":"2026-11-03"}', async () => {
    spy = recordingFetch(() => jsonResponse(200, E33_SNOOZE));
    await fetchers.putDueAction(MEMBER_SURYA, TYPE_BODY, { action: 'snooze', until: '2026-11-03' });
    const call = only();
    expect(call.method).toBe('PUT');
    expect(pathOf(call.url)).toBe(`/api/members/${MEMBER_SURYA}/due-actions/${TYPE_BODY}`);
    expect(JSON.parse(call.body ?? 'null')).toEqual({ action: 'snooze', until: '2026-11-03' });
  });

  test('the body is sent as JSON', async () => {
    spy = recordingFetch(() => jsonResponse(200, E33_FLAG));
    await fetchers.putDueAction(MEMBER_ANITA, TYPE_FITNESS, { action: 'flag' });
    expect(only().headers.get('Content-Type')).toContain('application/json');
  });

  test('contract: a write carries no Idempotency-Key', async () => {
    spy = recordingFetch(() => jsonResponse(200, E33_FLAG));
    await fetchers.putDueAction(MEMBER_ANITA, TYPE_FITNESS, { action: 'flag' });
    expect(only().headers.has('Idempotency-Key')).toBe(false);
  });

  test('it returns the E33 data: { kind, setOn, untilOn }', async () => {
    spy = recordingFetch(() => jsonResponse(200, E33_SNOOZE));
    const result = await fetchers.putDueAction(MEMBER_SURYA, TYPE_BODY, {
      action: 'snooze',
      until: '2026-11-03',
    });
    expect(result).toEqual({ kind: 'snooze', setOn: '2026-10-03', untilOn: '2026-11-03' });
  });

  for (const [status, code] of [
    [400, 'SNOOZE_TOO_FAR'],
    [400, 'VALIDATION_ERROR'],
    [404, 'NOT_FOUND'],
    [403, 'CSRF_ORIGIN'],
    [500, 'INTERNAL_ERROR'],
  ] as const) {
    test(`a ${status} ${code} answer throws ApiError with that code (so the screen can pick the plain sentence)`, async () => {
      spy = recordingFetch(() => errorResponse(status, code));
      const failure = await fetchers
        .putDueAction(MEMBER_SURYA, TYPE_BODY, { action: 'snooze', until: '2027-01-02' })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).status).toBe(status);
      expect((failure as ApiError).code).toBe(code);
    });
  }
});

describe('E34 deleteDueAction', () => {
  test('BR-REC-100 DELETE /api/members/<memberId>/due-actions/<typeId>', async () => {
    spy = recordingFetch(() => jsonResponse(200, { success: true, data: {} }));
    await fetchers.deleteDueAction(MEMBER_ANITA, TYPE_FITNESS);
    const call = only();
    expect(call.method).toBe('DELETE');
    expect(pathOf(call.url)).toBe(`/api/members/${MEMBER_ANITA}/due-actions/${TYPE_FITNESS}`);
  });

  test('it sends no body', async () => {
    spy = recordingFetch(() => jsonResponse(200, { success: true, data: {} }));
    await fetchers.deleteDueAction(MEMBER_ANITA, TYPE_FITNESS);
    expect(only().body === undefined || only().body === '').toBe(true);
  });

  test('contract: a write carries no Idempotency-Key', async () => {
    spy = recordingFetch(() => jsonResponse(200, { success: true, data: {} }));
    await fetchers.deleteDueAction(MEMBER_ANITA, TYPE_FITNESS);
    expect(only().headers.has('Idempotency-Key')).toBe(false);
  });

  test('it returns {} (E34 answers 200 {} also when nothing was set)', async () => {
    spy = recordingFetch(() => jsonResponse(200, { success: true, data: {} }));
    expect(await fetchers.deleteDueAction(MEMBER_ANITA, TYPE_FITNESS)).toEqual({});
  });

  test('an unknown member or assessment throws ApiError NOT_FOUND', async () => {
    spy = recordingFetch(() => errorResponse(404, 'NOT_FOUND'));
    const failure = await fetchers
      .deleteDueAction(MEMBER_ANITA, TYPE_FITNESS)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('NOT_FOUND');
  });
});
