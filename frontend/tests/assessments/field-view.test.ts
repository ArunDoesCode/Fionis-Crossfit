// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-20 — the entry form shows the previous value and the change next to each field, in the configured
//               unit ("prev 95.5 kg").
//   BR-REC-21 / D14 — "Please check": a jump strictly over 30%, or a value outside the measurement's min / max;
//               both can apply; one line under the field.
//   BR-REC-80 — an estimated date shows as "≈ Dec 2025".
//   BR-REC-81 — change = this - previous with sign and unit, arrow, "better" / "worse".
//   BR-REC-82 — the "Check these values" sheet lists every flagged field (one sheet, both odd values).
//   BR-REC-76 — number text goes through the number parser; blank is not recorded.
//   BR-REC-127 — formats: "95.5 kg", "24.0 %", times "2:02" or "1:05:30"; this year's days without the year.
// Interface (names and shapes only): `@/lib/assessments/fieldView` — `readField(metric, input)` ->
//   `{ value, blank, invalid }`; `formatMetricValue(metric, value)`; `previousLine(metric, today)` ("Last 95.5 kg
//   · 12 Sep", or null); `changeFor(metric, value)`; `warningFor(metric, value)` ("Please check ..." or null);
//   `flaggedFields(metrics, inputs)` -> `{ metricId, line }[]` in screen order. E25 metric shape from
//   `@/lib/assessments/types`. Contract S10: `previous` line "Last 95.5 kg · 12 Sep".
import { describe, expect, test } from 'bun:test';
import {
  changeFor,
  flaggedFields,
  formatMetricValue,
  previousLine,
  readField,
  warningFor,
} from '@/lib/assessments/fieldView';
import type { EntryMetric } from '@/lib/assessments/types';

const TODAY = '2026-10-03';
const MINUS = '−';
const ABOUT = '≈';

