// Spec: docs/specs/member-records/due-list.md (v2)
//   BR-REC-97  order: "Assess soon" rows first, then most days overdue, then soonest due, then name A-Z
//              (C5: one key `dueOn` ascending; name ignoring case; then assessment order).
//   BR-REC-100 "Assess soon" and "Remind me later" replace each other; either can be cleared.
//   BR-REC-18  Assess soon puts a member + assessment in Overdue; a reminder hides the row.
//   C13 / perf tactic 8: Assess soon, Remind me later and remove change the lists at once.
// Interface: docs/specs/member-records/due-list.md — `@/lib/due/optimistic`:
//   `sortDueRows(rows)`: flagged first -> `dueOn` ascending -> `fullName.toLowerCase()` ascending (code-unit
//     order) -> keep the given order for ties (stable).
//   `applyDueChange(list, change, tab)`: `snooze` -> the row is removed; `flag` -> in `overdue` the row gets
//     `flagged: true` and the list is re-sorted, in `upcoming` the row is removed; `clear` -> in `overdue` a flagged
//     row gets `flagged: false` and the list is re-sorted (a row that was due only because of the flag stays until
//     the refetch); no matching row -> same contents. Never mutates the input.
//   `applyMemberDueChange(items, change)`: `flag` -> `flagged: true, snoozedUntil: null`; `snooze` ->
//     `snoozedUntil: until, flagged: false`; `clear` -> both off; other items unchanged; never mutates.
//   A row is matched by `memberId` + `typeId`.
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  clone,
  type DueChange,
  type DueListItem,
  deepFreeze,
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
  uuid,
} from './helpers';

interface OptimisticModule {
  sortDueRows(rows: DueListItem[]): DueListItem[];
  applyDueChange(
    list: DueListItem[],
    change: DueChange,
    tab: 'overdue' | 'upcoming',
  ): DueListItem[];
  applyMemberDueChange(items: MemberDueItem[], change: DueChange): MemberDueItem[];
}

let optimistic: OptimisticModule;

beforeAll(async () => {
  optimistic = (await import('@/lib/due/optimistic')) as unknown as OptimisticModule;
});

// today = 2026-10-03 (the spec's worked-example day)
const SURYA_BODY = dueRow({
  memberId: MEMBER_SURYA,
  fullName: 'Surya Pratap',
  typeId: TYPE_BODY,
  typeName: 'Body composition',
  dueOn: '2026-08-30', // 34 days overdue
  items: [item(1, 'Weight'), item(2, 'Body fat')],
});
const ANITA_FITNESS = dueRow({
  memberId: MEMBER_ANITA,
  fullName: 'Anita Rao',
  typeId: TYPE_FITNESS,
  typeName: 'Fitness test',
  dueOn: '2026-09-15', // 18 days overdue
  items: [item(3, 'Push-ups'), item(4, 'Pull-ups')],
});
const ANITA_BODY = dueRow({
  memberId: MEMBER_ANITA,
  fullName: 'Anita Rao',
  typeId: TYPE_BODY,
  typeName: 'Body composition',
  dueOn: '2026-09-20', // 13 days overdue
  items: [item(1, 'Weight')],
});
const RAVI_BODY = dueRow({
  memberId: MEMBER_RAVI,
  fullName: 'Ravi K',
  typeId: TYPE_BODY,
  typeName: 'Body composition',
  dueOn: '2026-09-28', // 5 days overdue
  items: [item(2, 'Body fat')],
});

const ids = (rows: DueListItem[]) => rows.map((r) => `${r.memberId}/${r.typeId}`);
const key = (r: DueListItem) => `${r.memberId}/${r.typeId}`;

