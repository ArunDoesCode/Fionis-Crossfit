// Spec: docs/specs/member-records/assessments.md (v2) and performance.md BR-REC-144 (cache)
//   BR-REC-88 — Delete asks ...; due dates update at once (a write must reach every cached read).
//   BR-REC-89 — "All assessments" lists 25 per page.
//   D18       — the member page "Recent" block shows the latest 3 assessments (E27, `pageSize=3`).
// Interface: .pipeline/member-records-assessments/contract.md "Admin app interfaces" —
//   `@/lib/api/assessments/queries`: `assessmentKeys` (`all` = `['assessments']`, `entryForm(memberId, typeId,
//   date)`, `lists()`, `list({ memberId, typeId })`, `recent(memberId)`, `detail(id)`), `ASSESSMENT_PAGE_SIZE`
//   = 25, `RECENT_SIZE` = 3. Every mutation success invalidates `assessmentKeys.all`, so every key sits under
//   `all`. (The hooks themselves need a React renderer and are not covered here.)
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { setAuthEnv } from '../auth/helpers';

type Key = readonly unknown[];
interface Queries {
  assessmentKeys: {
    all: Key;
    entryForm(memberId: string, typeId: string, date: string): Key;
    lists(): Key;
    list(filter: { memberId: string; typeId?: string }): Key;
    recent(memberId: string): Key;
    detail(id: string): Key;
  };
  ASSESSMENT_PAGE_SIZE: number;
  RECENT_SIZE: number;
}

let queries: Queries;
let restoreEnv: () => void;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  queries = (await import('@/lib/api/assessments/queries')) as unknown as Queries;
});

afterAll(() => {
  restoreEnv();
});

const M1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const M2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const T1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const T2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const A1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const A2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const startsWith = (key: Key, prefix: Key) =>
  JSON.stringify(key.slice(0, prefix.length)) === JSON.stringify(prefix);

describe('BR-REC-89 / D18 the sizes', () => {
  test('BR-REC-89 a page of "All assessments" is 25', () => {
    expect(queries.ASSESSMENT_PAGE_SIZE).toBe(25);
  });

  test('D18 the Recent block shows 3', () => {
    expect(queries.RECENT_SIZE).toBe(3);
  });
});

describe('BR-REC-88 every key sits under assessmentKeys.all (one invalidate reaches all)', () => {
  test('BR-REC-88 assessmentKeys.all is ["assessments"]', () => {
    expect([...queries.assessmentKeys.all]).toEqual(['assessments']);
  });

  test.each<[string, () => Key]>([
    ['entryForm', () => queries.assessmentKeys.entryForm(M1, T1, '2026-10-03')],
    ['lists', () => queries.assessmentKeys.lists()],
    ['list (all types)', () => queries.assessmentKeys.list({ memberId: M1 })],
    ['list (one type)', () => queries.assessmentKeys.list({ memberId: M1, typeId: T1 })],
    ['recent', () => queries.assessmentKeys.recent(M1)],
    ['detail', () => queries.assessmentKeys.detail(A1)],
  ])('BR-REC-88 the %s key starts with assessmentKeys.all', (_name, makeKey) => {
    expect(startsWith(makeKey(), queries.assessmentKeys.all)).toBe(true);
  });

  test('BR-REC-88 every list key sits under lists() (a list refresh reaches every filter)', () => {
    const lists = queries.assessmentKeys.lists();
    expect(startsWith(queries.assessmentKeys.list({ memberId: M1 }), lists)).toBe(true);
    expect(startsWith(queries.assessmentKeys.list({ memberId: M2, typeId: T2 }), lists)).toBe(true);
  });
});

describe('BR-REC-88 different reads are different cache entries', () => {
  test('the entry form depends on member, assessment and date', () => {
    const base = queries.assessmentKeys.entryForm(M1, T1, '2026-10-03');
    expect(queries.assessmentKeys.entryForm(M2, T1, '2026-10-03')).not.toEqual(base);
    expect(queries.assessmentKeys.entryForm(M1, T2, '2026-10-03')).not.toEqual(base);
    expect(queries.assessmentKeys.entryForm(M1, T1, '2026-10-02')).not.toEqual(base);
  });

  test('the list depends on the member and the assessment filter', () => {
    const all = queries.assessmentKeys.list({ memberId: M1 });
    expect(queries.assessmentKeys.list({ memberId: M2 })).not.toEqual(all);
    expect(queries.assessmentKeys.list({ memberId: M1, typeId: T1 })).not.toEqual(all);
    expect(queries.assessmentKeys.list({ memberId: M1, typeId: T1 })).not.toEqual(
      queries.assessmentKeys.list({ memberId: M1, typeId: T2 }),
    );
  });

  test('the recent block depends on the member', () => {
    expect(queries.assessmentKeys.recent(M1)).not.toEqual(queries.assessmentKeys.recent(M2));
  });

  test('the detail depends on the assessment', () => {
    expect(queries.assessmentKeys.detail(A1)).not.toEqual(queries.assessmentKeys.detail(A2));
  });

  test('the five kinds of read never share a key', () => {
    const keys = [
      queries.assessmentKeys.entryForm(M1, T1, '2026-10-03'),
      queries.assessmentKeys.list({ memberId: M1 }),
      queries.assessmentKeys.recent(M1),
      queries.assessmentKeys.detail(M1),
      queries.assessmentKeys.lists(),
    ].map((key) => JSON.stringify(key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('the Recent block (3 rows) and the full list (25 per page) are not the same entry', () => {
    expect(queries.assessmentKeys.recent(M1)).not.toEqual(
      queries.assessmentKeys.list({ memberId: M1 }),
    );
  });

  test('keys are stable: asking twice gives the same key', () => {
    expect(queries.assessmentKeys.entryForm(M1, T1, '2026-10-03')).toEqual(
      queries.assessmentKeys.entryForm(M1, T1, '2026-10-03'),
    );
    expect(queries.assessmentKeys.list({ memberId: M1, typeId: T1 })).toEqual(
      queries.assessmentKeys.list({ memberId: M1, typeId: T1 }),
    );
    expect(queries.assessmentKeys.recent(M1)).toEqual(queries.assessmentKeys.recent(M1));
    expect(queries.assessmentKeys.detail(A1)).toEqual(queries.assessmentKeys.detail(A1));
  });
});