const metric = (over: Partial<EntryMetric> & Pick<EntryMetric, 'id' | 'name'>): EntryMetric => ({
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

const WEIGHT = metric({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Weight',
  unit: 'kg',
  decimals: 1,
  better: 'lower',
  previous: { value: 95.5, on: '2026-09-12', isEstimated: false },
});
const FAT = metric({
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Visceral fat',
  unit: 'level',
  decimals: 1,
  better: 'lower',
  previous: { value: 8, on: '2026-09-12', isEstimated: false },
});
const PLANK = metric({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Plank',
  unit: 'min:sec',
  datatype: 'duration',
  decimals: 0,
  better: 'higher',
  previous: { value: 110, on: '2026-09-12', isEstimated: false },
});
const MUSCLE = metric({
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Muscle',
  unit: '%',
  decimals: 1,
  better: 'higher',
});
const NO_PREVIOUS_LIMITED = metric({
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Body fat',
  unit: '%',
  decimals: 1,
  better: 'lower',
  plausibleMin: 5,
  plausibleMax: 60,
});

describe('BR-REC-76 readField: what a box holds', () => {
  test.each<[string, string, number | null, boolean, boolean]>([
    // [name, text, value, blank, invalid]
    ['a dot number', '95.5', 95.5, false, false],
    ['a comma number', '95,5', 95.5, false, false],
    ['rounded to the decimals', '95.56', 95.6, false, false],
    ['a whole number', '94', 94, false, false],
    ['a negative number', '-3.2', -3.2, false, false],
    ['an empty box', '', null, true, false],
    ['spaces only', '   ', null, true, false],
    ['letters', 'abc', null, false, true],
    ['two marks', '95.5.5', null, false, true],
    ['a lone minus', '-', null, false, true],
  ])('BR-REC-76 Number %s', (_name, text, value, blank, invalid) => {
    expect(readField(WEIGHT, text)).toEqual({ value, blank, invalid });
  });

  test('BR-REC-76 a Number box that was never filled is blank', () => {
    expect(readField(WEIGHT, undefined)).toEqual({ value: null, blank: true, invalid: false });
    expect(readField(WEIGHT, null)).toEqual({ value: null, blank: true, invalid: false });
  });

  test('BR-REC-76 the number is rounded to the measurement decimals (0 decimals: "2.5" is 3)', () => {
    const reps = metric({ id: '66666666-6666-4666-8666-666666666666', name: 'Reps', decimals: 0 });
    expect(readField(reps, '2.5').value).toBe(3);
  });

  test.each<[string, number | null, number | null, boolean]>([
    ['2:02', 122, 122, false],
    ['a Time of 0 seconds', 0, 0, false],
    ['an empty Time', null, null, true],
    ['a Time never filled', null, null, true],
  ])('BR-REC-75 Time %s', (_name, input, value, blank) => {
    expect(readField(PLANK, input)).toEqual({ value, blank, invalid: false });
  });

  test('BR-REC-75 a Time that was never touched is blank', () => {
    expect(readField(PLANK, undefined)).toEqual({ value: null, blank: true, invalid: false });
  });
});

describe('BR-REC-127 formatMetricValue', () => {
  test.each<[string, EntryMetric, number, string]>([
    ['weight', WEIGHT, 95.5, '95.5 kg'],
    ['a whole weight keeps its decimals', WEIGHT, 95, '95.0 kg'],
    ['a percentage', MUSCLE, 24, '24.0 %'],
    ['a level', FAT, 8, '8.0 level'],
    ['a Time', PLANK, 122, '2:02'],
    ['a Time of 0 seconds', PLANK, 0, '0:00'],
    ['a Time of an hour or more', PLANK, 3930, '1:05:30'],
  ])('BR-REC-127 %s', (_name, m, value, expected) => {
    expect(formatMetricValue(m, value)).toBe(expected);
  });

  test('BR-REC-127 a Time never carries its unit ("min:sec")', () => {
    expect(formatMetricValue(PLANK, 122)).not.toContain('min');
    expect(formatMetricValue(PLANK, 122)).not.toContain('sec');
  });
});

describe('BR-REC-20 / 80 previousLine: "Last 95.5 kg · 12 Sep"', () => {
  test('BR-REC-20 value, unit and the day it was recorded (this year: no year)', () => {
    expect(previousLine(WEIGHT, TODAY)).toBe('Last 95.5 kg · 12 Sep 2026');
  });

  test('BR-REC-127 a day from another year shows the year', () => {
    const old = { ...WEIGHT, previous: { value: 97, on: '2025-12-30', isEstimated: false } };
    expect(previousLine(old, TODAY)).toBe('Last 97.0 kg · 30 Dec 2025');
  });

  test('BR-REC-80 an estimated day reads "≈ Dec 2025"', () => {
    const estimated = { ...WEIGHT, previous: { value: 97, on: '2025-12-01', isEstimated: true } };
    expect(previousLine(estimated, TODAY)).toBe(`Last 97.0 kg · ${ABOUT} Dec 2025`);
  });

  test('BR-REC-20 a Time reads as m:ss', () => {
    expect(previousLine(PLANK, TODAY)).toBe('Last 1:50 · 12 Sep 2026');
  });

  test('BR-REC-20 no previous value, no line', () => {
    expect(previousLine(MUSCLE, TODAY)).toBeNull();
  });
});

describe('BR-REC-20 / 81 changeFor: the live change line', () => {
  test('BR-REC-81 weight 95.5 -> 94, lower is better (spec example)', () => {
    expect(changeFor(WEIGHT, 94)).toEqual({
      arrow: 'down',
      amount: `${MINUS}1.5 kg`,
      verdict: 'better',
    });
  });

  test('BR-REC-81 plank 1:50 -> 2:02, higher is better (spec example)', () => {
    expect(changeFor(PLANK, 122)).toEqual({ arrow: 'up', amount: '+0:12', verdict: 'better' });
  });

  test('BR-REC-81 the same value is "No change"', () => {
    expect(changeFor(WEIGHT, 95.5)).toEqual({ arrow: 'none', amount: 'No change', verdict: null });
  });

  test('BR-REC-81 nothing typed: no change line', () => {
    expect(changeFor(WEIGHT, null)).toBeNull();
  });

  test('BR-REC-20 no previous value: no change line', () => {
    expect(changeFor(MUSCLE, 24)).toBeNull();
  });

  test('BR-REC-81 a measurement with no direction has the amount but no word', () => {
    const neutral = { ...WEIGHT, better: 'none' as const };
    expect(changeFor(neutral, 96)).toEqual({ arrow: 'up', amount: '+0.5 kg', verdict: null });
  });
});

describe('BR-REC-21 / D14 warningFor: one "Please check" line, or nothing', () => {
  test('BR-REC-21 visceral fat 8 -> 17.5 says "Please check" and what it was last time (spec example)', () => {
    const line = warningFor(FAT, 17.5);
    expect(line).not.toBeNull();
    expect(line).toContain('Please check');
    expect(line).toContain('last time 8');
  });

  test('BR-REC-127 a Time that jumped names the last time as m:ss', () => {
    const line = warningFor(PLANK, 200); // 3:20 after 1:50, +82%
    expect(line).toContain('Please check');
    expect(line).toContain('1:50');
  });

  test.each<[string, EntryMetric, number | null]>([
    ['a normal change', WEIGHT, 94],
    ['no change', WEIGHT, 95.5],
    ['exactly +30% (8 -> 10.4)', FAT, 10.4],
    ['nothing typed', FAT, null],
    ['a Time that moved a little', PLANK, 122],
    ['a value inside the limits (no previous)', NO_PREVIOUS_LIMITED, 24],
    ['a value on the limit', NO_PREVIOUS_LIMITED, 60],
    ['no previous and no limits', MUSCLE, 500],
  ])('D14 %s -> no warning', (_name, m, value) => {
    expect(warningFor(m, value)).toBeNull();
  });

  test('D14 a value above the max says "Please check" and names the max', () => {
    const line = warningFor(NO_PREVIOUS_LIMITED, 70);
    expect(line).toContain('Please check');
    expect(line).toContain('60');
  });

  test('D14 a value below the min says "Please check" and names the min', () => {
    const line = warningFor(NO_PREVIOUS_LIMITED, 3);
    expect(line).toContain('Please check');
    expect(line).toContain('5');
  });

  test('D14 a jump and a limit together stay one line that names both', () => {
    const both = { ...FAT, plausibleMin: 0, plausibleMax: 100 };
    const line = warningFor(both, 200);
    expect(line).toContain('Please check');
    expect(line).toContain('last time 8');
    expect(line).toContain('100');
    expect(line).not.toContain('\n');
  });

  test('D14 the line is one line', () => {
    expect(warningFor(FAT, 17.5)).not.toContain('\n');
  });
});

describe('BR-REC-82 flaggedFields: every odd value, for the one "Check these values" sheet', () => {
  const METRICS = [WEIGHT, FAT, PLANK, NO_PREVIOUS_LIMITED];

  test('BR-REC-82 two odd values are both listed (spec example), in screen order', () => {
    const flagged = flaggedFields(METRICS, {
      [WEIGHT.id]: '94',
      [FAT.id]: '17.5',
      [PLANK.id]: 200,
    });
    expect(flagged.map((field) => field.metricId)).toEqual([FAT.id, PLANK.id]);
  });

  test('BR-REC-82 a line names the measurement, the value and the last time', () => {
    const [fat] = flaggedFields(METRICS, { [FAT.id]: '17.5' });
    expect(fat?.line).toContain('Visceral fat');
    expect(fat?.line).toContain('17.5');
    expect(fat?.line).toContain('last time');
  });

  test('BR-REC-127 a Time line shows both times as m:ss', () => {
    const [plank] = flaggedFields(METRICS, { [PLANK.id]: 200 });
    expect(plank?.line).toContain('Plank');
    expect(plank?.line).toContain('3:20');
    expect(plank?.line).toContain('1:50');
  });

  test('BR-REC-82 the order follows the form, not the order the values were typed', () => {
    const flagged = flaggedFields(METRICS, {
      [PLANK.id]: 200,
      [NO_PREVIOUS_LIMITED.id]: '70',
      [FAT.id]: '17.5',
    });
    expect(flagged.map((field) => field.metricId)).toEqual([
      FAT.id,
      PLANK.id,
      NO_PREVIOUS_LIMITED.id,
    ]);
  });

  test('D14 a value outside its limits is listed too', () => {
    const flagged = flaggedFields(METRICS, { [NO_PREVIOUS_LIMITED.id]: '3' });
    expect(flagged.map((field) => field.metricId)).toEqual([NO_PREVIOUS_LIMITED.id]);
  });

  test('BR-REC-82 nothing odd: nothing listed', () => {
    expect(flaggedFields(METRICS, { [WEIGHT.id]: '94', [PLANK.id]: 122 })).toEqual([]);
  });

  test('BR-REC-82 blank boxes and boxes never filled are not listed', () => {
    expect(flaggedFields(METRICS, { [FAT.id]: '', [PLANK.id]: null })).toEqual([]);
    expect(flaggedFields(METRICS, {})).toEqual([]);
  });

  test('BR-REC-76 a box that is not a number is not "odd" (it has its own error)', () => {
    expect(flaggedFields(METRICS, { [FAT.id]: 'abc', [WEIGHT.id]: '-' })).toEqual([]);
  });

  test('BR-REC-82 no measurements, nothing listed', () => {
    expect(flaggedFields([], { [FAT.id]: '17.5' })).toEqual([]);
  });
});
