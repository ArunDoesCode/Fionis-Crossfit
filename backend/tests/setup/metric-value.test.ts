import { describe, expect, test } from "bun:test";

import { roundMetricValue } from "../../src/lib/domain/metric-value";

// BR-REC-64 / setup.md C9: numbers are rounded to the measurement's decimals (0-2) when
// saved, half away from zero, working on the decimal digits (not on the binary float);
// durations are whole seconds. Pure function: no I/O, no clock.

type Decimals = 0 | 1 | 2;

describe("roundMetricValue: numbers", () => {
  const cases: [value: number, decimals: Decimals, expected: number][] = [
    // the spec's examples
    [95.56, 1, 95.6],
    [-2.25, 1, -2.3],
    [1.005, 2, 1.01],
    [2.5, 0, 3],
    [-2.5, 0, -3],
    [95.5, 0, 96],
    [12, 2, 12],
    // values that are already short are left alone
    [95.5, 1, 95.5],
    [95.56, 2, 95.56],
    [0, 1, 0],
    [172, 1, 172],
    // below the half rounds down, above rounds up (positive and negative)
    [95.54, 1, 95.5],
    [95.55, 1, 95.6],
    [-95.54, 1, -95.5],
    [-95.55, 1, -95.6],
    [95.4, 0, 95],
    [-95.4, 0, -95],
    [0.5, 0, 1],
    [-0.5, 0, -1],
    [0.4, 0, 0],
    // the decimals argument decides how much is kept
    [95.56, 0, 96],
    [95.556, 2, 95.56],
    [95.554, 2, 95.55],
    [1234.5678, 2, 1234.57],
    // halves that the binary float stores just below the half: the decimal digits decide
    [2.345, 2, 2.35],
    [1.255, 2, 1.26],
    [0.285, 2, 0.29],
    [1.45, 1, 1.5],
    [-1.005, 2, -1.01],
    [-1.255, 2, -1.26],
    // a carry into the next digit
    [99.95, 1, 100],
    [9.995, 2, 10],
    [-99.95, 1, -100],
    [0.995, 2, 1],
    // float noise from arithmetic
    [0.1 + 0.2, 1, 0.3],
    [0.1 + 0.2, 2, 0.3],
    // a half that is exact in binary, and a large value
    [123456789.125, 2, 123456789.13],
    [-123456789.125, 2, -123456789.13],
    // very small values (written with an exponent by JavaScript) round to zero
    [1e-7, 1, 0],
    [1e-7, 2, 0],
    [5e-7, 0, 0],
    // the check-range bounds of the contract
    [999999999.999, 2, 1000000000],
    [-999999999.999, 2, -1000000000],
  ];

  for (const [value, decimals, expected] of cases) {
    test(`BR-REC-64 ${value} to ${decimals} decimal(s) is ${expected}`, () => {
      expect(roundMetricValue(value, "number", decimals)).toBe(expected);
    });
  }

  test("BR-REC-64 a result of zero is 0, never -0", () => {
    for (const [value, decimals] of [
      [-0.4, 0],
      [-0.04, 1],
      [-0.004, 2],
      [-1e-7, 2],
      [-0, 1],
    ] as [number, Decimals][]) {
      const result = roundMetricValue(value, "number", decimals);
      expect(Object.is(result, 0), `${value} @${decimals} gave ${result}`).toBe(
        true,
      );
    }
  });

  test("BR-REC-64 a non-zero result never changes sign", () => {
    for (const value of [-0.5, -0.05, -0.005, -2.5, -95.55, -1234.5678]) {
      for (const decimals of [0, 1, 2] as Decimals[]) {
        const result = roundMetricValue(value, "number", decimals);
        if (result !== 0) expect(Math.sign(result)).toBe(-1);
      }
    }
    for (const value of [0.5, 0.05, 0.005, 2.5, 95.55, 1234.5678]) {
      for (const decimals of [0, 1, 2] as Decimals[]) {
        expect(
          roundMetricValue(value, "number", decimals),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("BR-REC-64 rounding twice gives the same value as rounding once", () => {
    for (const value of [95.56, -2.25, 1.005, 2.345, 99.95, 0.1 + 0.2]) {
      for (const decimals of [0, 1, 2] as Decimals[]) {
        const once = roundMetricValue(value, "number", decimals);
        expect(roundMetricValue(once, "number", decimals)).toBe(once);
      }
    }
  });
});

describe("roundMetricValue: durations", () => {
  const cases: [seconds: number, expected: number][] = [
    [122.4, 122],
    [122.5, 123],
    [122.49, 122],
    [122.6, 123],
    [122, 122],
    [0, 0],
    [0.4, 0],
    [0.5, 1],
    [59.5, 60],
    [3599.5, 3600],
    [5400, 5400],
  ];

  for (const [seconds, expected] of cases) {
    test(`BR-REC-64 a duration of ${seconds} s is stored as ${expected} whole seconds`, () => {
      expect(roundMetricValue(seconds, "duration", 0)).toBe(expected);
    });
  }

  test("BR-REC-64 the decimals argument is ignored for a duration", () => {
    for (const decimals of [0, 1, 2] as Decimals[]) {
      expect(roundMetricValue(122.456, "duration", decimals)).toBe(122);
      expect(roundMetricValue(122.5, "duration", decimals)).toBe(123);
      expect(roundMetricValue(122, "duration", decimals)).toBe(122);
    }
  });

  test("BR-REC-64 a duration of zero is 0, never -0", () => {
    expect(Object.is(roundMetricValue(-0, "duration", 0), 0)).toBe(true);
    expect(Object.is(roundMetricValue(-0.4, "duration", 0), 0)).toBe(true);
  });
});
