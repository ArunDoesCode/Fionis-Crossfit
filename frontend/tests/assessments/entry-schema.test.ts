// Spec: assessments.md BR-REC-75 (Time boxes), 76 (comma decimals, rounding to the measurement's decimals,
// "Enter a number like 95.5"), 79/83 (date: future cannot be saved), ux.md BR-REC-198 (Zod schema in
// lib/validators). Interface: `entrySchema({ metrics, today, member })` from `@/lib/validators/assessments`;
// input `{ date, isEstimated, values }` with typed text (Time: { min, sec }); output values are numbers
// (Time as seconds) or null when blank. Issue paths are read as dotted strings ("date", "values.<id>").
import { describe, expect, test } from 'bun:test';
import type { EntryMetric } from '@/lib/assessments/types';
import { messageForCode } from '@/lib/messages/errors';
import { UI_TEXT } from '@/lib/messages/words';
import { entrySchema } from '@/lib/validators/assessments';

const W0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0';
const W1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const W2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const metric = (id: string, name: string, over: Partial<EntryMetric> = {}): EntryMetric => ({
  id,
  name,
  unit: '',
  datatype: 'number',
  decimals: 1,
  better: 'none',
  plausibleMin: null,
  plausibleMax: null,
  previous: null,
  tableGroup: null,
  tablePart: null,
  ...over,
});
const METRICS = [
  metric(W0, 'Visceral fat', { decimals: 0 }),
  metric(W1, 'Weight', { decimals: 1 }),
  metric(W2, 'Waist', { decimals: 2 }),
  metric(T, 'Plank', { datatype: 'duration', decimals: 0 }),
];
const TODAY = '2026-10-03';
const schema = entrySchema({
  metrics: METRICS,
  today: TODAY,
  member: { fullName: 'Surya', joinedOn: '2025-06-01' },
});

const blank = { [W0]: '', [W1]: '', [W2]: '', [T]: { min: '', sec: '' } };
const input = (values: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  date: '2026-10-01',
  isEstimated: false,
  values: { ...blank, ...values },
  ...over,
});
const issues = (data: unknown) => {
  const r = schema.safeParse(data);
  return r.success
    ? []
    : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};
const on = (data: unknown, path: string) =>
  issues(data)
    .filter((i) => i.path === path)
    .map((i) => i.message);
const out = (data: unknown) => {
  const r = schema.safeParse(data);
  return r.success ? (r.data as { values: Record<string, number | null> }) : undefined;
};

describe('BR-REC-19 / 76 an all-blank form is valid (blank = not recorded)', () => {
  test('BR-REC-19 every blank box comes out as null', () => {
    const data = out(input());
    expect(data?.values).toEqual({ [W0]: null, [W1]: null, [W2]: null, [T]: null });
  });
});

describe('BR-REC-76 Number boxes', () => {
  test('BR-REC-76 "95,5" (comma) is 95.5', () => {
    expect(out(input({ [W1]: '95,5' }))?.values[W1]).toBe(95.5);
  });
  test.each([
    [W0, '2.5', 3, 'whole numbers'],
    [W1, '95.55', 95.6, '1 decimal'],
    [W2, '1.005', 1.01, '2 decimals'],
    [W1, '-3,2', -3.2, 'negative'],
  ])('BR-REC-76 box %s: "%s" rounds to %d (%s)', (id, text, expected) => {
    expect(out(input({ [id]: text }))?.values[id]).toBe(expected);
  });
  test('BR-REC-76 "abc" in a 1-decimal box -> "Enter a number like 95.5" on that box only', () => {
    expect(on(input({ [W1]: 'abc' }), `values.${W1}`)).toEqual(['Enter a number like 95.5']);
    expect(issues(input({ [W1]: 'abc' })).every((i) => i.path === `values.${W1}`)).toBe(true);
  });
  test('BR-REC-76 "abc" in a 2-decimal box -> "Enter a number like 95.5"', () => {
    expect(on(input({ [W2]: '1.2.3' }), `values.${W2}`)).toEqual(['Enter a number like 95.5']);
  });
  test('BR-REC-76 a bad whole-number box reports an issue on that box', () => {
    expect(on(input({ [W0]: 'x' }), `values.${W0}`).length).toBe(1);
  });
  test('BR-REC-76 a value above 999,999,999.999 after rounding is invalid', () => {
    expect(on(input({ [W0]: '999999999.6' }), `values.${W0}`).length).toBe(1);
  });
  test('BR-REC-76 every bad box is reported, each at its own path', () => {
    const paths = issues(input({ [W0]: 'x', [W1]: 'y' })).map((i) => i.path);
    expect(paths).toContain(`values.${W0}`);
    expect(paths).toContain(`values.${W1}`);
  });
});

describe('BR-REC-75 Time boxes (min and sec)', () => {
  test('BR-REC-75 2:02 is 122 seconds', () => {
    expect(out(input({ [T]: { min: '2', sec: '02' } }))?.values[T]).toBe(122);
  });
  test('BR-REC-75 only seconds typed counts (0 min)', () => {
    expect(out(input({ [T]: { min: '', sec: '45' } }))?.values[T]).toBe(45);
  });
  test('BR-REC-75 0:00 is a value (0), not blank', () => {
    expect(out(input({ [T]: { min: '0', sec: '0' } }))?.values[T]).toBe(0);
  });
  test('BR-REC-75 both boxes blank is null', () => {
    expect(out(input())?.values[T]).toBeNull();
  });
  test('BR-REC-75 seconds above 59 -> "Enter seconds from 0 to 59"', () => {
    expect(on(input({ [T]: { min: '1', sec: '75' } }), `values.${T}`)).toEqual([
      UI_TEXT.secondsRange,
    ]);
    expect(UI_TEXT.secondsRange).toBe('Enter seconds from 0 to 59');
  });
  test('BR-REC-75 minutes above 599 -> "Enter minutes from 0 to 599"', () => {
    expect(on(input({ [T]: { min: '600', sec: '0' } }), `values.${T}`)).toEqual([
      UI_TEXT.minutesRange,
    ]);
    expect(UI_TEXT.minutesRange).toBe('Enter minutes from 0 to 599');
  });
  test('BR-REC-75 599:59 is the largest Time and is accepted', () => {
    expect(out(input({ [T]: { min: '599', sec: '59' } }))?.values[T]).toBe(599 * 60 + 59);
  });
});

describe('BR-REC-79 / 83 the date', () => {
  test('BR-REC-79 today is accepted', () => {
    expect(issues(input({}, { date: TODAY }))).toEqual([]);
  });
  test('BR-REC-83 tomorrow is refused with the future-date sentence on the date', () => {
    expect(on(input({}, { date: '2026-10-04' }), 'date')).toEqual([
      messageForCode('DATE_IN_FUTURE'),
    ]);
  });
  test('BR-REC-83 the future-date sentence is the one for DATE_IN_FUTURE', () => {
    expect(messageForCode('DATE_IN_FUTURE')).toBe(
      'That date is in the future. Pick today or an earlier day.',
    );
  });
  test('BR-REC-79 an empty date -> "Pick a date"', () => {
    expect(on(input({}, { date: '' }), 'date')).toEqual(['Pick a date']);
  });
  test('BR-REC-79 a date before the member joined is only a warning, not a refusal', () => {
    expect(issues(input({}, { date: '2025-01-01' }))).toEqual([]);
  });
  test('BR-REC-79 About is kept as typed', () => {
    const r = schema.safeParse(input({}, { isEstimated: true }));
    expect(r.success && r.data.isEstimated).toBe(true);
  });
});
