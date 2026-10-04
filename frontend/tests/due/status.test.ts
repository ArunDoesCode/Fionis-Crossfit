// Spec: docs/specs/member-records/due-list.md (v2) and docs/specs/member-records/ux.md
//   BR-REC-96  a row below Due soon says "Due today" / "Due tomorrow" / "Due in 3 days"; before today = Overdue.
//   BR-REC-105 days overdue counts calendar days: due 1 Oct, today 3 Oct -> "2 days overdue" (the API sends the
//              number, the screen must say exactly that number).
//   BR-REC-103 the member page line: "Overdue 34 days", "Due in 5 days", "Next due 12 Dec", "Never recorded",
//              "Assess soon" or "Reminder on 20 Oct"; C10 gives the order: Assess soon -> Reminder -> Never
//              recorded -> Overdue -> Due today/tomorrow/in N days -> Next due.
//   BR-REC-101 / 130 an empty section says one line: "Nobody is overdue." (and "Nobody is due soon.").
//   BR-REC-125 status is never colour alone: every badge has words (+ a tone that picks colour and icon).
//   BR-REC-126 no technical words on screen ("flag", "snooze", "metric", "upcoming", "interval").
//   BR-REC-127 formats: "3 Oct 2026" with the year left out when it is this year; "Due tomorrow".
// Interface: .pipeline/member-records-due-list/contract.md "Admin app interfaces" — `@/lib/due/status`:
//   `dueRowStatus({ flagged, daysOverdue })`, `memberDueStatus(item, today)`, `emptyDueLine(tab)`.
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  forbiddenIn,
  type MemberDueItem,
  memberLine,
  type Status,
  type StatusTone,
  TODAY,
} from './helpers';

interface StatusModule {
  dueRowStatus(row: { flagged: boolean; daysOverdue: number }): Status;
  memberDueStatus(item: MemberDueItem, today: string): Status;
  emptyDueLine(tab: 'overdue' | 'soon'): string;
}

let status: StatusModule;

beforeAll(async () => {
  status = (await import('@/lib/due/status')) as unknown as StatusModule;
});

const TONES: StatusTone[] = ['success', 'warning', 'danger', 'neutral'];

describe('BR-REC-96 / 105 / 125 dueRowStatus: the words at the right of a Home / Due list row', () => {
  const cases: Array<[string, boolean, number, string, StatusTone]> = [
    ['Assess soon row, long overdue', true, 90, 'Assess soon', 'warning'],
    ['Assess soon row, due today', true, 0, 'Assess soon', 'warning'],
    ['Assess soon row, nothing due (date in the future)', true, -38, 'Assess soon', 'warning'],
    ['2 days overdue (due 1 Oct, today 3 Oct)', false, 2, 'Overdue 2 days', 'danger'],
    ['3 days overdue (case 2)', false, 3, 'Overdue 3 days', 'danger'],
    ['34 days overdue (BR-REC-103 example)', false, 34, 'Overdue 34 days', 'danger'],
    [
      '124 days overdue (case 4: never recorded since 1 Jun)',
      false,
      124,
      'Overdue 124 days',
      'danger',
    ],
    ['365 days overdue', false, 365, 'Overdue 365 days', 'danger'],
    ['1 day overdue is singular', false, 1, 'Overdue 1 day', 'danger'],
    ['due today (case 7, Q3: Due soon, "Due today")', false, 0, 'Due today', 'neutral'],
    ['due tomorrow (case 6)', false, -1, 'Due tomorrow', 'neutral'],
    ['due in 2 days', false, -2, 'Due in 2 days', 'neutral'],
    ['due in 3 days (BR-REC-96 example)', false, -3, 'Due in 3 days', 'neutral'],
    ['due in 7 days (case 1)', false, -7, 'Due in 7 days', 'neutral'],
    ['due in 30 days (Due soon window set wide)', false, -30, 'Due in 30 days', 'neutral'],
  ];

  for (const [label, flagged, daysOverdue, text, tone] of cases) {
    test(`${label}: "${text}", ${tone}`, () => {
      expect(status.dueRowStatus({ flagged, daysOverdue })).toEqual({ text, tone });
    });
  }

  test('BR-REC-96 "Assess soon" wins over the day count whatever the date says', () => {
    for (const daysOverdue of [-10, -1, 0, 1, 5, 200]) {
      expect(status.dueRowStatus({ flagged: true, daysOverdue }).text).toBe('Assess soon');
    }
  });

  test('BR-REC-125 every badge has words and one of the four tones (never colour alone)', () => {
    for (const flagged of [true, false]) {
      for (let daysOverdue = -8; daysOverdue <= 40; daysOverdue++) {
        const result = status.dueRowStatus({ flagged, daysOverdue });
        expect(result.text.trim().length).toBeGreaterThan(0);
        expect(/[A-Za-z]/.test(result.text)).toBe(true);
        expect(TONES).toContain(result.tone);
      }
    }
  });

  test('BR-REC-125 late is danger, soon is warning only for Assess soon, the rest is neutral', () => {
    expect(status.dueRowStatus({ flagged: false, daysOverdue: 1 }).tone).toBe('danger');
    expect(status.dueRowStatus({ flagged: false, daysOverdue: 0 }).tone).toBe('neutral');
    expect(status.dueRowStatus({ flagged: true, daysOverdue: 0 }).tone).toBe('warning');
  });

  test('BR-REC-126 no technical word or code in any row status text', () => {
    const texts: string[] = [];
    for (const flagged of [true, false]) {
      for (let daysOverdue = -35; daysOverdue <= 130; daysOverdue++) {
        texts.push(status.dueRowStatus({ flagged, daysOverdue }).text);
      }
    }
    expect(forbiddenIn(texts)).toEqual([]);
  });
});

