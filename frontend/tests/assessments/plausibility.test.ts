// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-21 — a value that jumps more than 30% from the previous one, or falls outside the metric's min/max,
//               shows "please confirm" but can still be saved. Example: visceral fat 8 -> 17.5 -> warning.
//   BR-REC-82 — jump = |new - previous| / |previous| over 30% (skipped if no previous or previous is 0).
//   D14       — the jump is strictly over 30% (exactly 30% is fine), or the value is below the measurement's
//               min / above its max when those are set; both can apply.
// Interface: docs/specs/member-records/assessments.md —
//   `@/lib/assessments/plausibility`: `checkPlausibility({ value, previous, plausibleMin, plausibleMax })` ->
//   `{ warn, reasons }`; all four inputs `number | null`; `value` null -> no warning; `reasons` order:
//   `jump` then `range`; equal to the min or the max is fine.
import { beforeAll, describe, expect, test } from 'bun:test';

type Reason = 'jump' | 'range';
interface Input {
  value: number | null;
  previous: number | null;
  plausibleMin: number | null;
  plausibleMax: number | null;
}
interface Plausibility {
  checkPlausibility(input: Input): { warn: boolean; reasons: Reason[] };
}

let plausibility: Plausibility;

beforeAll(async () => {
  plausibility = (await import('@/lib/assessments/plausibility')) as unknown as Plausibility;
});

/** value, previous, min, max -> the expected reasons ([] = no warning). */
type Row = [value: number | null, previous: number | null, min: number | null, max: number | null];

const expectReasons = (row: Row, reasons: Reason[]) => {
  const [value, previous, plausibleMin, plausibleMax] = row;
  expect(plausibility.checkPlausibility({ value, previous, plausibleMin, plausibleMax })).toEqual({
    warn: reasons.length > 0,
    reasons,
  });
};

describe('BR-REC-21 / 82 a jump of more than 30% warns', () => {
  test.each<[string, Row]>([
    ['visceral fat 8 -> 17.5 (spec example)', [17.5, 8, null, null]],
    ['up by 31%', [131, 100, null, null]],
    ['down by 31%', [69, 100, null, null]],
    ['up to double', [20, 10, null, null]],
    ['down to zero', [0, 10, null, null]],
    ['up by 40% from 10', [14, 10, null, null]],
    ['down by 40% from 10', [6, 10, null, null]],
    ['negative previous, 40% further', [-14, -10, null, null]],
    ['negative previous, 40% back', [-6, -10, null, null]],
    ['sign flips (positive to negative)', [-5, 10, null, null]],
    ['sign flips (negative to positive)', [5, -10, null, null]],
    ['small numbers still count in percent', [0.3, 0.1, null, null]],
    ['a plank of 2:30 after 1:50 (150 vs 110 s)', [150, 110, null, null]],
  ])('BR-REC-82 %s', (_name, row) => {
    expectReasons(row, ['jump']);
  });
});

