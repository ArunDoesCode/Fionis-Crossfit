// Spec: docs/specs/member-records/due-list.md (v2)
//   BR-REC-99  "Remind me later" offers 1 week, 2 weeks, 1 month or a date (after today, at most 90 days ahead);
//              example: "Remind 1 month on 3 Oct -> back on 3 Nov".
//   BR-REC-94  months add calendar months and land on the month's last day when needed (31 Jan + 1 month -> 28 Feb);
//              weeks add 7 days each.
//   BR-REC-18  a reminder is "at most 90 days ahead"; E33 answers 91 days with `SNOOZE_TOO_FAR`.
//   C8         `until` must be after today (else VALIDATION_ERROR) and at most today + 90 days (else SNOOZE_TOO_FAR);
//              "1 month" = same day next month; 1 week / 2 weeks = + 7 / 14 days.
//   BR-REC-126 / 128 plain words: the messages never show a code.
// Interface: docs/specs/member-records/due-list.md — `@/lib/due/remind`:
//   `remindChoices(today)` -> [{ label: "1 week" | "2 weeks" | "1 month", until }],
//   `remindDateIssue(until | '', today)` -> "Pick a date." | "Pick a date after today." | the SNOOZE_TOO_FAR text from
//   `messageForCode` | null.
import { beforeAll, describe, expect, test } from 'bun:test';
import { messageForCode } from '@/lib/messages/errors';
import { forbiddenIn } from './helpers';

interface Choice {
  label: string;
  until: string;
}

interface RemindModule {
  remindChoices(today: string): Choice[];
  remindDateIssue(until: string, today: string): string | null;
}

let remind: RemindModule;

beforeAll(async () => {
  remind = (await import('@/lib/due/remind')) as unknown as RemindModule;
});

describe('BR-REC-99 / 94 remindChoices: 1 week, 2 weeks, 1 month from today', () => {
  // [today, +7 days, +14 days, same day next month]
  const cases: Array<[string, string, string, string]> = [
    ['2026-10-03', '2026-10-10', '2026-10-17', '2026-11-03'],
    ['2026-01-31', '2026-02-07', '2026-02-14', '2026-02-28'],
    ['2028-01-31', '2028-02-07', '2028-02-14', '2028-02-29'],
    ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-30'],
    ['2026-12-28', '2027-01-04', '2027-01-11', '2027-01-28'],
    ['2026-12-31', '2027-01-07', '2027-01-14', '2027-01-31'],
    ['2026-02-25', '2026-03-04', '2026-03-11', '2026-03-25'],
  ];

  for (const [today, week, twoWeeks, month] of cases) {
    test(`today ${today}: 1 week ${week}, 2 weeks ${twoWeeks}, 1 month ${month}`, () => {
      expect(remind.remindChoices(today).map((choice) => [choice.label, choice.until])).toEqual([
        ['1 week', week],
        ['2 weeks', twoWeeks],
        ['1 month', month],
      ]);
    });
  }

  test('BR-REC-99 "Remind 1 month on 3 Oct -> back on 3 Nov"', () => {
    const month = remind.remindChoices('2026-10-03').find((choice) => choice.label === '1 month');
    expect(month?.until).toBe('2026-11-03');
  });

  test('BR-REC-94 31 Jan + 1 month lands on 28 Feb, not on 3 Mar', () => {
    const month = remind.remindChoices('2026-01-31').find((choice) => choice.label === '1 month');
    expect(month?.until).toBe('2026-02-28');
  });

  test('BR-REC-99 exactly three choices, in the order 1 week, 2 weeks, 1 month', () => {
    expect(remind.remindChoices('2026-10-03').map((choice) => choice.label)).toEqual([
      '1 week',
      '2 weeks',
      '1 month',
    ]);
  });

  test('BR-REC-18 every choice is a date the API accepts (after today, at most 90 days ahead)', () => {
    for (const today of ['2026-10-03', '2026-01-31', '2026-12-31', '2028-02-29', '2026-08-31']) {
      for (const choice of remind.remindChoices(today)) {
        expect(remind.remindDateIssue(choice.until, today)).toBeNull();
      }
    }
  });

  test('BR-REC-126 the labels use no technical word', () => {
    expect(forbiddenIn(remind.remindChoices('2026-10-03').map((choice) => choice.label))).toEqual(
      [],
    );
  });

  test('BR-REC-93 the choices follow the "today" argument, not the clock', () => {
    const a = remind.remindChoices('2026-10-03').map((choice) => choice.until);
    const b = remind.remindChoices('2031-03-15').map((choice) => choice.until);
    expect(a).not.toEqual(b);
    expect(b).toEqual(['2031-03-22', '2031-03-29', '2031-04-15']);
  });
});

