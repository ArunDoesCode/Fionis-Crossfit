// Spec: docs/specs/member-records/ux.md · BR-REC-194 (MonthPicker keeps YYYY-MM; "to" cannot be before "from").
import { describe, expect, test } from 'bun:test';
import { isMonthDisabled, shiftYear } from '@/lib/dates/month';
import * as filters from '@/lib/progress/filters';

describe('BR-REC-194 isMonthDisabled', () => {
  test.each([
    // [candidate, min, max, disabled]
    ['2026-01', '2026-03', undefined, true], // spec example: from Mar 2026 -> Jan, Feb disabled
    ['2026-02', '2026-03', undefined, true],
    ['2026-03', '2026-03', undefined, false], // min itself is allowed (to == from)
    ['2026-04', '2026-03', undefined, false],
    ['2025-12', '2026-03', undefined, true], // an earlier year
    ['2027-01', '2026-03', undefined, false],
    ['2026-06', undefined, '2026-05', true], // after max
    ['2026-05', undefined, '2026-05', false],
    ['2026-04', undefined, '2026-05', false],
    ['2027-01', undefined, '2026-12', true], // year edge
    ['2026-12', undefined, '2026-12', false],
    ['2026-02', '2026-03', '2026-05', true],
    ['2026-04', '2026-03', '2026-05', false],
    ['2026-06', '2026-03', '2026-05', true],
    ['1999-01', undefined, undefined, false], // no limits: nothing disabled
  ] as const)('isMonthDisabled(%s, min %s, max %s) is %s', (candidate, min, max, expected) => {
    expect(isMonthDisabled(candidate, min, max)).toBe(expected);
  });

  test('BR-REC-194 from Mar 2026: exactly Jan-Feb 2026 of that year are disabled', () => {
    const disabled = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
      .filter((m) => isMonthDisabled(m, '2026-03'))
      .map((m) => m.slice(5));
    expect(disabled).toEqual(['01', '02']);
  });
});

describe('BR-REC-194 shiftYear keeps the month and stays YYYY-MM', () => {
  test.each([
    ['2026-03', 1, '2027-03'],
    ['2026-03', -1, '2025-03'],
    ['2026-12', 1, '2027-12'],
    ['2026-01', -1, '2025-01'],
    ['2026-03', 0, '2026-03'],
    ['2026-03', 5, '2031-03'],
    ['2026-03', -26, '2000-03'],
    ['2028-02', 1, '2029-02'],
  ])('shiftYear(%s, %i) is %s', (value, delta, expected) => {
    expect(shiftYear(value, delta)).toBe(expected);
  });
});

describe('BR-REC-194 the Reports URL value stays YYYY-MM', () => {
  test('a YYYY-MM joinedFrom / joinedTo is kept as it is', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2026-03', joinedTo: '2026-05' })).toEqual({
      joinedFrom: '2026-03',
      joinedTo: '2026-05',
    });
  });
  test('"to" earlier than "from" is swapped, not rejected', () => {
    expect(filters.parseProgressFilters({ joinedFrom: '2026-05', joinedTo: '2026-03' })).toEqual({
      joinedFrom: '2026-03',
      joinedTo: '2026-05',
    });
  });
  test('a shifted year is still accepted as a filter value', () => {
    const next = shiftYear('2026-03', 1);
    expect(filters.parseProgressFilters({ joinedFrom: next })).toEqual({ joinedFrom: '2027-03' });
  });
});
