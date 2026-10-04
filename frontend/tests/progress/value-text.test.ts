// Spec: docs/specs/member-records/progress.md (v2)
//   BR-REC-22  per metric first / latest / best / change. Example: Fran 5:20 -> 4:10 -> best 4:10, change -1:10.
//   BR-REC-106 each measurement shows first and latest, best, change since first (sign, unit, "better" / "worse").
//   BR-REC-107 "No direction" shows no best (and so no better / worse in the change).
//   BR-REC-111 the average change is shown in the unit. Example: Body fat, Female -> avg -1.8 %.
//   S12 sketch: Weight kg 98.0 -> 94.0, "v 4.0 better"; Height cm 172.0 -> 172.5, "+0.5"; Fran "v 1:10 better".
//   BR-REC-127 (ux.md) formats: "95.5 kg", "24.0 %", times "2:02" or "1:05:30".
//   BR-REC-117 Plank 122 s -> display 2:02.
// Interface: .pipeline/member-records-progress/contract.md "Admin app interfaces" — `@/lib/progress/text`:
//   `valueText`, `signedValueText` (minus is U+2212), `changeText` (arrows U+2191 / U+2193).
//   `metric` = { datatype, decimals, unit, better }.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Metric {
  datatype: 'number' | 'duration';
  decimals: 0 | 1 | 2;
  unit: string;
  better: 'higher' | 'lower' | 'none';
}

interface Text {
  valueText(value: number, metric: Metric): string;
  signedValueText(value: number, metric: Metric): string;
  changeText(change: number | null, metric: Metric): string | null;
}

let text: Text;

beforeAll(async () => {
  text = (await import('@/lib/progress/text')) as unknown as Text;
});

const MINUS = '−';

const weight: Metric = { datatype: 'number', decimals: 1, unit: 'kg', better: 'lower' };
const bodyFat: Metric = { datatype: 'number', decimals: 1, unit: '%', better: 'lower' };
const reps: Metric = { datatype: 'number', decimals: 0, unit: 'reps', better: 'higher' };
const height: Metric = { datatype: 'number', decimals: 1, unit: 'cm', better: 'none' };
const girth: Metric = { datatype: 'number', decimals: 2, unit: 'cm', better: 'none' };
const squat: Metric = { datatype: 'number', decimals: 1, unit: 'kg', better: 'higher' };
const fran: Metric = { datatype: 'duration', decimals: 0, unit: 'sec', better: 'lower' };
const plank: Metric = { datatype: 'duration', decimals: 0, unit: 'sec', better: 'higher' };

describe('BR-REC-127 valueText', () => {
  test.each([
    [98, weight, '98.0 kg'], // S12 sketch: Weight first
    [94, weight, '94.0 kg'], // S12 sketch: Weight latest
    [172.5, height, '172.5 cm'],
    [24, bodyFat, '24.0 %'], // spec format "24.0 %"
    [95.5, weight, '95.5 kg'], // spec format "95.5 kg"
    [102, weight, '102.0 kg'],
    [12, reps, '12 reps'],
    [12.6, reps, '13 reps'],
    [7.256, girth, '7.26 cm'],
    [3, girth, '3.00 cm'],
  ] as [number, Metric, string][])(
    'BR-REC-127 valueText(%d, %o) is "%s"',
    (value, metric, expected) => {
      expect(text.valueText(value, metric)).toBe(expected);
    },
  );

  test.each([
    [320, fran, '5:20'], // BR-REC-22: Fran first
    [250, fran, '4:10'], // BR-REC-22: Fran latest / best
    [122, plank, '2:02'], // BR-REC-117: Plank 122 s -> 2:02
    [45, fran, '0:45'],
    [3930, fran, '1:05:30'], // spec format "1:05:30"
    [3600, fran, '1:00:00'],
  ] as [number, Metric, string][])(
    'BR-REC-127 valueText(%d s, duration) is "%s" and never adds the unit',
    (value, metric, expected) => {
      expect(text.valueText(value, metric)).toBe(expected);
      expect(text.valueText(value, metric)).not.toContain(metric.unit);
    },
  );

  test('BR-REC-127 a time is shown to the nearest whole second', () => {
    expect(text.valueText(249.6, fran)).toBe('4:10');
    expect(text.valueText(249.4, fran)).toBe('4:09');
  });

  test('BR-REC-127 a time with decimals set on the measurement is still min:sec', () => {
    expect(text.valueText(250, { ...fran, decimals: 1 })).toBe('4:10');
  });
});