describe('BR-REC-99 / 18 / C8 remindDateIssue: the date a coach picks', () => {
  const TODAY = '2026-10-03';

  test('BR-REC-99 no date yet: "Pick a date."', () => {
    expect(remind.remindDateIssue('', TODAY)).toBe('Pick a date.');
  });

  for (const [label, until] of [
    ['today', '2026-10-03'],
    ['yesterday', '2026-10-02'],
    ['last year', '2025-10-03'],
  ] as const) {
    test(`C8 ${label} (${until}) is not after today: "Pick a date after today."`, () => {
      expect(remind.remindDateIssue(until, TODAY)).toBe('Pick a date after today.');
    });
  }

  test('C8 tomorrow (2026-10-04) is the first day that works', () => {
    expect(remind.remindDateIssue('2026-10-04', TODAY)).toBeNull();
  });

  test('BR-REC-18 90 days ahead (2027-01-01) is the last day that works', () => {
    expect(remind.remindDateIssue('2027-01-01', TODAY)).toBeNull();
  });

  test('BR-REC-18 91 days ahead (2027-01-02) is too far: the SNOOZE_TOO_FAR text', () => {
    expect(remind.remindDateIssue('2027-01-02', TODAY)).toBe(messageForCode('SNOOZE_TOO_FAR'));
  });

  test('BR-REC-18 a date a year ahead is too far', () => {
    expect(remind.remindDateIssue('2027-10-03', TODAY)).toBe(messageForCode('SNOOZE_TOO_FAR'));
  });

  test('BR-REC-94 the 90-day limit counts calendar days across a leap February (today 2028-01-01)', () => {
    expect(remind.remindDateIssue('2028-03-31', '2028-01-01')).toBeNull();
    expect(remind.remindDateIssue('2028-04-01', '2028-01-01')).toBe(
      messageForCode('SNOOZE_TOO_FAR'),
    );
  });

  test('BR-REC-94 the 90-day limit counts calendar days across a year end (today 2026-12-31)', () => {
    expect(remind.remindDateIssue('2027-03-31', '2026-12-31')).toBeNull();
    expect(remind.remindDateIssue('2027-04-01', '2026-12-31')).toBe(
      messageForCode('SNOOZE_TOO_FAR'),
    );
  });

  test('BR-REC-93 the limits follow the "today" argument (the same date is fine one day, too far another)', () => {
    expect(remind.remindDateIssue('2027-01-01', '2026-10-03')).toBeNull();
    expect(remind.remindDateIssue('2027-01-01', '2026-09-30')).toBe(
      messageForCode('SNOOZE_TOO_FAR'),
    );
    expect(remind.remindDateIssue('2027-01-01', '2027-01-01')).toBe('Pick a date after today.');
  });

  test('BR-REC-128 every message is one plain sentence with no code', () => {
    const messages = [
      remind.remindDateIssue('', TODAY),
      remind.remindDateIssue('2026-10-03', TODAY),
      remind.remindDateIssue('2027-01-02', TODAY),
    ];
    for (const message of messages) {
      expect(typeof message).toBe('string');
    }
    expect(forbiddenIn(messages.filter((m): m is string => m !== null))).toEqual([]);
  });
});