describe('BR-REC-103 / C10 memberDueStatus: the one status per assessment on the member page', () => {
  const cases: Array<[string, Partial<MemberDueItem>, string, StatusTone]> = [
    [
      'Assess soon on an overdue assessment',
      { state: 'overdue', nextDueOn: '2026-08-30', flagged: true },
      'Assess soon',
      'warning',
    ],
    ['Assess soon with nothing due', { state: 'ok', flagged: true }, 'Assess soon', 'warning'],
    [
      'Assess soon wins over a reminder, never recorded and overdue',
      {
        state: 'overdue',
        nextDueOn: '2026-06-01',
        neverRecorded: true,
        flagged: true,
        snoozedUntil: '2026-10-20',
      },
      'Assess soon',
      'warning',
    ],
    [
      'a reminder until 20 Oct (BR-REC-103 example)',
      { state: 'upcoming', nextDueOn: '2026-10-06', snoozedUntil: '2026-10-20' },
      'Reminder on 20 Oct',
      'neutral',
    ],
    [
      'a reminder wins over overdue',
      { state: 'overdue', nextDueOn: '2026-08-30', snoozedUntil: '2026-10-20' },
      'Reminder on 20 Oct',
      'neutral',
    ],
    [
      'a reminder wins over never recorded',
      {
        state: 'overdue',
        nextDueOn: '2026-06-01',
        neverRecorded: true,
        snoozedUntil: '2026-11-03',
      },
      'Reminder on 3 Nov',
      'neutral',
    ],
    [
      'a reminder in another year shows the year (BR-REC-127)',
      { state: 'ok', nextDueOn: '2027-03-01', snoozedUntil: '2027-01-05' },
      'Reminder on 5 Jan 2027',
      'neutral',
    ],
    [
      'never recorded and overdue: "Never recorded" wins over "Overdue 124 days" (Q5, C10)',
      { state: 'overdue', nextDueOn: '2026-06-01', neverRecorded: true },
      'Never recorded',
      'danger',
    ],
    [
      'never recorded but not overdue yet: neutral',
      { state: 'upcoming', nextDueOn: '2026-10-05', neverRecorded: true },
      'Never recorded',
      'neutral',
    ],
    [
      'never recorded with a later date: neutral',
      { state: 'ok', nextDueOn: '2026-12-01', neverRecorded: true },
      'Never recorded',
      'neutral',
    ],
    [
      'overdue 34 days (BR-REC-103 example)',
      { state: 'overdue', nextDueOn: '2026-08-30' },
      'Overdue 34 days',
      'danger',
    ],
    [
      'overdue 1 day is singular',
      { state: 'overdue', nextDueOn: '2026-10-02' },
      'Overdue 1 day',
      'danger',
    ],
    ['due today', { state: 'upcoming', nextDueOn: '2026-10-03' }, 'Due today', 'neutral'],
    ['due tomorrow', { state: 'upcoming', nextDueOn: '2026-10-04' }, 'Due tomorrow', 'neutral'],
    [
      'due in 5 days (BR-REC-103 example)',
      { state: 'upcoming', nextDueOn: '2026-10-08' },
      'Due in 5 days',
      'neutral',
    ],
    ['due in 7 days', { state: 'upcoming', nextDueOn: '2026-10-10' }, 'Due in 7 days', 'neutral'],
    [
      'next due 12 Dec (BR-REC-103 example)',
      { state: 'ok', nextDueOn: '2026-12-12' },
      'Next due 12 Dec',
      'success',
    ],
    [
      'next due 10 Nov (case 3: Fran-only fitness test)',
      { state: 'ok', nextDueOn: '2026-11-10' },
      'Next due 10 Nov',
      'success',
    ],
    [
      'next due in another year shows the year',
      { state: 'ok', nextDueOn: '2027-01-05' },
      'Next due 5 Jan 2027',
      'success',
    ],
  ];

  for (const [label, over, text, tone] of cases) {
    test(`${label}: "${text}", ${tone}`, () => {
      expect(status.memberDueStatus(memberLine(over), TODAY)).toEqual({ text, tone });
    });
  }

  test('BR-REC-127 the year is left out only when the date is in the same year as "today" (today is an argument)', () => {
    const line = memberLine({ state: 'ok', nextDueOn: '2027-01-05' });
    expect(status.memberDueStatus(line, '2026-10-03').text).toBe('Next due 5 Jan 2027');
    expect(status.memberDueStatus(line, '2027-01-02').text).toBe('Next due 5 Jan');
    const reminder = memberLine({ state: 'ok', snoozedUntil: '2027-01-05' });
    expect(status.memberDueStatus(reminder, '2027-01-02').text).toBe('Reminder on 5 Jan');
  });

  test('BR-REC-125 every combination gives words and one of the four tones', () => {
    const states: MemberDueItem['state'][] = ['overdue', 'upcoming', 'ok'];
    for (const state of states) {
      for (const flagged of [true, false]) {
        for (const neverRecorded of [true, false]) {
          for (const snoozedUntil of [null, '2026-10-20']) {
            for (const nextDueOn of ['2026-08-30', '2026-10-03', '2026-10-09', '2026-12-12']) {
              const result = status.memberDueStatus(
                memberLine({ state, flagged, neverRecorded, snoozedUntil, nextDueOn }),
                TODAY,
              );
              expect(result.text.trim().length).toBeGreaterThan(0);
              expect(TONES).toContain(result.tone);
            }
          }
        }
      }
    }
  });

  test('BR-REC-126 no technical word or code in any member status text', () => {
    const texts: string[] = [];
    const states: MemberDueItem['state'][] = ['overdue', 'upcoming', 'ok'];
    for (const state of states) {
      for (const flagged of [true, false]) {
        for (const neverRecorded of [true, false]) {
          for (const snoozedUntil of [null, '2026-10-20', '2027-01-05']) {
            for (const nextDueOn of ['2026-06-01', '2026-08-30', '2026-10-03', '2026-10-09']) {
              texts.push(
                status.memberDueStatus(
                  memberLine({ state, flagged, neverRecorded, snoozedUntil, nextDueOn }),
                  TODAY,
                ).text,
              );
            }
          }
        }
      }
    }
    expect(forbiddenIn(texts)).toEqual([]);
  });

  test('it does not change the item it is given', () => {
    const line = memberLine({
      state: 'overdue',
      nextDueOn: '2026-08-30',
      snoozedUntil: '2026-10-20',
    });
    const copy = structuredClone(line);
    status.memberDueStatus(line, TODAY);
    expect(line).toEqual(copy);
  });
});

describe('BR-REC-101 / 130 emptyDueLine: one sentence when a section has nobody', () => {
  test('BR-REC-101 the Overdue section says "Nobody is overdue."', () => {
    expect(status.emptyDueLine('overdue')).toBe('Nobody is overdue.');
  });

  test('BR-REC-101 the Due soon section says "Nobody is due soon."', () => {
    expect(status.emptyDueLine('soon')).toBe('Nobody is due soon.');
  });

  test('BR-REC-126 the empty lines use no technical word', () => {
    expect(forbiddenIn([status.emptyDueLine('overdue'), status.emptyDueLine('soon')])).toEqual([]);
  });
});