describe('BR-REC-22 / 111 signedValueText', () => {
  test.each([
    [0.5, height, '+0.5 cm'], // S12 sketch: Height change +0.5
    [4, weight, '+4.0 kg'],
    [-4, weight, `${MINUS}4.0 kg`], // S12 sketch: Weight change 4.0 down
    [-1.8, bodyFat, `${MINUS}1.8 %`], // BR-REC-111 example: avg -1.8 %
    [-2.1, bodyFat, `${MINUS}2.1 %`], // BR-REC-23 example: avg -2.1
    [3, reps, '+3 reps'],
    [-3, reps, `${MINUS}3 reps`],
    [0.01, girth, '+0.01 cm'],
    [-0.25, girth, `${MINUS}0.25 cm`],
    [-70, fran, `${MINUS}1:10`], // BR-REC-22: Fran change -1:10
    [70, fran, '+1:10'],
    [-3930, fran, `${MINUS}1:05:30`],
  ] as [number, Metric, string][])(
    'BR-REC-22 signedValueText(%d, %o) is "%s"',
    (value, metric, expected) => {
      expect(text.signedValueText(value, metric)).toBe(expected);
    },
  );

  test.each([
    [-4, weight],
    [-1.8, bodyFat],
    [-70, fran],
    [-3, reps],
  ] as [number, Metric][])(
    'BR-REC-22 a negative value %d uses the real minus sign (U+2212), not a hyphen',
    (value, metric) => {
      const shown = text.signedValueText(value, metric);
      expect(shown.startsWith(MINUS)).toBe(true);
      expect(shown).not.toContain('-');
    },
  );

  test.each([
    [0, weight, '0.0 kg'],
    [-0, weight, '0.0 kg'],
    [0.04, weight, '0.0 kg'], // shows as zero at one decimal
    [-0.04, weight, '0.0 kg'], // no "-0.0 kg"
    [0.4, reps, '0 reps'],
    [-0.4, reps, '0 reps'],
    [0.004, girth, '0.00 cm'],
    [-0.004, girth, '0.00 cm'],
  ] as [number, Metric, string][])(
    'BR-REC-22 a value that shows as zero, signedValueText(%d, %o), is "%s" with no sign',
    (value, metric, expected) => {
      expect(text.signedValueText(value, metric)).toBe(expected);
    },
  );

  test.each([[0.4], [-0.4], [0]])(
    'BR-REC-22 a time of %d s that shows as zero has no sign',
    (value) => {
      expect(text.signedValueText(value, fran)).toBe(text.valueText(0, fran));
      expect(text.signedValueText(value, fran)).not.toMatch(/^[+−-]/);
    },
  );

  test.each([
    [0.06, weight, '+0.1 kg'],
    [-0.06, weight, `${MINUS}0.1 kg`],
    [0.6, reps, '+1 reps'],
    [-0.6, reps, `${MINUS}1 reps`],
    [0.006, girth, '+0.01 cm'],
    [-0.006, girth, `${MINUS}0.01 cm`],
    [0.6, fran, '+0:01'],
    [-0.6, fran, `${MINUS}0:01`],
  ] as [number, Metric, string][])(
    'BR-REC-22 a value that still shows a digit, signedValueText(%d, %o), keeps its sign: "%s"',
    (value, metric, expected) => {
      expect(text.signedValueText(value, metric)).toBe(expected);
    },
  );
});

