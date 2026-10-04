// Spec: docs/specs/member-records/due-list.md (v2)
//   BR-REC-18 / 98 / 99 / 100 "Assess soon" and "Remind me later" replace each other; either can be removed.
//   BR-REC-97  an Assess soon row goes to the top (C5 order) and is only ever in Overdue.
//   C13 / perf tactic 8  Assess soon, Remind me later and remove change the lists at once, and are undone with a toast
//              if the call fails; success toasts: "Marked Assess soon." / "Reminder set for 3 Nov." / "Removed.".
//   BR-REC-128 a failed call shows one plain sentence for the server code (`messageForCode`).
// Interface: contract "Admin app interfaces" -> `@/lib/api/due/queries` (write hooks):
//   `useSetDueAction().mutate({ memberId, typeId, action: 'flag' } | { memberId, typeId, action: 'snooze', until })`
//   calls `putDueAction`; `useClearDueAction().mutate({ memberId, typeId })` calls `deleteDueAction`.
//   Cached E31 data keeps the envelope `{ data: DueListItem[], meta }` (the infinite query holds `pages` of it);
//   cached E32 data is the plain `MemberDueItem[]`.
//   On mutate: cancel due queries, apply the change to every cached E31 list for both tabs (and every page of an
//   infinite one) and to that member's cached E32 list, `meta` untouched. On error: restore every touched cache
//   entry and show the text of `messageForCode(code)`. On success: toast from `DUE_TEXT`. On settle: invalidate
//   `dueKeys.all`.
// How: a hook is called in a server render (hookHarness.ts); the cache is seeded with `setQueryData`; the write
//   request is held back so the cache can be read while the call is in flight; toasts are read from sonner's own
//   history (`toast.getHistory()`), so nothing is mocked.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { messageForCode } from '@/lib/messages/errors';
import { errorResponse, jsonResponse, setAuthEnv } from '../auth/helpers';
import {
  clone,
  type DueListItem,
  dueRow,
  item,
  MEMBER_ANITA,
  MEMBER_RAVI,
  MEMBER_SURYA,
  MEMBER_ZED,
  type MemberDueItem,
  memberLine,
  TYPE_BODY,
  TYPE_FITNESS,
} from './helpers';
import {
  appLikeClient,
  callHook,
  type Deferred,
  deferred,
  flush,
  paramsOf,
  pathOf,
  type RecordedRequest,
  recordingFetch,
  waitFor,
} from './hookHarness';

type SetChange =
  | { memberId: string; typeId: string; action: 'flag' }
  | { memberId: string; typeId: string; action: 'snooze'; until: string };

interface DueKeys {
  all: readonly unknown[];
  list(status: 'overdue' | 'upcoming', typeId: string | null, pageSize: number): readonly unknown[];
  infinite(status: 'overdue' | 'upcoming', typeId: string | null): readonly unknown[];
  member(memberId: string): readonly unknown[];
}

interface QueriesModule {
  dueKeys: DueKeys;
  dueListQueryOptions(
    status: 'overdue' | 'upcoming',
    typeId: string | null,
    pageSize: number,
  ): Parameters<QueryClient['fetchQuery']>[0];
  useSetDueAction(): { mutate(change: SetChange): void };
  useClearDueAction(): { mutate(change: { memberId: string; typeId: string }): void };
}

let queries: QueriesModule;
let restoreEnv: () => void;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  queries = (await import('@/lib/api/due/queries')) as unknown as QueriesModule;
});

