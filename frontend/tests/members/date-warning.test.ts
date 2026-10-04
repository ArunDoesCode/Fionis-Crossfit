// Spec: docs/specs/member-records/members.md
//   BR-REC-48 — an age under 10 or over 100 shows "Please check the date" but can be saved (a warning, never an
//               error); DOB 1920 -> warning.
//   BR-REC-03 — age is computed from the date of birth (1982-05-10 -> 44 on 2026-10-03).
// Interface: .pipeline/member-records-members/contract.md "Admin app interfaces" — `@/lib/members/dateWarning`:
//   `birthDateWarning(dateOfBirth, today)`: age (`ageOn`) under 10 or over 100 -> "Please check the date", else null.
import { beforeAll, describe, expect, test } from 'bun:test';

interface DateWarning {
  birthDateWarning(dateOfBirth: string, today: string): string | null;
}

let warning: DateWarning;

beforeAll(async () => {
  warning = (await import('@/lib/members/dateWarning')) as unknown as DateWarning;
});

const TODAY = '2026-10-03';
const CHECK = 'Please check the date';

describe('BR-REC-48 birthDateWarning, a usual age gives no warning', () => {
  test.each([
    ['1982-05-10', 44],
    ['1990-02-28', 36],
    ['2000-10-03', 26],
    ['1960-01-01', 66],
    ['2016-10-03', 10], // exactly 10 on the day: not under 10
    ['1926-10-03', 100], // exactly 100 on the day: not over 100
    ['1925-10-04', 100], // turns 101 tomorrow: still 100 today
  ])('BR-REC-48 born %s (age %i) gives no warning', (dateOfBirth) => {
    expect(warning.birthDateWarning(dateOfBirth, TODAY)).toBeNull();
  });
});

describe('BR-REC-48 birthDateWarning, an age under 10 gives "Please check the date"', () => {
  test.each([
    ['2016-10-04', 9], // one day short of 10
    ['2020-01-01', 6],
    ['2026-09-01', 0], // a baby
    ['2026-10-03', 0], // born today
  ])('BR-REC-48 born %s (age %i) shows the warning', (dateOfBirth) => {
    expect(warning.birthDateWarning(dateOfBirth, TODAY)).toBe(CHECK);
  });
});

describe('BR-REC-48 birthDateWarning, an age over 100 gives "Please check the date"', () => {
  test.each([
    ['1920-01-01', 106], // spec example
    ['1925-10-03', 101], // turned 101 today
    ['1900-01-01', 126],
    ['1800-06-15', 226],
  ])('BR-REC-48 born %s (age %i) shows the warning', (dateOfBirth) => {
    expect(warning.birthDateWarning(dateOfBirth, TODAY)).toBe(CHECK);
  });
});

describe('BR-REC-48 birthDateWarning counts the age on the given "today"', () => {
  test('BR-REC-48 the same date of birth warns or not depending on today', () => {
    expect(warning.birthDateWarning('2000-01-01', '2026-10-03')).toBeNull(); // age 26
    expect(warning.birthDateWarning('2000-01-01', '2005-06-01')).toBe(CHECK); // age 5
    expect(warning.birthDateWarning('2000-01-01', '2110-01-01')).toBe(CHECK); // age 110
  });

  test('BR-REC-48 the warning turns on and off at the 10th birthday', () => {
    expect(warning.birthDateWarning('2016-10-03', '2026-10-02')).toBe(CHECK); // age 9
    expect(warning.birthDateWarning('2016-10-03', '2026-10-03')).toBeNull(); // age 10
  });

  test('BR-REC-48 the warning turns on and off at the 101st birthday', () => {
    expect(warning.birthDateWarning('1925-10-03', '2026-10-02')).toBeNull(); // age 100
    expect(warning.birthDateWarning('1925-10-03', '2026-10-03')).toBe(CHECK); // age 101
  });
});

describe('BR-REC-48 birthDateWarning is only a hint', () => {
  test('BR-REC-48 the answer is a string or null (the form decides nothing else from it)', () => {
    for (const dob of ['1982-05-10', '1920-01-01', '2020-01-01']) {
      const result = warning.birthDateWarning(dob, TODAY);
      expect(result === null || typeof result === 'string').toBe(true);
    }
  });
});
