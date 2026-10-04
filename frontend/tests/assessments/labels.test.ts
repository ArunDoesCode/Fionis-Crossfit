// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-80 — estimated dates show as "≈ Dec 2025" in forms, lists and the report card.
//               Example: Q2 entry -> history shows "≈ Sep 2025".
//   BR-REC-83 — a future date cannot be picked or saved (DATE_IN_FUTURE); a date before the join date shows
//               "This is before Surya joined (1 Jun 2025)" and can be saved.
//   BR-REC-19 — earlier than the join date shows a warning.
//   BR-REC-84 — after Save: "Saved 9 results for Surya".
//   BR-REC-89 — the list row shows the number of results ("15 results").
// Interface: .pipeline/member-records-assessments/contract.md "Admin app interfaces" —
//   `@/lib/assessments/labels`:
//   `assessmentDateLabel(date, isEstimated, today)`: estimated -> "≈ Dec 2025" (month + year, always the year);
//     else `formatDay(date, today)`.
//   `entryDateIssue({ date, today, joinedOn, memberName })` -> `{ kind: 'future' | 'before_join' | null,
//     message: string | null }`: date > today -> `future` with the dictionary text of `DATE_IN_FUTURE`
//     (`messageForCode`); date < joinedOn -> `before_join` "This is before <first word of the name> joined
//     (<formatDay(joinedOn, today)>)"; a future date wins over before-join.
//   `savedMessage(count, memberName)` "Saved 9 results for Surya" / "Saved 1 result for Surya";
//   `resultCountLabel(count)` "15 results" / "1 result".
import { beforeAll, describe, expect, test } from 'bun:test';
import { formatDay } from '@/lib/format';
import { messageForCode } from '@/lib/messages/errors';

interface Issue {
  kind: 'future' | 'before_join' | null;
  message: string | null;
}
interface Labels {
  assessmentDateLabel(date: string, isEstimated: boolean, today: string): string;
  entryDateIssue(input: {
    date: string;
    today: string;
    joinedOn: string;
    memberName: string;
  }): Issue;
  savedMessage(count: number, memberName: string): string;
  resultCountLabel(count: number): string;
}

let labels: Labels;

beforeAll(async () => {
  labels = (await import('@/lib/assessments/labels')) as unknown as Labels;
});

const TODAY = '2026-10-03';
/** The "approximately" sign the spec writes, U+2248, followed by one space. */
const ABOUT = '≈';

describe('BR-REC-80 assessmentDateLabel: an estimated date shows month and year', () => {
  test.each([
    ['2025-12-01', `${ABOUT} Dec 2025`], // spec: "≈ Dec 2025"
    ['2025-09-30', `${ABOUT} Sep 2025`], // the Q2 example: "≈ Sep 2025"
    ['2025-12-31', `${ABOUT} Dec 2025`], // the day of the month is not shown
    ['2025-03-15', `${ABOUT} Mar 2025`],
    ['2026-09-15', `${ABOUT} Sep 2026`], // this year: the year is still shown
    ['2026-10-03', `${ABOUT} Oct 2026`], // today: still month + year
    ['2027-01-05', `${ABOUT} Jan 2027`],
  ])('BR-REC-80 estimated %s shows "%s"', (date, expected) => {
    expect(labels.assessmentDateLabel(date, true, TODAY)).toBe(expected);
  });

  test.each([
    ['01', 'Jan'],
    ['02', 'Feb'],
    ['03', 'Mar'],
    ['04', 'Apr'],
    ['05', 'May'],
    ['06', 'Jun'],
    ['07', 'Jul'],
    ['08', 'Aug'],
    ['09', 'Sep'],
    ['10', 'Oct'],
    ['11', 'Nov'],
    ['12', 'Dec'],
  ])('BR-REC-80 month %s of an estimated date is named "%s"', (month, name) => {
    expect(labels.assessmentDateLabel(`2025-${month}-10`, true, TODAY)).toBe(
      `${ABOUT} ${name} 2025`,
    );
  });

  const ZONES = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Auckland'];
  const machineZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  test.each(ZONES)(
    'BR-REC-80 the first and last day of a month keep their month in time zone %s',
    (zone) => {
      process.env.TZ = zone;
      try {
        expect(labels.assessmentDateLabel('2025-12-01', true, TODAY)).toBe(`${ABOUT} Dec 2025`);
        expect(labels.assessmentDateLabel('2025-12-31', true, TODAY)).toBe(`${ABOUT} Dec 2025`);
        expect(labels.assessmentDateLabel('2025-01-01', true, TODAY)).toBe(`${ABOUT} Jan 2025`);
        expect(labels.assessmentDateLabel('2025-09-30', true, TODAY)).toBe(`${ABOUT} Sep 2025`);
      } finally {
        process.env.TZ = machineZone;
      }
    },
  );
});

describe('BR-REC-80 assessmentDateLabel: an exact date is a plain day', () => {
  test.each([
    ['2025-03-12', '12 Mar 2025'],
    ['2026-09-12', '12 Sep'], // this year: the year is left out
    ['2026-10-03', '3 Oct'],
    ['2025-12-30', '30 Dec 2025'],
  ])('BR-REC-80 exact %s shows "%s"', (date, expected) => {
    expect(labels.assessmentDateLabel(date, false, TODAY)).toBe(expected);
  });

  test.each(['2025-03-12', '2026-09-12', '2026-10-03', '2024-02-29'])(
    'BR-REC-80 an exact date is formatDay (%s)',
    (date) => {
      expect(labels.assessmentDateLabel(date, false, TODAY)).toBe(formatDay(date, TODAY));
    },
  );

  test('BR-REC-80 an exact date has no "≈"', () => {
    expect(labels.assessmentDateLabel('2025-12-01', false, TODAY)).not.toContain(ABOUT);
  });
});