describe('BR-REC-97 / C5 sortDueRows: the order of every due list', () => {
  test('BR-REC-97 Assess soon rows come before any other row, even a 90-day overdue one', () => {
    const ninetyDays = dueRow({
      memberId: MEMBER_RAVI,
      fullName: 'Ravi K',
      dueOn: '2026-07-05', // 90 days overdue
    });
    const flagged = dueRow({
      memberId: MEMBER_ANITA,
      fullName: 'Anita Rao',
      typeId: TYPE_FITNESS,
      dueOn: '2026-12-01',
      flagged: true,
    });
    expect(ids(optimistic.sortDueRows([ninetyDays, flagged]))).toEqual([
      key(flagged),
      key(ninetyDays),
    ]);
    expect(ids(optimistic.sortDueRows([flagged, ninetyDays]))).toEqual([
      key(flagged),
      key(ninetyDays),
    ]);
  });

  test('BR-REC-97 then the most days overdue first, then the soonest due', () => {
    const soonest = dueRow({ memberId: MEMBER_ANITA, fullName: 'Anita Rao', dueOn: '2026-10-03' });
    const later = dueRow({ memberId: MEMBER_RAVI, fullName: 'Ravi K', dueOn: '2026-10-08' });
    const mostOverdue = dueRow({ memberId: MEMBER_SURYA, dueOn: '2026-08-30' });
    const overdue = dueRow({ memberId: MEMBER_ZED, fullName: 'Zed', dueOn: '2026-09-28' });
    expect(ids(optimistic.sortDueRows([later, overdue, soonest, mostOverdue]))).toEqual([
      key(mostOverdue),
      key(overdue),
      key(soonest),
      key(later),
    ]);
  });

  test('BR-REC-97 Assess soon rows are ordered among themselves by due date, then name', () => {
    const flaggedLate = dueRow({
      memberId: MEMBER_RAVI,
      fullName: 'Ravi K',
      dueOn: '2026-11-10',
      flagged: true,
    });
    const flaggedEarly = dueRow({
      memberId: MEMBER_ZED,
      fullName: 'Zed',
      dueOn: '2026-09-01',
      flagged: true,
    });
    const flaggedEarlyAnita = dueRow({
      memberId: MEMBER_ANITA,
      fullName: 'Anita Rao',
      dueOn: '2026-09-01',
      flagged: true,
    });
    expect(ids(optimistic.sortDueRows([flaggedLate, flaggedEarly, flaggedEarlyAnita]))).toEqual([
      key(flaggedEarlyAnita),
      key(flaggedEarly),
      key(flaggedLate),
    ]);
  });

  test('BR-REC-97 same due date: name A-Z, ignoring upper and lower case', () => {
    const date = '2026-09-28';
    const anita = dueRow({ memberId: MEMBER_ANITA, fullName: 'anita rao', dueOn: date });
    const bala = dueRow({ memberId: MEMBER_RAVI, fullName: 'Bala', dueOn: date });
    const chandra = dueRow({ memberId: MEMBER_SURYA, fullName: 'chandra', dueOn: date });
    // A plain code-unit sort of the raw names would put "Bala" first ("B" < "a").
    expect(ids(optimistic.sortDueRows([chandra, bala, anita]))).toEqual([
      key(anita),
      key(bala),
      key(chandra),
    ]);
  });

  test('C5 names compare lower-cased in code-unit order (like the Members list): "Zed" before "Émile"', () => {
    const date = '2026-09-28';
    const zed = dueRow({ memberId: MEMBER_ZED, fullName: 'Zed', dueOn: date });
    const emile = dueRow({ memberId: MEMBER_RAVI, fullName: 'Émile', dueOn: date });
    expect(ids(optimistic.sortDueRows([emile, zed]))).toEqual([key(zed), key(emile)]);
  });

  test('C5 a tie on everything keeps the order the rows came in (both orders)', () => {
    const date = '2026-09-28';
    const body = dueRow({
      memberId: MEMBER_ANITA,
      fullName: 'Anita Rao',
      typeId: TYPE_BODY,
      dueOn: date,
    });
    const fitness = dueRow({
      memberId: MEMBER_ANITA,
      fullName: 'Anita Rao',
      typeId: TYPE_FITNESS,
      typeName: 'Fitness test',
      dueOn: date,
    });
    expect(ids(optimistic.sortDueRows([body, fitness]))).toEqual([key(body), key(fitness)]);
    expect(ids(optimistic.sortDueRows([fitness, body]))).toEqual([key(fitness), key(body)]);
  });

  test('C5 a tie on the lower-cased name keeps the given order', () => {
    const date = '2026-09-28';
    const lower = dueRow({ memberId: MEMBER_ANITA, fullName: 'anita rao', dueOn: date });
    const upper = dueRow({ memberId: MEMBER_RAVI, fullName: 'ANITA RAO', dueOn: date });
    expect(ids(optimistic.sortDueRows([upper, lower]))).toEqual([key(upper), key(lower)]);
    expect(ids(optimistic.sortDueRows([lower, upper]))).toEqual([key(lower), key(upper)]);
  });

  test('BR-REC-97 an already sorted list stays as it is, and nothing is lost or doubled', () => {
    const sorted = [SURYA_BODY, ANITA_FITNESS, ANITA_BODY, RAVI_BODY];
    const result = optimistic.sortDueRows([...sorted]);
    expect(ids(result)).toEqual(ids(sorted));
    expect(result.length).toBe(sorted.length);
  });

  test('BR-REC-97 an empty list stays empty', () => {
    expect(optimistic.sortDueRows([])).toEqual([]);
  });

  test('BR-REC-97 a shuffled list comes out in the full order (flagged, date, name)', () => {
    const flagged = dueRow({
      memberId: MEMBER_RAVI,
      fullName: 'Ravi K',
      typeId: TYPE_FITNESS,
      dueOn: '2026-10-20',
      flagged: true,
    });
    const expected = [flagged, SURYA_BODY, ANITA_FITNESS, ANITA_BODY, RAVI_BODY];
    const shuffled = [RAVI_BODY, ANITA_BODY, flagged, SURYA_BODY, ANITA_FITNESS];
    expect(ids(optimistic.sortDueRows(shuffled))).toEqual(ids(expected));
  });
});

