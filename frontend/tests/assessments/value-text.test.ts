// Spec: docs/specs/member-records/assessments.md (v2), ux.md and setup.md
//   BR-REC-12 — durations are stored in seconds and shown as mm:ss; weights are stored in kg only.
//   BR-REC-127 — formats: "95.5 kg", "24.0 %"; times "2:02" or "1:05:30".
//   BR-REC-80 / R-1 — a saved result never shows fewer digits than it was stored with: stored values keep what
//               they were rounded to on their day, and changing a measurement's decimals later never touches
//               them (setup C9; the most ever stored is two digits).
// Interface (names and shapes only): `@/lib/assessments/valueText` — `storedValueText({ datatype, value, unit },
//   decimals | undefined)` -> string; `decimals` is the measurement's current setting, when known. A Time is
//   never followed by its "min:sec" unit.
import { describe, expect, test } from 'bun:test';
import { storedValueText } from '@/lib/assessments/valueText';

type Result = Parameters<typeof storedValueText>[0];
const number = (value: number, unit: string): Result => ({ datatype: 'number', value, unit });
const time = (value: number): Result => ({ datatype: 'duration', value, unit: 'min:sec' });

describe('BR-REC-12 / 127 a stored Time reads as m:ss or h:mm:ss, with no unit', () => {
  test.each<[number, string]>([
    [122, '2:02'],
    [45, '0:45'],
    [0, '0:00'],
    [60, '1:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3930, '1:05:30'],
    [35999, '9:59:59'],
  ])('BR-REC-12 %d seconds is "%s"', (seconds, expected) => {
    expect(storedValueText(time(seconds), undefined)).toBe(expected);
    expect(storedValueText(time(seconds), 0)).toBe(expected);
  });

  test('BR-REC-127 a Time is never followed by its "min:sec" unit', () => {
    const text = storedValueText(time(122), 0);
    expect(text).not.toContain('min');
    expect(text).not.toContain('sec');
  });
});

describe('BR-REC-127 a stored Number with its unit and the digits of the setting', () => {
  test.each<[string, number, string, number, string]>([
    ['weight', 95.5, 'kg', 1, '95.5 kg'],
    ['a percentage', 24, '%', 1, '24.0 %'],
    ['whole reps', 12, 'reps', 0, '12 reps'],
    ['two decimals', 7.25, 'cm', 2, '7.25 cm'],
    ['a whole value at one decimal', 95, 'kg', 1, '95.0 kg'],
    ['fewer digits than the setting are filled up (95.5 at 2 decimals)', 95.5, 'kg', 2, '95.50 kg'],
    ['a whole value at two decimals', 12, 'cm', 2, '12.00 cm'],
  ])('BR-REC-127 %s', (_name, value, unit, decimals, expected) => {
    expect(storedValueText(number(value, unit), decimals)).toBe(expected);
  });
});

describe('BR-REC-80 / setup C9 a stored value keeps every digit it was stored with', () => {
  test.each<[string, number, string, number, string]>([
    ['2 digits stored, setting now 1', 7.25, 'cm', 1, '7.25 cm'],
    ['2 digits stored, setting now 0', 7.25, 'cm', 0, '7.25 cm'],
    ['1 digit stored, setting now 0', 7.5, 'cm', 0, '7.5 cm'],
    ['2 digits stored, setting now 1 (weight)', 95.55, 'kg', 1, '95.55 kg'],
    ['1 digit stored, setting now 0 (a half is not rounded away)', 12.5, 'reps', 0, '12.5 reps'],
  ])('R-1 %s', (_name, value, unit, decimals, expected) => {
    expect(storedValueText(number(value, unit), decimals)).toBe(expected);
  });

  test('R-1 when the setting is not known the stored digits are shown as they are', () => {
    expect(storedValueText(number(95.5, 'kg'), undefined)).toBe('95.5 kg');
    expect(storedValueText(number(7.25, 'cm'), undefined)).toBe('7.25 cm');
  });

  test('R-1 over many values and settings the text never has fewer digits than the stored value', () => {
    const digitsAfterPoint = (text: string): number => text.split('.')[1]?.length ?? 0;
    const tooShort: string[] = [];
    for (const value of [95.5, 7.25, 12, 0.5, 100.05, 24, 3.75, 81.2]) {
      for (const decimals of [0, 1, 2, undefined]) {
        const text = storedValueText(number(value, 'x'), decimals);
        const shown = text.split(' ')[0] ?? '';
        if (digitsAfterPoint(shown) < digitsAfterPoint(String(value))) {
          tooShort.push(`${value}@${decimals} -> ${text}`);
        }
      }
    }
    expect(tooShort).toEqual([]);
  });
});
