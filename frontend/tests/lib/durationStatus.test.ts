// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-75 — time fields are two boxes, minutes and seconds, with the number keypad; seconds 0-59,
//               minutes 0-599; pasting "2:02" fills both; 60 minutes or more shows as h:mm:ss.
//               Example: min 2, sec 75 -> "Seconds must be 0 to 59".
//   D17       — `DurationField` reports an out-of-range box (seconds above 59, minutes above 599) as invalid
//               instead of empty (#19).
//   BR-REC-12 — durations are stored in seconds (the golden fixture `duration-cases.json`).
// Interface: .pipeline/member-records-assessments/contract.md "Admin app interfaces" — `@/lib/durationStatus`:
//   `durationStatus(minText, secText)` -> `'empty' | 'valid' | 'invalid'`: both blank -> `empty`; a blank box
//   counts as 0 when the other has digits; seconds above 59 or minutes above 599 -> `invalid`; else `valid`.
import { describe, expect, test } from 'bun:test';
import { durationFromParts } from '@/lib/domain/duration';
import { durationStatus } from '@/lib/durationStatus';

describe('BR-REC-75 durationStatus: both boxes blank is empty', () => {
  test('BR-REC-75 two empty boxes -> empty', () => {
    expect(durationStatus('', '')).toBe('empty');
  });
});

describe('BR-REC-75 durationStatus: a blank box counts as 0 when the other has digits', () => {
  test.each([
    ['2', '', 'minutes only'],
    ['', '30', 'seconds only'],
    ['0', '', 'a typed 0 minutes'],
    ['', '0', 'a typed 0 seconds'],
    ['0', '0', 'a typed 0:00'],
    ['599', '', 'the largest minutes alone'],
    ['', '59', 'the largest seconds alone'],
  ])('BR-REC-75 (%j, %j) -> valid (%s)', (minText, secText) => {
    expect(durationStatus(minText, secText)).toBe('valid');
  });
});

describe('BR-REC-75 durationStatus: seconds 0-59 and minutes 0-599 are valid', () => {
  test.each([
    ['2', '2'],
    ['2', '02'],
    ['02', '05'],
    ['00', '09'],
    ['1', '59'],
    ['0', '59'],
    ['2', '0'],
    ['599', '59'], // 599:59, the top of the range
    ['599', '0'],
    ['60', '0'], // an hour: shown as h:mm:ss, still a valid entry
    ['65', '30'],
    ['10', '00'],
    ['007', '05'], // leading zeros do not change the number
  ])('BR-REC-75 (%j, %j) -> valid', (minText, secText) => {
    expect(durationStatus(minText, secText)).toBe('valid');
  });
});

describe('BR-REC-75 / D17 durationStatus: an out-of-range box is invalid, not empty', () => {
  test.each([
    ['2', '75', 'spec example: min 2, sec 75'],
    ['2', '60', 'seconds just over'],
    ['0', '60', 'seconds just over, minutes 0'],
    ['', '60', 'seconds just over, minutes blank'],
    ['', '75', 'seconds over, minutes blank'],
    ['', '99', 'two-digit seconds'],
    ['1', '100', 'three-digit seconds'],
    ['600', '0', 'minutes just over'],
    ['600', '', 'minutes just over, seconds blank'],
    ['1000', '', 'four-digit minutes'],
    ['700', '30', 'minutes over, seconds fine'],
    ['600', '75', 'both over'],
    ['0', '075', 'leading zero does not hide 75 seconds'],
  ])('D17 (%j, %j) -> invalid (%s)', (minText, secText) => {
    expect(durationStatus(minText, secText)).toBe('invalid');
  });
});

describe('BR-REC-75 durationStatus agrees with durationFromParts (the stored seconds)', () => {
  test('BR-REC-75 over a grid, valid exactly when the seconds can be stored', () => {
    const minutes = [0, 1, 2, 59, 60, 599, 600, 601, 1000];
    const seconds = [0, 1, 30, 59, 60, 61, 75, 99];
    const mismatches: string[] = [];
    for (const m of minutes) {
      for (const s of seconds) {
        const status = durationStatus(String(m), String(s));
        const storable = durationFromParts(m, s) !== null;
        if ((status === 'valid') !== storable) mismatches.push(`${m}:${s} -> ${status}`);
        if (status === 'empty') mismatches.push(`${m}:${s} -> empty with digits typed`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
