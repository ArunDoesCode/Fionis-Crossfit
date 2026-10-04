// Spec: docs/specs/member-records/assessments.md (v2) and docs/specs/member-records/due-list.md
//   BR-REC-73 — "Record assessment" opens a sheet to pick the assessment (with its due status); fields carry a
//               "due" tag when due. Choose sheet: "Body composition — Overdue 34 days · Fitness test — Due in 5 days".
//   D11       — the status words and "due" tags come from E32 (due-list stream). While E32 answers 501 or fails,
//               the sheet lists the turned-on assessments without a status and the fields carry no tag; no
//               error is shown.
//   due-list BR-REC-103 — one status per assessment: "Overdue 34 days", "Due in 5 days", "Next due 12 Dec",
//               "Never recorded", "Assess soon" or "Reminder on 20 Oct".
//   due-list BR-REC-96 / 98 / 99 — "Due today", "Due tomorrow", "Due in 3 days"; an "Assess soon" row; "Remind
//               me later" hides a row until a date.
// Interface (names and shapes only): `@/lib/assessments/dueStatus` — `dueStatusText(row, today)` -> string;
//   `dueMetricIds(rows | undefined, typeId)` -> `Set<string>` (the measurements of that assessment that are due).
//   E32 row shape from `@/lib/assessments/types` (`MemberDueRow`).
import { describe, expect, test } from 'bun:test';
import { dueMetricIds, dueStatusText } from '@/lib/assessments/dueStatus';
import type { MemberDueRow } from '@/lib/assessments/types';

const TODAY = '2026-10-03';
const BODY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FITNESS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WEIGHT = '11111111-1111-4111-8111-111111111111';
const FAT = '22222222-2222-4222-8222-222222222222';
const FRAN = '33333333-3333-4333-8333-333333333333';

const row = (over: Partial<MemberDueRow>): MemberDueRow => ({
  typeId: BODY,
  typeName: 'Body composition',
  state: 'ok',
  neverRecorded: false,
  nextDueOn: '2026-11-10',
  daysOverdue: 0,
  flagged: false,
  snoozedUntil: null,
  items: [],
  ...over,
});

describe('due-list BR-REC-103 dueStatusText: the six words', () => {
  test.each<[string, Partial<MemberDueRow>, string]>([
    [
      'overdue by 34 days (spec example)',
      { state: 'overdue', nextDueOn: '2026-08-30', daysOverdue: 34 },
      'Overdue 34 days',
    ],
    [
      'overdue by 3 days (case 2)',
      { state: 'overdue', nextDueOn: '2026-09-30', daysOverdue: 3 },
      'Overdue 3 days',
    ],
    [
      'overdue by 124 days',
      { state: 'overdue', nextDueOn: '2026-06-01', daysOverdue: 124 },
      'Overdue 124 days',
    ],
    [
      'due in 5 days (spec example)',
      { state: 'upcoming', nextDueOn: '2026-10-08' },
      'Due in 5 days',
    ],
    ['due in 7 days (case 1)', { state: 'upcoming', nextDueOn: '2026-10-10' }, 'Due in 7 days'],
    ['due in 2 days', { state: 'upcoming', nextDueOn: '2026-10-05' }, 'Due in 2 days'],
    ['due today (case 7)', { state: 'upcoming', nextDueOn: TODAY }, 'Due today'],
    ['due tomorrow (case 6)', { state: 'upcoming', nextDueOn: '2026-10-04' }, 'Due tomorrow'],
    ['next due this year', { state: 'ok', nextDueOn: '2026-11-10' }, 'Next due 10 Nov'],
    ['next due on 12 Dec', { state: 'ok', nextDueOn: '2026-12-12' }, 'Next due 12 Dec'],
    [
      'next due next year shows the year',
      { state: 'ok', nextDueOn: '2027-01-05' },
      'Next due 5 Jan 2027',
    ],
    [
      'never recorded (due on the join date, so also overdue)',
      { state: 'overdue', neverRecorded: true, nextDueOn: '2026-06-01', daysOverdue: 124 },
      'Never recorded',
    ],
    ['never recorded, not yet due', { state: 'ok', neverRecorded: true }, 'Never recorded'],
    ['"Assess soon" with nothing due (case 12)', { state: 'ok', flagged: true }, 'Assess soon'],
    [
      '"Assess soon" over an overdue date (a flag puts the member in Overdue)',
      { state: 'overdue', flagged: true, nextDueOn: '2026-09-30', daysOverdue: 3 },
      'Assess soon',
    ],
    [
      'a reminder until 20 Oct (case 13)',
      { state: 'ok', snoozedUntil: '2026-10-20' },
      'Reminder on 20 Oct',
    ],
    [
      'a reminder over an overdue date (hidden until then)',
      { state: 'overdue', snoozedUntil: '2026-10-20', nextDueOn: '2026-09-30', daysOverdue: 3 },
      'Reminder on 20 Oct',
    ],
    [
      'a reminder into next year shows the year',
      { state: 'ok', snoozedUntil: '2027-01-02' },
      'Reminder on 2 Jan 2027',
    ],
  ])('BR-REC-103 %s -> "%s"', (_name, over, expected) => {
    expect(dueStatusText(row(over), TODAY)).toBe(expected);
  });

  test('BR-REC-93 "today" is the day that is given, not the clock', () => {
    const upcoming = row({ state: 'upcoming', nextDueOn: '2026-10-08' });
    expect(dueStatusText(upcoming, '2026-10-03')).toBe('Due in 5 days');
    expect(dueStatusText(upcoming, '2026-10-07')).toBe('Due tomorrow');
    expect(dueStatusText(upcoming, '2026-10-08')).toBe('Due today');
  });
});

describe('BR-REC-73 / D11 dueMetricIds: the measurements that carry the "due" tag', () => {
  const rows: MemberDueRow[] = [
    row({
      typeId: BODY,
      state: 'overdue',
      nextDueOn: '2026-09-30',
      daysOverdue: 3,
      items: [
        { metricId: WEIGHT, name: 'Weight' },
        { metricId: FAT, name: 'Visceral fat' },
      ],
    }),
    row({
      typeId: FITNESS,
      typeName: 'Fitness test',
      state: 'overdue',
      nextDueOn: '2026-09-01',
      daysOverdue: 32,
      items: [{ metricId: FRAN, name: 'Fran' }],
    }),
  ];

  test('BR-REC-73 the due measurements of the assessment being filled', () => {
    expect([...dueMetricIds(rows, BODY)].sort()).toEqual([WEIGHT, FAT].sort());
  });

  test('BR-REC-73 another assessment has its own due measurements', () => {
    expect([...dueMetricIds(rows, FITNESS)]).toEqual([FRAN]);
  });

  test('BR-REC-73 an assessment that is not due carries no tag', () => {
    const notDue = [row({ typeId: BODY, state: 'ok', items: [] })];
    expect(dueMetricIds(notDue, BODY).size).toBe(0);
  });

  test('BR-REC-73 an assessment that is not in the answer carries no tag', () => {
    expect(dueMetricIds(rows, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc').size).toBe(0);
  });

  test('D11 no answer from E32 (failed or 501): no tag, no error', () => {
    const none = dueMetricIds(undefined, BODY);
    expect(none).toBeInstanceOf(Set);
    expect(none.size).toBe(0);
  });

  test('D11 an empty answer: no tag', () => {
    expect(dueMetricIds([], BODY).size).toBe(0);
  });
});