describe('BR-REC-22 / 106 / 107 changeText', () => {
  test.each([[weight], [bodyFat], [reps], [height], [fran], [plank]])(
    'BR-REC-22 a change of null (fewer than two readings) has no text: %o',
    (metric) => {
      expect(text.changeText(null, metric)).toBeNull();
    },
  );

  test.each([
    [0, weight],
    [0.04, weight],
    [-0.04, weight],
    [0, reps],
    [0.4, reps],
    [-0.4, reps],
    [0.004, girth],
    [0, fran],
    [0.4, fran],
    [-0.4, plank],
    [0, height], // "No direction": still "No change" when nothing moved
    [0.04, height],
    [-0.04, height],
    [0, squat],
  ] as [number, Metric][])(
    'BR-REC-106 a change of %d that shows as zero is "No change" (%o)',
    (change, metric) => {
      expect(text.changeText(change, metric)).toBe('No change');
    },
  );

  test.each([
    [-4, weight, '↓ 4.0 kg better'], // S12 sketch: Weight 98.0 -> 94.0, lower is better
    [-70, fran, '↓ 1:10 better'], // BR-REC-22: Fran 5:20 -> 4:10, lower is better
    [-1.5, bodyFat, '↓ 1.5 % better'],
    [-3, { ...reps, better: 'lower' } as Metric, '↓ 3 reps better'],
  ] as [number, Metric, string][])(
    'BR-REC-106 changeText(%d, %o) is "%s" (went down, lower is better)',
    (change, metric, expected) => {
      expect(text.changeText(change, metric)).toBe(expected);
    },
  );

  test.each([
    [1.2, bodyFat, '↑ 1.2 % worse'], // contract example: up, lower is better
    [70, fran, '↑ 1:10 worse'],
    [2, weight, '↑ 2.0 kg worse'],
  ] as [number, Metric, string][])(
    'BR-REC-106 changeText(%d, %o) is "%s" (went up, lower is better)',
    (change, metric, expected) => {
      expect(text.changeText(change, metric)).toBe(expected);
    },
  );

  test.each([
    [2, reps, '↑ 2 reps better'], // contract example shape: up, higher is better
    [20, squat, '↑ 20.0 kg better'],
    [30, plank, '↑ 0:30 better'],
  ] as [number, Metric, string][])(
    'BR-REC-106 changeText(%d, %o) is "%s" (went up, higher is better)',
    (change, metric, expected) => {
      expect(text.changeText(change, metric)).toBe(expected);
    },
  );

  test.each([
    [-3, reps, '↓ 3 reps worse'],
    [-5, squat, '↓ 5.0 kg worse'],
    [-45, plank, '↓ 0:45 worse'],
  ] as [number, Metric, string][])(
    'BR-REC-106 changeText(%d, %o) is "%s" (went down, higher is better)',
    (change, metric, expected) => {
      expect(text.changeText(change, metric)).toBe(expected);
    },
  );

  test.each([
    [-4, weight],
    [1.2, bodyFat],
    [-70, fran],
    [2, reps],
  ] as [number, Metric][])(
    'BR-REC-106 the size in a better / worse line is the plain amount: no sign or hyphen (%d, %o)',
    (change, metric) => {
      const shown = text.changeText(change, metric) ?? '';
      expect(shown).not.toContain('-');
      expect(shown).not.toContain(MINUS);
      expect(shown).not.toContain('+');
    },
  );

  test.each([
    [0.5, height, '+0.5 cm'], // S12 sketch: Height 172.0 -> 172.5 shows "+0.5"
    [-0.5, height, `${MINUS}0.5 cm`],
    [3.25, girth, '+3.25 cm'],
    [-12, { ...height, decimals: 0 } as Metric, `${MINUS}12 cm`],
  ] as [number, Metric, string][])(
    'BR-REC-107 "No direction": changeText(%d, %o) is the signed change "%s" with no better or worse',
    (change, metric, expected) => {
      const shown = text.changeText(change, metric);
      expect(shown).toBe(expected);
      expect(shown).not.toMatch(/better|worse/);
      expect(shown).not.toMatch(/[↑↓]/);
    },
  );

  test('BR-REC-106 just above what shows as zero it is a real change: 0.06 kg more is worse for weight', () => {
    expect(text.changeText(0.06, weight)).toBe('↑ 0.1 kg worse');
    expect(text.changeText(-0.06, weight)).toBe('↓ 0.1 kg better');
  });
});
