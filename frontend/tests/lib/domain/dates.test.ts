import { describe, expect, test } from 'bun:test';

import {
  addDays,
  addInterval,
  addMonths,
  ageOn,
  daysBetween,
  gymToday,
  isIsoDate,
} from '@/lib/domain/dates';

describe('addMonths (BR-REC-94)', () => {
  const rows: [string, number, string][] = [
    ['2026-01-31', 1, '2026-02-28'], // spec example: 31 Jan + 1 month -> 28 Feb
    ['2028-01-31', 1, '2028-02-29'], // leap year
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-08-31', 1, '2026-09-30'], // due-list case 2: due 30 Sep
    ['2026-09-10', 1, '2026-10-10'], // due-list case 1
    ['2026-09-03', 1, '2026-10-03'], // due-list case 7
    ['2026-08-10', 3, '2026-11-10'], // due-list case 3
    ['2026-08-10', 2, '2026-10-10'],
    ['2026-10-31', 4, '2027-02-28'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-10-03', 12, '2027-10-03'],
    ['2028-02-29', 12, '2029-02-28'],
    ['2026-05-31', 6, '2026-11-30'],
    ['2026-10-03', 0, '2026-10-03'],
  ];
  for (const [from, months, to] of rows) {
    test(`BR-REC-94 ${from} + ${months} month(s) = ${to}`, () => {
      expect(addMonths(from, months)).toBe(to);
    });
  }
});

describe('addInterval (BR-REC-94)', () => {
  const rows: [string, number, 'week' | 'month', string][] = [
    ['2026-01-31', 1, 'month', '2026-02-28'], // due-list case 5
    ['2026-09-20', 2, 'week', '2026-10-04'], // due-list case 6
    ['2026-12-28', 1, 'week', '2027-01-04'],
    ['2026-02-22', 1, 'week', '2026-03-01'],
    ['2026-10-03', 24, 'week', '2027-03-20'],
    ['2026-08-10', 3, 'month', '2026-11-10'],
    ['2026-08-10', 2, 'month', '2026-10-10'],
  ];
  for (const [from, count, unit, to] of rows) {
    test(`BR-REC-94 ${from} + ${count} ${unit}(s) = ${to} (weeks add 7 days each)`, () => {
      expect(addInterval(from, count, unit)).toBe(to);
    });
  }
});

describe('addDays (BR-REC-94, BR-REC-09)', () => {
  const rows: [string, number, string][] = [
    ['2026-02-28', 1, '2026-03-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-10-03', -3, '2026-09-30'],
    ['2026-10-03', 0, '2026-10-03'],
    ['2026-03-07', 2, '2026-03-09'], // across a US daylight-saving change
  ];
  for (const [from, days, to] of rows) {
    test(`BR-REC-94 ${from} + ${days} day(s) = ${to}`, () => {
      expect(addDays(from, days)).toBe(to);
    });
  }
});

describe('daysBetween (BR-REC-105, BR-REC-52)', () => {
  const rows: [string, string, number][] = [
    ['2026-10-01', '2026-10-03', 2], // due 1 Oct, today 3 Oct
    ['2026-10-03', '2026-10-01', -2],
    ['2026-10-03', '2026-10-03', 0],
    ['2026-06-01', '2026-10-03', 124], // due-list case 4
    ['2028-02-28', '2028-03-01', 2],
    ['2025-12-31', '2026-01-01', 1],
    ['2026-03-07', '2026-03-09', 2],
    ['2026-10-24', '2026-10-26', 2],
  ];
  for (const [from, to, days] of rows) {
    test(`BR-REC-105 ${from} to ${to} = ${days} calendar days`, () => {
      expect(daysBetween(from, to)).toBe(days);
    });
  }
});

describe('gymToday (BR-REC-93)', () => {
  const rows: [string, string, string][] = [
    ['2026-10-03T18:00:00Z', 'Asia/Kolkata', '2026-10-03'], // 23:30 IST on 3 Oct
    ['2026-10-03T18:29:59Z', 'Asia/Kolkata', '2026-10-03'], // 23:59:59 IST
    ['2026-10-03T18:30:00Z', 'Asia/Kolkata', '2026-10-04'], // midnight IST
    ['2026-10-03T19:00:00Z', 'Asia/Kolkata', '2026-10-04'],
    ['2026-10-03T19:00:00Z', 'UTC', '2026-10-03'],
    ['2026-10-03T03:00:00Z', 'America/New_York', '2026-10-02'],
  ];
  for (const [instant, zone, day] of rows) {
    test(`BR-REC-93 ${instant} in ${zone} is ${day}`, () => {
      expect(gymToday(new Date(instant), zone)).toBe(day);
    });
  }
});

describe('ageOn (BR-REC-03)', () => {
  const rows: [string, string, number][] = [
    ['1982-05-10', '2026-10-03', 44],
    ['1982-05-10', '2026-05-10', 44], // on the birthday
    ['1982-05-10', '2026-05-09', 43], // the day before
    ['2016-10-03', '2026-10-03', 10],
    ['2016-10-04', '2026-10-03', 9],
  ];
  for (const [dob, on, age] of rows) {
    test(`BR-REC-03 born ${dob} is ${age} on ${on}`, () => {
      expect(ageOn(dob, on)).toBe(age);
    });
  }
});

describe('isIsoDate (BR-REC-153)', () => {
  const valid = ['2026-10-03', '2028-02-29', '1982-05-10', '2026-12-31'];
  const invalid: unknown[] = [
    '2026-02-30',
    '2026-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-10-32',
    '2026-2-3',
    '2026-10-03T00:00:00Z',
    '03-10-2026',
    '',
    20261003,
    null,
    undefined,
  ];
  for (const value of valid) {
    test(`BR-REC-153 ${JSON.stringify(value)} is a calendar day`, () => {
      expect(isIsoDate(value)).toBe(true);
    });
  }
  for (const value of invalid) {
    test(`BR-REC-153 ${JSON.stringify(value)} is not a calendar day`, () => {
      expect(isIsoDate(value)).toBe(false);
    });
  }
});