describe('BR-REC-18 / 100 applyDueChange: the cached lists change at once', () => {
  const overdueList = () => [SURYA_BODY, ANITA_FITNESS, ANITA_BODY, RAVI_BODY];

  describe('Remind me later (snooze)', () => {
    test('BR-REC-99 the row is hidden from Overdue, the others stay in order', () => {
      const result = optimistic.applyDueChange(
        overdueList(),
        { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS, action: 'snooze', until: '2026-11-03' },
        'overdue',
      );
      expect(ids(result)).toEqual([key(SURYA_BODY), key(ANITA_BODY), key(RAVI_BODY)]);
    });

    test('BR-REC-99 the row is hidden from Due soon as well', () => {
      const soon = dueRow({
        memberId: MEMBER_RAVI,
        fullName: 'Ravi K',
        dueOn: '2026-10-06',
        daysOverdue: -3,
      });
      const other = dueRow({ memberId: MEMBER_ANITA, fullName: 'Anita Rao', dueOn: '2026-10-08' });
      const result = optimistic.applyDueChange(
        [soon, other],
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'snooze', until: '2026-10-10' },
        'upcoming',
      );
      expect(ids(result)).toEqual([key(other)]);
    });

    test('C13 only that member + assessment is removed (same member other assessment, other member same assessment stay)', () => {
      const result = optimistic.applyDueChange(
        overdueList(),
        { memberId: MEMBER_ANITA, typeId: TYPE_BODY, action: 'snooze', until: '2026-10-20' },
        'overdue',
      );
      expect(ids(result)).toEqual([key(SURYA_BODY), key(ANITA_FITNESS), key(RAVI_BODY)]);
    });

    test('BR-REC-100 a reminder on an Assess soon row removes it too', () => {
      const flagged = { ...ANITA_FITNESS, flagged: true };
      const result = optimistic.applyDueChange(
        [flagged, SURYA_BODY],
        { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS, action: 'snooze', until: '2026-10-17' },
        'overdue',
      );
      expect(ids(result)).toEqual([key(SURYA_BODY)]);
    });
  });

  describe('Assess soon (flag)', () => {
    test('BR-REC-18 in Overdue the row becomes "Assess soon" and moves to the top', () => {
      const result = optimistic.applyDueChange(
        overdueList(),
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'flag' },
        'overdue',
      );
      expect(ids(result)).toEqual([
        key(RAVI_BODY),
        key(SURYA_BODY),
        key(ANITA_FITNESS),
        key(ANITA_BODY),
      ]);
      expect(result[0]).toEqual({ ...RAVI_BODY, flagged: true });
      expect(result.slice(1).every((row) => row.flagged === false)).toBe(true);
    });

    test('BR-REC-97 it joins the other Assess soon rows in due-date order, not at the very top', () => {
      const alreadyFlagged = { ...RAVI_BODY, flagged: true }; // dueOn 28 Sep
      const list = [alreadyFlagged, SURYA_BODY, ANITA_FITNESS]; // sorted: flagged first
      const result = optimistic.applyDueChange(
        list,
        { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS, action: 'flag' },
        'overdue',
      );
      // Anita (due 15 Sep) is before Ravi (due 28 Sep) among the flagged rows; Surya is not flagged.
      expect(ids(result)).toEqual([key(ANITA_FITNESS), key(alreadyFlagged), key(SURYA_BODY)]);
      expect(result.map((row) => row.flagged)).toEqual([true, true, false]);
    });

    test('BR-REC-18 flagging the same row again keeps it flagged, once', () => {
      const flagged = { ...RAVI_BODY, flagged: true };
      const result = optimistic.applyDueChange(
        [flagged, SURYA_BODY],
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'flag' },
        'overdue',
      );
      expect(ids(result)).toEqual([key(flagged), key(SURYA_BODY)]);
      expect(result[0]?.flagged).toBe(true);
    });

    test('BR-REC-18 an Assess soon row is only ever in Overdue: in Due soon the row is removed', () => {
      const soon = dueRow({
        memberId: MEMBER_RAVI,
        fullName: 'Ravi K',
        dueOn: '2026-10-06',
        daysOverdue: -3,
      });
      const other = dueRow({ memberId: MEMBER_ANITA, fullName: 'Anita Rao', dueOn: '2026-10-08' });
      const result = optimistic.applyDueChange(
        [soon, other],
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'flag' },
        'upcoming',
      );
      expect(ids(result)).toEqual([key(other)]);
    });

    test('flagging changes only the flag: the date, days and chips of the row are kept', () => {
      const result = optimistic.applyDueChange(
        [SURYA_BODY],
        { memberId: MEMBER_SURYA, typeId: TYPE_BODY, action: 'flag' },
        'overdue',
      );
      expect(result).toEqual([{ ...SURYA_BODY, flagged: true }]);
    });

    test('a date sent with a flag change is not used', () => {
      const result = optimistic.applyDueChange(
        [SURYA_BODY],
        { memberId: MEMBER_SURYA, typeId: TYPE_BODY, action: 'flag', until: '2026-11-03' },
        'overdue',
      );
      expect(result).toEqual([{ ...SURYA_BODY, flagged: true }]);
    });
  });

  describe('remove (clear)', () => {
    test('BR-REC-100 removing Assess soon: the row loses the flag and takes its place by date', () => {
      const flagged = { ...ANITA_FITNESS, flagged: true }; // dueOn 15 Sep
      const list = [flagged, SURYA_BODY, RAVI_BODY]; // flagged first
      const result = optimistic.applyDueChange(
        list,
        { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS, action: 'clear' },
        'overdue',
      );
      // Surya 30 Aug, Anita 15 Sep, Ravi 28 Sep.
      expect(ids(result)).toEqual([key(SURYA_BODY), key(ANITA_FITNESS), key(RAVI_BODY)]);
      expect(result.every((row) => row.flagged === false)).toBe(true);
    });

    test('a row that was listed only because of the flag stays until the next load', () => {
      const onlyFlag = dueRow({
        memberId: MEMBER_ANITA,
        fullName: 'Anita Rao',
        typeId: TYPE_FITNESS,
        typeName: 'Fitness test',
        dueOn: '2026-11-10', // nothing is due: the date is in the future
        flagged: true,
      });
      const result = optimistic.applyDueChange(
        [onlyFlag, SURYA_BODY],
        { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS, action: 'clear' },
        'overdue',
      );
      expect(ids(result)).toEqual([key(SURYA_BODY), key(onlyFlag)]);
      expect(result[1]?.flagged).toBe(false);
    });

    test('removing something on a row that is not Assess soon changes nothing', () => {
      const result = optimistic.applyDueChange(
        overdueList(),
        { memberId: MEMBER_SURYA, typeId: TYPE_BODY, action: 'clear' },
        'overdue',
      );
      expect(result).toEqual(overdueList());
    });

    test('Due soon never holds an Assess soon row: remove leaves the list as it is', () => {
      const soon = dueRow({ memberId: MEMBER_RAVI, fullName: 'Ravi K', dueOn: '2026-10-06' });
      const result = optimistic.applyDueChange(
        [soon],
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'clear' },
        'upcoming',
      );
      expect(result).toEqual([soon]);
    });

    test('only the matching member + assessment loses the flag', () => {
      const flaggedA = { ...ANITA_FITNESS, flagged: true };
      const flaggedB = { ...ANITA_BODY, flagged: true };
      const result = optimistic.applyDueChange(
        [flaggedA, flaggedB, SURYA_BODY],
        { memberId: MEMBER_ANITA, typeId: TYPE_FITNESS, action: 'clear' },
        'overdue',
      );
      const byKey = new Map(result.map((row) => [key(row), row]));
      expect(byKey.get(key(ANITA_FITNESS))?.flagged).toBe(false);
      expect(byKey.get(key(ANITA_BODY))?.flagged).toBe(true);
      expect(result[0]).toEqual(flaggedB); // the one still flagged is on top
    });
  });

  describe('no matching row', () => {
    const changes: DueChange[] = [
      { memberId: uuid(999), typeId: TYPE_BODY, action: 'flag' },
      { memberId: uuid(999), typeId: TYPE_BODY, action: 'snooze', until: '2026-10-20' },
      { memberId: uuid(999), typeId: TYPE_BODY, action: 'clear' },
      { memberId: MEMBER_SURYA, typeId: TYPE_FITNESS, action: 'flag' }, // right member, other assessment
      { memberId: MEMBER_RAVI, typeId: TYPE_FITNESS, action: 'snooze', until: '2026-10-20' },
      { memberId: MEMBER_ZED, typeId: TYPE_BODY, action: 'clear' },
    ];
    for (const change of changes) {
      for (const tab of ['overdue', 'upcoming'] as const) {
        test(`${change.action} for ${change.memberId.slice(-3)}/${change.typeId.slice(-3)} in ${tab}: same contents`, () => {
          const list = overdueList();
          const result = optimistic.applyDueChange(list, change, tab);
          expect(result).toEqual(overdueList());
        });
      }
    }

    test('an empty list stays empty for every action and tab', () => {
      for (const action of ['flag', 'snooze', 'clear'] as const) {
        for (const tab of ['overdue', 'upcoming'] as const) {
          expect(
            optimistic.applyDueChange(
              [],
              { memberId: MEMBER_SURYA, typeId: TYPE_BODY, action, until: '2026-10-20' },
              tab,
            ),
          ).toEqual([]);
        }
      }
    });
  });

  describe('the input is never changed (the cache keeps its old copy for undo)', () => {
    const cases: Array<[DueChange, 'overdue' | 'upcoming']> = [
      [{ memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'flag' }, 'overdue'],
      [{ memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'flag' }, 'upcoming'],
      [
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'snooze', until: '2026-10-20' },
        'overdue',
      ],
      [
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'snooze', until: '2026-10-20' },
        'upcoming',
      ],
      [{ memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'clear' }, 'overdue'],
      [{ memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'clear' }, 'upcoming'],
      [{ memberId: uuid(999), typeId: TYPE_BODY, action: 'flag' }, 'overdue'],
    ];
    for (const [change, tab] of cases) {
      test(`${change.action} in ${tab}: a frozen list and rows are neither changed nor refused`, () => {
        const list = deepFreeze([
          { ...clone(RAVI_BODY), flagged: change.action === 'clear' },
          clone(SURYA_BODY),
          clone(ANITA_FITNESS),
        ]);
        const before = clone(list);
        expect(() => optimistic.applyDueChange(list, change, tab)).not.toThrow();
        expect(list).toEqual(before);
      });
    }

    test('the answer is a list of its own, not the same array object when something changed', () => {
      const list = overdueList();
      const result = optimistic.applyDueChange(
        list,
        { memberId: MEMBER_RAVI, typeId: TYPE_BODY, action: 'flag' },
        'overdue',
      );
      expect(result).not.toBe(list);
      expect(list.map((row) => row.flagged)).toEqual([false, false, false, false]);
    });
  });
});

