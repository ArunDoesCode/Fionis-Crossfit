// Spec: docs/specs/member-records/ux.md (v10) BR-REC-228 (Reports words, "same numbers") and BR-REC-229 (Report card).
//   - headline sentence: "17 of 20 members improved Body fat since their first reading"
//   - count line: "Based on 12 members (5 more have only one reading)"  (amends progress BR-REC-113's "n = 12 · 5 ...")
//   - the average: "Body fat down 2.0 % on average · better"  (better / worse from the measurement's direction,
//     no word when the measurement has none)
//   - Report card: a measurement with one reading shows "First reading" instead of dashes,
//     example "First reading · 81.7 kg".
// Interface: `@/lib/progress/text`. `notCountedText(n, notCounted)` and `ValueMetric` exist already. PROPOSED, not yet
// named in the spec, also exported there:
//   `improvedHeadline(improved: number, total: number, measurementName: string): string`
//   `averageChangeText(measurementName: string, change: number, metric: ValueMetric): string`
//   `firstReadingText(value: number, metric: ValueMetric): string`
import { beforeAll, describe, expect, test } from 'bun:test';

interface Metric {
  datatype: 'number' | 'duration';
  decimals: number;
  unit: string;
  better: 'higher' | 'lower' | 'none';
}
interface Mod {
  notCountedText(n: number, notCounted: number): string;
  improvedHeadline(improved: number, total: number, measurementName: string): string;
  averageChangeText(measurementName: string, change: number, metric: Metric): string;
  firstReadingText(value: number, metric: Metric): string;
}
let mod: Mod;
beforeAll(async () => {
  mod = (await import('@/lib/progress/text')) as unknown as Mod;
});

const bodyFat: Metric = { datatype: 'number', decimals: 1, unit: '%', better: 'lower' };
const weight: Metric = { datatype: 'number', decimals: 1, unit: 'kg', better: 'higher' };
const waist: Metric = { datatype: 'number', decimals: 1, unit: 'cm', better: 'none' };

describe('BR-REC-228 count line (amends BR-REC-113)', () => {
  test.each([
    [12, 5, 'Based on 12 members (5 more have only one reading)'], // spec example
    [100, 25, 'Based on 100 members (25 more have only one reading)'],
  ])('BR-REC-228 notCountedText(%d, %d) is "%s"', (n, notCounted, expected) => {
    expect(mod.notCountedText(n, notCounted)).toBe(expected);
  });
  test('BR-REC-228 nobody left out: the count line still starts "Based on 12 members" and has no brackets', () => {
    const shown = mod.notCountedText(12, 0);
    expect(shown.startsWith('Based on 12 members')).toBe(true);
    expect(shown).not.toContain('(');
    expect(shown).not.toContain('n = ');
  });
  test('BR-REC-228 the old wording "n = 12 ·" is gone', () => {
    expect(mod.notCountedText(12, 5)).not.toContain('n = ');
    expect(mod.notCountedText(12, 5)).not.toContain('not counted');
  });
});

describe('BR-REC-228 improvedHeadline', () => {
  test('BR-REC-228 "17 of 20 members improved Body fat since their first reading" (spec example)', () => {
    expect(mod.improvedHeadline(17, 20, 'Body fat')).toBe(
      '17 of 20 members improved Body fat since their first reading',
    );
  });
  test('BR-REC-228 names the measurement it is about', () => {
    expect(mod.improvedHeadline(3, 8, 'Weight')).toBe(
      '3 of 8 members improved Weight since their first reading',
    );
  });
});

describe('BR-REC-228 averageChangeText: better / worse from the direction, none when there is none', () => {
  test('BR-REC-228 lower is better, down 2.0 % -> "Body fat down 2.0 % on average · better" (spec example)', () => {
    expect(mod.averageChangeText('Body fat', -2, bodyFat)).toBe(
      'Body fat down 2.0 % on average · better',
    );
  });
  test('BR-REC-228 lower is better, up 1.5 % -> "up ... · worse"', () => {
    expect(mod.averageChangeText('Body fat', 1.5, bodyFat)).toBe(
      'Body fat up 1.5 % on average · worse',
    );
  });
  test('BR-REC-228 higher is better, up 0.8 kg -> "· better"', () => {
    expect(mod.averageChangeText('Weight', 0.8, weight)).toBe(
      'Weight up 0.8 kg on average · better',
    );
  });
  test('BR-REC-228 higher is better, down 0.8 kg -> "· worse"', () => {
    expect(mod.averageChangeText('Weight', -0.8, weight)).toBe(
      'Weight down 0.8 kg on average · worse',
    );
  });
  test('BR-REC-228 no direction: no better / worse word', () => {
    const shown = mod.averageChangeText('Waist', -1.2, waist);
    expect(shown).toBe('Waist down 1.2 cm on average');
    expect(shown).not.toMatch(/better|worse/);
  });
});

describe('BR-REC-229 firstReadingText: one reading shows "First reading", never dashes', () => {
  test('BR-REC-229 "First reading · 81.7 kg" (spec example)', () => {
    expect(mod.firstReadingText(81.7, weight)).toBe('First reading · 81.7 kg');
  });
  test('BR-REC-229 uses the measurement precision and unit: 24 % at 1 decimal', () => {
    expect(mod.firstReadingText(24, bodyFat)).toBe('First reading · 24.0 %');
  });
  test('BR-REC-229 no dashes', () => {
    expect(mod.firstReadingText(81.7, weight)).not.toMatch(/^[—–-]|[—–-]$/);
  });
});
