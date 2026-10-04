// Spec: docs/specs/member-records/assessments.md (v2), review finding R-6
//   BR-REC-83 / BR-REC-74 — the date of the form decides which saved assessment and draft are loaded, so the
//               form must not ask the server for a form (or carry typed values along) for a date the trainer is
//               still typing.
//   R-6       — a desktop date box reports a date after every key of the year (0002, 0020, 0202, 2026). A typed
//               date commits when the box is left, or after a short pause (~300 ms) once it is a FINISHED date:
//               a real day with a year of 1000 or later.
// Interface (names and shapes only): `@/lib/assessments/useDeferredDate` — `settled(date: string): boolean`:
//   is this typed date a finished one (a real `YYYY-MM-DD` day, year 1000 or later)? (The hook
//   `useDeferredDate` and `DATE_PAUSE_MS` need a React renderer and are not covered here.)
import { beforeAll, describe, expect, test } from 'bun:test';

interface DeferredDate {
  settled(date: string): boolean;
}

let deferred: DeferredDate;

beforeAll(async () => {
  deferred = (await import('@/lib/assessments/useDeferredDate')) as unknown as DeferredDate;
});

describe('R-6 settled: a year below 1000 is a half-typed year, not a finished date', () => {
  test.each([
    ['0002-03-04', 'the first key of the year typed'],
    ['0020-03-04', 'two keys of the year'],
    ['0202-03-04', 'three keys of the year'],
    ['0999-12-31', 'the last year below 1000'],
    ['0001-01-01', 'the first day a date box can show'],
    ['0000-01-01', 'year 0'],
  ])('R-6 "%s" (%s) is not settled', (date) => {
    expect(deferred.settled(date)).toBe(false);
  });
});

describe('R-6 settled: a real day with a year of 1000 or later is finished', () => {
  test.each([
    ['2026-03-04', 'the spec example'],
    ['1000-01-01', 'the first year that counts'],
    ['2026-10-03', 'today in the other examples'],
    ['2025-12-30', 'a back-filled day'],
    ['2024-02-29', 'a leap day'],
    ['2026-12-31', 'the last day of a year'],
    ['2026-01-01', 'the first day of a year'],
    ['2030-06-15', 'a future day is still a finished date (the form warns about it)'],
    ['9999-12-31', 'the largest four-digit year'],
  ])('R-6 "%s" (%s) is settled', (date) => {
    expect(deferred.settled(date)).toBe(true);
  });
});

describe('R-6 settled: what is not a real day is not finished', () => {
  test.each([
    ['', 'an empty box'],
    ['2026-3-4', 'no zero padding'],
    ['2026-03-4', 'a one-digit day'],
    ['2026-3-04', 'a one-digit month'],
    ['2026-13-01', 'month 13'],
    ['2026-00-10', 'month 0'],
    ['2026-02-30', 'no 30 February'],
    ['2025-02-29', 'no 29 February in a normal year'],
    ['2026-04-31', 'April has 30 days'],
    ['2026-10-32', 'day 32'],
    ['2026-10-00', 'day 0'],
    ['2026-03', 'a month without a day'],
    ['2026', 'a year alone'],
    ['20261003', 'no dashes'],
    ['2026/10/03', 'slashes'],
    ['03-10-2026', 'day first'],
    ['2026-10-03T10:00:00Z', 'a time on it'],
    ['today', 'a word'],
    ['abc', 'letters'],
  ])('R-6 "%s" (%s) is not settled', (date) => {
    expect(deferred.settled(date)).toBe(false);
  });
});