describe('BR-REC-100 applyMemberDueChange: the member page lines change at once', () => {
  const body = memberLine({
    typeId: TYPE_BODY,
    typeName: 'Body composition',
    state: 'overdue',
    nextDueOn: '2026-08-30',
    items: [item(1, 'Weight')],
  });
  const fitness = memberLine({
    typeId: TYPE_FITNESS,
    typeName: 'Fitness test',
    state: 'upcoming',
    nextDueOn: '2026-10-08',
    snoozedUntil: '2026-10-20',
    items: [item(3, 'Push-ups')],
  });
  const lines = () => [clone(body), clone(fitness)];

  test('Assess soon: that line is flagged and has no reminder; the other line is unchanged', () => {
    const result = optimistic.applyMemberDueChange(lines(), {
      memberId: MEMBER_SURYA,
      typeId: TYPE_FITNESS,
      action: 'flag',
    });
    expect(result[0]).toEqual(body);
    expect(result[1]).toEqual({ ...fitness, flagged: true, snoozedUntil: null });
  });

  test('BR-REC-100 Assess soon replaces a reminder at once (the reminder is gone)', () => {
    const result = optimistic.applyMemberDueChange(lines(), {
      memberId: MEMBER_SURYA,
      typeId: TYPE_FITNESS,
      action: 'flag',
    });
    expect(result[1]?.snoozedUntil).toBeNull();
    expect(result[1]?.flagged).toBe(true);
  });

  test('Remind me later: that line gets the date and is not Assess soon; the other line is unchanged', () => {
    const result = optimistic.applyMemberDueChange(lines(), {
      memberId: MEMBER_SURYA,
      typeId: TYPE_BODY,
      action: 'snooze',
      until: '2026-11-03',
    });
    expect(result[0]).toEqual({ ...body, flagged: false, snoozedUntil: '2026-11-03' });
    expect(result[1]).toEqual(fitness);
  });

  test('BR-REC-100 a reminder replaces Assess soon at once (the flag is gone)', () => {
    const flaggedLines = [{ ...clone(body), flagged: true }, clone(fitness)];
    const result = optimistic.applyMemberDueChange(flaggedLines, {
      memberId: MEMBER_SURYA,
      typeId: TYPE_BODY,
      action: 'snooze',
      until: '2026-11-03',
    });
    expect(result[0]?.flagged).toBe(false);
    expect(result[0]?.snoozedUntil).toBe('2026-11-03');
  });

  test('remove on a reminder: the reminder is gone', () => {
    const result = optimistic.applyMemberDueChange(lines(), {
      memberId: MEMBER_SURYA,
      typeId: TYPE_FITNESS,
      action: 'clear',
    });
    expect(result[1]).toEqual({ ...fitness, flagged: false, snoozedUntil: null });
    expect(result[0]).toEqual(body);
  });

  test('remove on Assess soon: the flag is gone', () => {
    const flaggedLines = [{ ...clone(body), flagged: true }, clone(fitness)];
    const result = optimistic.applyMemberDueChange(flaggedLines, {
      memberId: MEMBER_SURYA,
      typeId: TYPE_BODY,
      action: 'clear',
    });
    expect(result[0]).toEqual({ ...body, flagged: false, snoozedUntil: null });
    expect(result[1]).toEqual(fitness);
  });

  test('a line keeps its dates, state and chips whatever the change', () => {
    for (const change of [
      { action: 'flag' as const },
      { action: 'snooze' as const, until: '2026-11-03' },
      { action: 'clear' as const },
    ]) {
      const result = optimistic.applyMemberDueChange(lines(), {
        memberId: MEMBER_SURYA,
        typeId: TYPE_BODY,
        ...change,
      });
      expect(result[0]?.state).toBe(body.state);
      expect(result[0]?.nextDueOn).toBe(body.nextDueOn);
      expect(result[0]?.daysOverdue).toBe(body.daysOverdue);
      expect(result[0]?.items).toEqual(body.items);
      expect(result[0]?.typeName).toBe(body.typeName);
    }
  });

  test('an assessment that is not on the page changes nothing', () => {
    for (const action of ['flag', 'snooze', 'clear'] as const) {
      const result = optimistic.applyMemberDueChange(lines(), {
        memberId: MEMBER_SURYA,
        typeId: uuid(999),
        action,
        until: '2026-11-03',
      });
      expect(result).toEqual(lines());
    }
  });

  test('the order of the lines is kept (setup order, not re-sorted)', () => {
    const result = optimistic.applyMemberDueChange(lines(), {
      memberId: MEMBER_SURYA,
      typeId: TYPE_FITNESS,
      action: 'flag',
    });
    expect(result.map((line) => line.typeId)).toEqual([TYPE_BODY, TYPE_FITNESS]);
  });

  for (const action of ['flag', 'snooze', 'clear'] as const) {
    test(`${action}: a frozen list and lines are neither changed nor refused`, () => {
      const frozen = deepFreeze(lines());
      const before = clone(frozen);
      expect(() =>
        optimistic.applyMemberDueChange(frozen, {
          memberId: MEMBER_SURYA,
          typeId: TYPE_FITNESS,
          action,
          until: '2026-11-03',
        }),
      ).not.toThrow();
      expect(frozen).toEqual(before);
    });
  }
});