afterAll(() => {
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------
// Fixtures. Today is 2026-10-03 (the spec's worked-example day).
const SURYA_BODY = dueRow({
  memberId: MEMBER_SURYA,
  fullName: 'Surya Pratap',
  typeId: TYPE_BODY,
  dueOn: '2026-08-30',
});
const ANITA_FITNESS = dueRow({
  memberId: MEMBER_ANITA,
  fullName: 'Anita Rao',
  typeId: TYPE_FITNESS,
  typeName: 'Fitness test',
  dueOn: '2026-09-15',
  items: [item(3, 'Push-ups'), item(4, 'Pull-ups')],
});
const RAVI_BODY = dueRow({
  memberId: MEMBER_RAVI,
  fullName: 'Ravi K',
  typeId: TYPE_BODY,
  dueOn: '2026-09-28',
});
const ZED_BODY_SOON = dueRow({
  memberId: MEMBER_ZED,
  fullName: 'Zed',
  typeId: TYPE_BODY,
  dueOn: '2026-10-06',
});
const ANITA_BODY_SOON = dueRow({
  memberId: MEMBER_ANITA,
  fullName: 'Anita Rao',
  typeId: TYPE_BODY,
  dueOn: '2026-10-08',
});

const meta = (total: number, page = 1) => ({
  page,
  pageSize: 5,
  total,
  totalPages: Math.ceil(total / 5),
});

interface SeedOptions {
  /** Anita's Fitness test is already "Assess soon" (a flagged row at the top of Overdue). */
  anitaFlagged?: boolean;
  /** Anita's Fitness test has a reminder (shown on her member page line only: the row is hidden in the lists). */
  anitaSnoozedUntil?: string | null;
}

type Page = { data: DueListItem[]; meta: ReturnType<typeof meta> };

function seed(client: QueryClient, options: SeedOptions = {}) {
  const k = queries.dueKeys;
  const anita = { ...clone(ANITA_FITNESS), flagged: options.anitaFlagged === true };
  const surya = clone(SURYA_BODY);
  const ravi = clone(RAVI_BODY);
  const entries = {
    over5: {
      key: k.list('overdue', null, 5),
      value: {
        data: options.anitaFlagged ? [anita, surya, ravi] : [surya, anita, ravi],
        meta: meta(12),
      } as Page,
    },
    overBody25: {
      key: k.list('overdue', TYPE_BODY, 25),
      value: { data: [clone(SURYA_BODY), clone(RAVI_BODY)], meta: meta(2) } as Page,
    },
    soon5: {
      key: k.list('upcoming', null, 5),
      value: {
        data: [clone(ZED_BODY_SOON), clone(ANITA_BODY_SOON)],
        meta: meta(4),
      } as Page,
    },
    infinite: {
      key: k.infinite('overdue', null),
      value: {
        pages: [
          {
            data: options.anitaFlagged
              ? [{ ...clone(ANITA_FITNESS), flagged: true }, clone(SURYA_BODY)]
              : [clone(SURYA_BODY), clone(ANITA_FITNESS)],
            meta: meta(12, 1),
          },
          { data: [clone(RAVI_BODY)], meta: meta(12, 2) },
        ],
        pageParams: [1, 2],
      },
    },
    anitaLines: {
      key: k.member(MEMBER_ANITA),
      value: [
        memberLine({
          typeId: TYPE_BODY,
          state: 'upcoming',
          nextDueOn: '2026-10-08',
          items: [item(1, 'Weight')],
        }),
        memberLine({
          typeId: TYPE_FITNESS,
          typeName: 'Fitness test',
          state: 'overdue',
          nextDueOn: '2026-09-15',
          flagged: options.anitaFlagged === true,
          snoozedUntil: options.anitaSnoozedUntil ?? null,
          items: [item(3, 'Push-ups')],
        }),
      ] as MemberDueItem[],
    },
    suryaLines: {
      key: k.member(MEMBER_SURYA),
      value: [
        memberLine({
          typeId: TYPE_BODY,
          state: 'overdue',
          nextDueOn: '2026-08-30',
          items: [item(1, 'Weight')],
        }),
        memberLine({
          typeId: TYPE_FITNESS,
          typeName: 'Fitness test',
          state: 'ok',
          nextDueOn: '2026-12-12',
        }),
      ] as MemberDueItem[],
    },
  };
  const originals = {} as Record<keyof typeof entries, unknown>;
  for (const name of Object.keys(entries) as Array<keyof typeof entries>) {
    client.setQueryData(entries[name].key, clone(entries[name].value));
    originals[name] = clone(entries[name].value);
  }
  return { entries, originals };
}

type Seeded = ReturnType<typeof seed>;
type EntryName = keyof Seeded['entries'];

const E33_FLAG = { success: true, data: { kind: 'flag', setOn: '2026-10-03', untilOn: null } };
const E33_SNOOZE = {
  success: true,
  data: { kind: 'snooze', setOn: '2026-10-03', untilOn: '2026-11-03' },
};
const E34 = { success: true, data: {} };

interface Scenario extends Seeded {
  client: QueryClient;
  writeGate: Deferred<Response>;
  readGate: Deferred<Response>;
  writes(): RecordedRequest[];
  reads(): RecordedRequest[];
  data(name: EntryName): unknown;
  rows(name: 'over5' | 'overBody25' | 'soon5'): DueListItem[];
  pages(): Page[];
  lines(name: 'anitaLines' | 'suryaLines'): MemberDueItem[];
  isInvalidated(name: EntryName): boolean | undefined;
  settled(): Promise<void>;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A seeded cache, a held-back write and a held-back read. */
function scenario(options: SeedOptions = {}): Scenario {
  const client = appLikeClient();
  const seeded = seed(client, options);
  const writeGate = deferred<Response>();
  const readGate = deferred<Response>();
  const spy = recordingFetch((call) =>
    call.method === 'GET' ? readGate.promise : writeGate.promise,
  );
  cleanups.push(spy.restore);
  const data = (name: EntryName) => client.getQueryData(seeded.entries[name].key);
  return {
    ...seeded,
    client,
    writeGate,
    readGate,
    writes: () => spy.calls.filter((call) => call.method !== 'GET'),
    reads: () => spy.calls.filter((call) => call.method === 'GET'),
    data,
    rows: (name) => (data(name) as Page).data,
    pages: () => (data('infinite') as { pages: Page[] }).pages,
    lines: (name) => data(name) as MemberDueItem[],
    isInvalidated: (name) => client.getQueryState(seeded.entries[name].key)?.isInvalidated,
    async settled() {
      await waitFor(() => {
        const all = client.getMutationCache().getAll();
        return all.length > 0 && all.every((m) => m.state.status !== 'pending');
      });
      await flush();
    },
  };
}

const ENTRY_NAMES: EntryName[] = [
  'over5',
  'overBody25',
  'soon5',
  'infinite',
  'anitaLines',
  'suryaLines',
];

const keysOf = (rows: DueListItem[]) => rows.map((row) => `${row.memberId}/${row.typeId}`);
const keyOf = (row: DueListItem) => `${row.memberId}/${row.typeId}`;
const allRows = (s: Scenario) => s.pages().flatMap((page) => page.data);

/** The texts of the toasts shown since `from` (sonner's history; dismissals have no text). */
const toastsSince = (from: number) =>
  (toast.getHistory().slice(from) as Array<{ title?: unknown }>)
    .map((entry) => (entry.title === undefined ? '' : String(entry.title)))
    .filter((text) => text !== '');

const startSet = (s: Scenario, change: SetChange) => {
  callHook(s.client, () => queries.useSetDueAction()).mutate(change);
};
const startClear = (s: Scenario, change: { memberId: string; typeId: string }) => {
  callHook(s.client, () => queries.useClearDueAction()).mutate(change);
};

const flag = (memberId: string, typeId: string): SetChange => ({
  memberId,
  typeId,
  action: 'flag',
});
const snooze = (memberId: string, typeId: string, until = '2026-11-03'): SetChange => ({
  memberId,
  typeId,
  action: 'snooze',
  until,
});

// ---------------------------------------------------------------------------------------------------------------
describe('BR-REC-18 useSetDueAction: Assess soon', () => {
  test('the request is PUT /api/members/<memberId>/due-actions/<typeId> with {"action":"flag"}', async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);
    const call = s.writes()[0] as RecordedRequest;
    expect(call.method).toBe('PUT');
    expect(pathOf(call.url)).toBe(`/api/members/${MEMBER_RAVI}/due-actions/${TYPE_BODY}`);
    expect(JSON.parse(call.body ?? 'null')).toEqual({ action: 'flag' });
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test('BR-REC-97 at once, before the server answers: the row is "Assess soon" and first in every Overdue list', async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);

    const over5 = s.rows('over5');
    expect(keysOf(over5)).toEqual([keyOf(RAVI_BODY), keyOf(SURYA_BODY), keyOf(ANITA_FITNESS)]);
    expect(over5.map((row) => row.flagged)).toEqual([true, false, false]);

    const filtered = s.rows('overBody25');
    expect(keysOf(filtered)).toEqual([keyOf(RAVI_BODY), keyOf(SURYA_BODY)]);
    expect(filtered.map((row) => row.flagged)).toEqual([true, false]);

    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test("every page of the S3 list is updated: only Ravi's row is flagged, nothing is lost or doubled", async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);
    const rows = allRows(s);
    expect(keysOf(rows).sort()).toEqual(
      [keyOf(SURYA_BODY), keyOf(ANITA_FITNESS), keyOf(RAVI_BODY)].sort(),
    );
    expect(rows.filter((row) => row.flagged).map(keyOf)).toEqual([keyOf(RAVI_BODY)]);
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test('C13 the counts do not change (meta is untouched) while the call is in flight', async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);
    expect(s.data('over5')).toMatchObject({ meta: (s.originals.over5 as Page).meta });
    expect((s.data('over5') as Page).meta).toEqual((s.originals.over5 as Page).meta);
    expect((s.data('overBody25') as Page).meta).toEqual((s.originals.overBody25 as Page).meta);
    expect(s.pages().map((page) => page.meta)).toEqual(
      (s.originals.infinite as { pages: Page[] }).pages.map((page) => page.meta),
    );
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test('BR-REC-18 a pair that is only in Due soon leaves Due soon (an Assess soon row is only in Overdue)', async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_ZED, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);
    expect(keysOf(s.rows('soon5'))).toEqual([keyOf(ANITA_BODY_SOON)]);
    expect((s.data('soon5') as Page).meta).toEqual((s.originals.soon5 as Page).meta);
    // The Overdue lists do not have Zed: they stay as they were.
    expect(s.data('over5')).toEqual(s.originals.over5);
    expect(s.data('overBody25')).toEqual(s.originals.overBody25);
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test('BR-REC-103 the member page line becomes "Assess soon"; the other line of that member is unchanged', async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    const [body, fitness] = s.lines('anitaLines') as [MemberDueItem, MemberDueItem];
    expect(fitness.flagged).toBe(true);
    expect(fitness.snoozedUntil).toBeNull();
    expect(body).toEqual((s.originals.anitaLines as MemberDueItem[])[0] as MemberDueItem);
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test('BR-REC-100 Assess soon replaces a reminder at once: the reminder is gone from the member page line', async () => {
    const s = scenario({ anitaSnoozedUntil: '2026-10-20' });
    startSet(s, flag(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    const fitness = s.lines('anitaLines')[1] as MemberDueItem;
    expect(fitness.flagged).toBe(true);
    expect(fitness.snoozedUntil).toBeNull();
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test("C13 another member's cached lines are not touched", async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    expect(s.data('suryaLines')).toEqual(s.originals.suryaLines);
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });

  test('C13 success: the toast says "Marked Assess soon."', async () => {
    const s = scenario();
    const before = toast.getHistory().length;
    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
    expect(toastsSince(before)).toContain('Marked Assess soon.');
  });

  test('C13 on settle every due query is invalidated, not before (the answer must not overwrite the change early)', async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);
    for (const name of ENTRY_NAMES) expect(s.isInvalidated(name)).toBe(false);
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
    for (const name of ENTRY_NAMES) expect(s.isInvalidated(name)).toBe(true);
  });

  test('C13 success keeps the change (nothing is rolled back) until the lists are loaded again', async () => {
    const s = scenario();
    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);
    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
    expect(s.rows('over5')[0]?.flagged).toBe(true);
    expect(keyOf(s.rows('over5')[0] as DueListItem)).toBe(keyOf(RAVI_BODY));
  });
});

describe('BR-REC-99 / 100 useSetDueAction: Remind me later', () => {
  test('the request is PUT .../due-actions/<typeId> with {"action":"snooze","until":"<date>"}', async () => {
    const s = scenario();
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS, '2026-11-03'));
    await waitFor(() => s.writes().length === 1);
    const call = s.writes()[0] as RecordedRequest;
    expect(call.method).toBe('PUT');
    expect(pathOf(call.url)).toBe(`/api/members/${MEMBER_ANITA}/due-actions/${TYPE_FITNESS}`);
    expect(JSON.parse(call.body ?? 'null')).toEqual({ action: 'snooze', until: '2026-11-03' });
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
  });

  test('BR-REC-99 at once: the row is hidden from every Overdue list, the others keep their order', async () => {
    const s = scenario();
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    expect(keysOf(s.rows('over5'))).toEqual([keyOf(SURYA_BODY), keyOf(RAVI_BODY)]);
    expect(keysOf(allRows(s)).sort()).toEqual([keyOf(SURYA_BODY), keyOf(RAVI_BODY)].sort());
    // Anita's Fitness test is not in the Body-composition-only list: unchanged.
    expect(s.data('overBody25')).toEqual(s.originals.overBody25);
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
  });

  test('BR-REC-99 the row is hidden from Due soon too', async () => {
    const s = scenario();
    startSet(s, snooze(MEMBER_ZED, TYPE_BODY, '2026-10-20'));
    await waitFor(() => s.writes().length === 1);
    expect(keysOf(s.rows('soon5'))).toEqual([keyOf(ANITA_BODY_SOON)]);
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
  });

  test('C13 the counts do not change (meta is untouched) while the call is in flight', async () => {
    const s = scenario();
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    expect((s.data('over5') as Page).meta).toEqual((s.originals.over5 as Page).meta);
    expect(s.pages().map((page) => page.meta)).toEqual(
      (s.originals.infinite as { pages: Page[] }).pages.map((page) => page.meta),
    );
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
  });

  test('BR-REC-103 the member page line gets the reminder date and is not "Assess soon"', async () => {
    const s = scenario({ anitaFlagged: true });
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS, '2026-11-03'));
    await waitFor(() => s.writes().length === 1);
    const fitness = s.lines('anitaLines')[1] as MemberDueItem;
    expect(fitness.snoozedUntil).toBe('2026-11-03');
    expect(fitness.flagged).toBe(false);
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
  });

  test('BR-REC-100 a reminder replaces Assess soon at once: the flagged row leaves Overdue', async () => {
    const s = scenario({ anitaFlagged: true });
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    expect(keysOf(s.rows('over5'))).toEqual([keyOf(SURYA_BODY), keyOf(RAVI_BODY)]);
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
  });

  test("C13 another member's cached lines are not touched", async () => {
    const s = scenario();
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    expect(s.data('suryaLines')).toEqual(s.originals.suryaLines);
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
  });

  test('C13 success: the toast says "Reminder set for <date>." (the day, e.g. 3 Nov)', async () => {
    const s = scenario();
    const before = toast.getHistory().length;
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS, '2026-11-03'));
    await waitFor(() => s.writes().length === 1);
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
    // The year is shown only when it is not this year (BR-REC-127), so both "3 Nov" and "3 Nov 2026" are right.
    expect(
      toastsSince(before).some((text) => /^Reminder set for 3 Nov( \d{4})?\.$/.test(text)),
    ).toBe(true);
  });

  test('C13 on settle every due query is invalidated, not before', async () => {
    const s = scenario();
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS));
    await waitFor(() => s.writes().length === 1);
    for (const name of ENTRY_NAMES) expect(s.isInvalidated(name)).toBe(false);
    s.writeGate.resolve(jsonResponse(200, E33_SNOOZE));
    await s.settled();
    for (const name of ENTRY_NAMES) expect(s.isInvalidated(name)).toBe(true);
  });
});