describe('BR-REC-83 entryDateIssue: a date after today is "future"', () => {
  test.each(['2026-10-04', '2026-10-10', '2027-01-01', '2030-06-15'])(
    'BR-REC-83 %s with today 2026-10-03 is a future date',
    (date) => {
      const issue = labels.entryDateIssue({
        date,
        today: TODAY,
        joinedOn: '2025-06-01',
        memberName: 'Surya Pratap',
      });
      expect(issue.kind).toBe('future');
      expect(issue.message).toBe(messageForCode('DATE_IN_FUTURE'));
      expect((issue.message ?? '').trim()).not.toBe('');
    },
  );

  test('BR-REC-83 the future text is the dictionary text of DATE_IN_FUTURE, not a code', () => {
    const issue = labels.entryDateIssue({
      date: '2026-10-04',
      today: TODAY,
      joinedOn: '2025-06-01',
      memberName: 'Surya',
    });
    expect(issue.message).not.toBe('DATE_IN_FUTURE');
  });
});

describe('BR-REC-83 / 19 entryDateIssue: a date before the join date is "before_join"', () => {
  test('BR-REC-83 spec example: before Surya joined (1 Jun 2025)', () => {
    expect(
      labels.entryDateIssue({
        date: '2025-05-31',
        today: TODAY,
        joinedOn: '2025-06-01',
        memberName: 'Surya Pratap',
      }),
    ).toEqual({ kind: 'before_join', message: 'This is before Surya joined (1 Jun 2025)' });
  });

  test('BR-REC-83 uses the first word of the name', () => {
    expect(
      labels.entryDateIssue({
        date: '2025-01-01',
        today: TODAY,
        joinedOn: '2025-06-01',
        memberName: 'Meera Devi Nair',
      }).message,
    ).toBe('This is before Meera joined (1 Jun 2025)');
  });

  test('BR-REC-83 a one-word name is used whole', () => {
    expect(
      labels.entryDateIssue({
        date: '2025-01-01',
        today: TODAY,
        joinedOn: '2025-06-01',
        memberName: 'Surya',
      }).message,
    ).toBe('This is before Surya joined (1 Jun 2025)');
  });

  test('BR-REC-83 the join day is written like every day (this year: no year)', () => {
    expect(
      labels.entryDateIssue({
        date: '2026-05-20',
        today: TODAY,
        joinedOn: '2026-06-01',
        memberName: 'Surya Pratap',
      }),
    ).toEqual({ kind: 'before_join', message: 'This is before Surya joined (1 Jun)' });
  });

  test('BR-REC-83 the join day is formatDay(joinedOn, today)', () => {
    const joinedOn = '2024-02-29';
    const issue = labels.entryDateIssue({
      date: '2024-02-28',
      today: TODAY,
      joinedOn,
      memberName: 'Anil Kumar',
    });
    expect(issue.message).toBe(`This is before Anil joined (${formatDay(joinedOn, TODAY)})`);
  });

  test('BR-REC-83 one day before the join date is already before_join', () => {
    expect(
      labels.entryDateIssue({
        date: '2025-05-31',
        today: TODAY,
        joinedOn: '2025-06-01',
        memberName: 'Surya',
      }).kind,
    ).toBe('before_join');
  });
});

describe('BR-REC-83 entryDateIssue: a date from the join date to today has no issue', () => {
  test.each([
    ['the join date itself', '2025-06-01'],
    ['the day after joining', '2025-06-02'],
    ['a normal past date', '2026-03-15'],
    ['yesterday', '2026-10-02'],
    ['today', '2026-10-03'],
  ])('BR-REC-83 %s (%s) -> no issue', (_name, date) => {
    expect(
      labels.entryDateIssue({
        date,
        today: TODAY,
        joinedOn: '2025-06-01',
        memberName: 'Surya Pratap',
      }),
    ).toEqual({ kind: null, message: null });
  });

  test('BR-REC-83 a member who joined today can be recorded for today', () => {
    expect(
      labels.entryDateIssue({
        date: TODAY,
        today: TODAY,
        joinedOn: TODAY,
        memberName: 'Surya',
      }),
    ).toEqual({ kind: null, message: null });
  });
});

describe('BR-REC-83 entryDateIssue: a future date wins over before-join', () => {
  test('BR-REC-83 a date after today that is also before a (future) join date is "future"', () => {
    const issue = labels.entryDateIssue({
      date: '2026-10-20',
      today: TODAY,
      joinedOn: '2026-11-15',
      memberName: 'Surya Pratap',
    });
    expect(issue.kind).toBe('future');
    expect(issue.message).toBe(messageForCode('DATE_IN_FUTURE'));
  });
});

describe('BR-REC-84 savedMessage', () => {
  test.each([
    [9, 'Surya', 'Saved 9 results for Surya'], // spec example
    [15, 'Surya', 'Saved 15 results for Surya'],
    [2, 'Meera', 'Saved 2 results for Meera'],
    [1, 'Surya', 'Saved 1 result for Surya'], // singular
  ])('BR-REC-84 savedMessage(%d, "%s") is "%s"', (count, name, expected) => {
    expect(labels.savedMessage(count, name)).toBe(expected);
  });
});

describe('BR-REC-89 resultCountLabel', () => {
  test.each([
    [15, '15 results'],
    [9, '9 results'],
    [2, '2 results'],
    [1, '1 result'],
    [60, '60 results'],
  ])('BR-REC-89 resultCountLabel(%d) is "%s"', (count, expected) => {
    expect(labels.resultCountLabel(count)).toBe(expected);
  });
});