describe('BR-REC-21 / 82 / D14 a change of 30% or less does not warn', () => {
  test.each<[string, Row]>([
    ['weight 95.5 -> 94 (about 1.6%)', [94, 95.5, null, null]],
    ['no change', [10, 10, null, null]],
    ['exactly +30% (100 -> 130)', [130, 100, null, null]],
    ['exactly -30% (100 -> 70)', [70, 100, null, null]],
    ['exactly +30% (10 -> 13)', [13, 10, null, null]],
    ['exactly -30% (10 -> 7)', [7, 10, null, null]],
    ['exactly +30% (50 -> 65)', [65, 50, null, null]],
    ['exactly +30% (20 -> 26)', [26, 20, null, null]],
    ['exactly 30% with a negative previous (-10 -> -13)', [-13, -10, null, null]],
    ['exactly 30% with a negative previous (-10 -> -7)', [-7, -10, null, null]],
    ['just under 30% (100 -> 129.9)', [129.9, 100, null, null]],
    ['just under 30% going down (100 -> 70.1)', [70.1, 100, null, null]],
  ])('D14 %s', (_name, row) => {
    expectReasons(row, []);
  });

  // Typed values carry up to 2 decimals; "exactly 30%" is exact in decimal, so binary float noise
  // (10.4 - 8 = 2.4000000000000004) must not tip it over.
  test.each<[string, Row]>([
    ['8 -> 10.4', [10.4, 8, null, null]],
    ['4 -> 5.2', [5.2, 4, null, null]],
    ['2 -> 2.6', [2.6, 2, null, null]],
    ['0.1 -> 0.13', [0.13, 0.1, null, null]],
    ['11 -> 7.7', [7.7, 11, null, null]],
    ['24 -> 31.2', [31.2, 24, null, null]],
    ['95.5 -> 124.15', [124.15, 95.5, null, null]],
  ])('D14 exactly 30% with decimals is fine (%s)', (_name, row) => {
    expectReasons(row, []);
  });

  test('D14 a hair over 30% with decimals does warn (8 -> 10.41)', () => {
    expectReasons([10.41, 8, null, null], ['jump']);
  });
});

describe('BR-REC-82 the jump is skipped without a usable previous value', () => {
  test.each<[string, Row]>([
    ['no previous', [500, null, null, null]],
    ['previous is 0', [5, 0, null, null]],
    ['both are 0', [0, 0, null, null]],
    ['previous is 0 and the value is huge', [1000000, 0, null, null]],
  ])('BR-REC-82 %s -> no warning', (_name, row) => {
    expectReasons(row, []);
  });
});

describe('BR-REC-21 / D14 a value outside the min / max warns', () => {
  test.each<[string, Row]>([
    ['below the min', [-1, null, 0, null]],
    ['just below the min', [9.9, null, 10, 60]],
    ['far below the min', [5, null, 10, 60]],
    ['above the max', [100.1, null, null, 100]],
    ['far above the max', [61, null, 10, 60]],
    ['below a negative min', [-15, null, -10, 10]],
    ['below the min with a previous of 0 (no jump)', [-1, 0, 0, null]],
  ])('D14 %s', (_name, row) => {
    expectReasons(row, ['range']);
  });

  test.each<[string, Row]>([
    ['equal to the min', [0, null, 0, null]],
    ['equal to the max', [100, null, null, 100]],
    ['equal to both ends', [10, null, 10, 10]],
    ['inside the range', [50, null, 10, 60]],
    ['no min and no max', [-1000, null, null, null]],
    ['only a max, far below it', [-1000, null, null, 100]],
    ['only a min, far above it', [1000000, null, 0, null]],
    ['negative min, value inside', [-10, null, -10, 10]],
  ])('D14 %s -> no warning', (_name, row) => {
    expectReasons(row, []);
  });
});

describe('BR-REC-21 / D14 both reasons can apply, listed jump first then range', () => {
  test('D14 jump and range together: 8 -> 200 with a max of 100', () => {
    expectReasons([200, 8, 0, 100], ['jump', 'range']);
  });

  test('D14 jump and range together, below the min: 100 -> 5 with a min of 10', () => {
    expectReasons([5, 100, 10, null], ['jump', 'range']);
  });

  test('D14 a jump inside the range gives the jump only', () => {
    expectReasons([17.5, 8, 0, 100], ['jump']);
  });

  test('D14 a value outside the range without a jump gives the range only', () => {
    expectReasons([105, 100, 0, 100], ['range']);
  });
});

describe('BR-REC-21 an empty field has nothing to check', () => {
  test.each<[string, Row]>([
    ['no value, with a previous', [null, 8, null, null]],
    ['no value, with limits', [null, 8, 0, 10]],
    ['no value, nothing else', [null, null, null, null]],
  ])('BR-REC-21 %s -> no warning', (_name, row) => {
    expectReasons(row, []);
  });
});