describe('BR-REC-100 useClearDueAction: remove Assess soon or the reminder', () => {
  test('the request is DELETE /api/members/<memberId>/due-actions/<typeId> with no body', async () => {
    const s = scenario({ anitaFlagged: true });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    const call = s.writes()[0] as RecordedRequest;
    expect(call.method).toBe('DELETE');
    expect(pathOf(call.url)).toBe(`/api/members/${MEMBER_ANITA}/due-actions/${TYPE_FITNESS}`);
    expect(call.body === undefined || call.body === '').toBe(true);
    expect(call.headers.has('Idempotency-Key')).toBe(false);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
  });

  test('BR-REC-97 at once: the row loses "Assess soon" and takes its place by date; it stays in the list', async () => {
    const s = scenario({ anitaFlagged: true });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    expect(keysOf(s.rows('over5'))).toEqual([
      keyOf(SURYA_BODY),
      keyOf(ANITA_FITNESS),
      keyOf(RAVI_BODY),
    ]);
    expect(s.rows('over5').every((row) => row.flagged === false)).toBe(true);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
  });

  test('every page of the S3 list is updated: no row is flagged any more, nothing is lost', async () => {
    const s = scenario({ anitaFlagged: true });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    const rows = allRows(s);
    expect(rows.length).toBe(3);
    expect(rows.some((row) => row.flagged)).toBe(false);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
  });

  test('C13 the counts do not change (meta is untouched) while the call is in flight', async () => {
    const s = scenario({ anitaFlagged: true });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    expect((s.data('over5') as Page).meta).toEqual((s.originals.over5 as Page).meta);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
  });

  test('BR-REC-103 the member page line loses Assess soon', async () => {
    const s = scenario({ anitaFlagged: true });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    const fitness = s.lines('anitaLines')[1] as MemberDueItem;
    expect(fitness.flagged).toBe(false);
    expect(fitness.snoozedUntil).toBeNull();
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
  });

  test('BR-REC-103 the member page line loses its reminder (the other line is unchanged)', async () => {
    const s = scenario({ anitaSnoozedUntil: '2026-10-20' });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    const [body, fitness] = s.lines('anitaLines') as [MemberDueItem, MemberDueItem];
    expect(fitness.snoozedUntil).toBeNull();
    expect(fitness.flagged).toBe(false);
    expect(body).toEqual((s.originals.anitaLines as MemberDueItem[])[0] as MemberDueItem);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
  });

  test("C13 another member's cached lines are not touched", async () => {
    const s = scenario({ anitaFlagged: true });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    expect(s.data('suryaLines')).toEqual(s.originals.suryaLines);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
  });

  test('C13 success: the toast says "Removed."', async () => {
    const s = scenario({ anitaFlagged: true });
    const before = toast.getHistory().length;
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
    expect(toastsSince(before)).toContain('Removed.');
  });

  test('C13 on settle every due query is invalidated, not before', async () => {
    const s = scenario({ anitaFlagged: true });
    startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS });
    await waitFor(() => s.writes().length === 1);
    for (const name of ENTRY_NAMES) expect(s.isInvalidated(name)).toBe(false);
    s.writeGate.resolve(jsonResponse(200, E34));
    await s.settled();
    for (const name of ENTRY_NAMES) expect(s.isInvalidated(name)).toBe(true);
  });
});

describe('C13 a failed call is undone: every touched cache entry is restored and the toast says why', () => {
  interface Case {
    label: string;
    options: SeedOptions;
    run(s: Scenario): void;
    status: number;
    code: string;
    /** Something the change is expected to alter while the call is in flight (so a restore is not vacuous). */
    changedWhileInFlight: EntryName[];
  }

  const cases: Case[] = [
    {
      label: 'Assess soon, server error 500',
      options: {},
      run: (s) => startSet(s, flag(MEMBER_RAVI, TYPE_BODY)),
      status: 500,
      code: 'INTERNAL_ERROR',
      changedWhileInFlight: ['over5', 'overBody25', 'infinite'],
    },
    {
      label: 'Remind me later, 400 SNOOZE_TOO_FAR',
      options: {},
      run: (s) => startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS, '2027-01-02')),
      status: 400,
      code: 'SNOOZE_TOO_FAR',
      changedWhileInFlight: ['over5', 'infinite', 'anitaLines'],
    },
    {
      label: 'Remind me later, 404 NOT_FOUND (the member was removed meanwhile)',
      options: {},
      run: (s) => startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS, '2026-11-03')),
      status: 404,
      code: 'NOT_FOUND',
      changedWhileInFlight: ['over5', 'infinite', 'anitaLines'],
    },
    {
      label: 'Assess soon on a Due soon row, 400 VALIDATION_ERROR',
      options: {},
      run: (s) => startSet(s, flag(MEMBER_ZED, TYPE_BODY)),
      status: 400,
      code: 'VALIDATION_ERROR',
      changedWhileInFlight: ['soon5'],
    },
    {
      label: 'remove Assess soon, 404 NOT_FOUND',
      options: { anitaFlagged: true },
      run: (s) => startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS }),
      status: 404,
      code: 'NOT_FOUND',
      changedWhileInFlight: ['over5', 'infinite', 'anitaLines'],
    },
    {
      label: 'remove a reminder, server error 500',
      options: { anitaSnoozedUntil: '2026-10-20' },
      run: (s) => startClear(s, { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS }),
      status: 500,
      code: 'INTERNAL_ERROR',
      changedWhileInFlight: ['anitaLines'],
    },
  ];

  for (const c of cases) {
    test(`${c.label}: restored, toast = messageForCode("${c.code}"), invalidated on settle`, async () => {
      const s = scenario(c.options);
      const before = toast.getHistory().length;
      c.run(s);
      await waitFor(() => s.writes().length === 1);

      // In flight: the change is visible.
      for (const name of c.changedWhileInFlight) {
        expect(s.data(name)).not.toEqual(s.originals[name]);
      }

      s.writeGate.resolve(errorResponse(c.status, c.code));
      await s.settled();

      // Every entry is exactly as it was before the click.
      for (const name of ENTRY_NAMES) {
        expect(s.data(name)).toEqual(s.originals[name]);
      }
      const shown = toastsSince(before);
      expect(shown).toContain(messageForCode(c.code));
      expect(shown).not.toContain('Marked Assess soon.');
      expect(shown).not.toContain('Removed.');
      expect(shown.some((text) => text.startsWith('Reminder set for'))).toBe(false);
      // After a failure the lists are loaded again as well.
      for (const name of ENTRY_NAMES) expect(s.isInvalidated(name)).toBe(true);
    });
  }

  test('BR-REC-128 the toast is the plain sentence of the code, never the code itself', async () => {
    const s = scenario();
    const before = toast.getHistory().length;
    startSet(s, snooze(MEMBER_ANITA, TYPE_FITNESS, '2027-01-02'));
    await waitFor(() => s.writes().length === 1);
    s.writeGate.resolve(errorResponse(400, 'SNOOZE_TOO_FAR'));
    await s.settled();
    const shown = toastsSince(before);
    expect(shown.some((text) => text.includes('SNOOZE_TOO_FAR'))).toBe(false);
    expect(shown).toContain(messageForCode('SNOOZE_TOO_FAR'));
  });
});

describe('C13 due queries are cancelled when a change starts', () => {
  test('a list read that was already running does not overwrite the change when its old answer arrives', async () => {
    const s = scenario();
    const read = s.client
      .fetchQuery(queries.dueListQueryOptions('overdue', null, 5))
      .catch(() => 'cancelled');
    await waitFor(() => s.reads().length === 1);
    expect(paramsOf((s.reads()[0] as RecordedRequest).url).get('status')).toBe('overdue');

    startSet(s, flag(MEMBER_RAVI, TYPE_BODY));
    await waitFor(() => s.writes().length === 1);

    // The read was sent before the change and now answers with the old list.
    s.readGate.resolve(
      jsonResponse(200, {
        success: true,
        data: [SURYA_BODY, ANITA_FITNESS, RAVI_BODY],
        meta: meta(12),
      }),
    );
    await read;
    await flush();

    expect(keysOf(s.rows('over5'))[0]).toBe(keyOf(RAVI_BODY));
    expect(s.rows('over5')[0]?.flagged).toBe(true);

    s.writeGate.resolve(jsonResponse(200, E33_FLAG));
    await s.settled();
  });
});
