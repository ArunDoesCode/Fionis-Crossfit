import { describe, expect, test } from "bun:test";

import { bestReading, summariseReadings } from "../../../src/lib/domain/report";

// BR-REC-107 (best by direction, earliest date on a tie, no best for "No direction"),
// BR-REC-22 (first / latest / best / change) and P2 of the progress spec (change rounded to
// 3 decimals, null under 2 readings, points = the last 12 readings oldest first).
// Pure functions: no database. Times are seconds (Fran 5:20 = 320 s, 4:10 = 250 s).

type Reading = { value: number; on: string; isEstimated: boolean };
const r = (value: number, on: string, isEstimated = false): Reading => ({
  value,
  on,
  isEstimated,
});

const day = (n: number): string =>
  new Date(Date.UTC(2025, 0, 1 + n)).toISOString().slice(0, 10);

describe("BR-REC-107 best reading", () => {
  const cases: [string, Reading[], "higher" | "lower", Reading][] = [
    [
      "higher: the highest value",
      [r(90, "2026-01-10"), r(100, "2026-02-10"), r(95, "2026-03-10")],
      "higher",
      r(100, "2026-02-10"),
    ],
    [
      "lower: the lowest value (Fran 5:20 -> 4:10)",
      [r(320, "2026-01-10"), r(250, "2026-03-10"), r(280, "2026-02-10")],
      "lower",
      r(250, "2026-03-10"),
    ],
    [
      "higher tie: Deadlift 100 (Jan), 100 (Mar) -> Jan",
      [r(100, "2026-01-10"), r(100, "2026-03-10")],
      "higher",
      r(100, "2026-01-10"),
    ],
    [
      "higher tie given latest first: still the earliest date",
      [r(100, "2026-03-10"), r(100, "2026-01-10"), r(80, "2026-02-10")],
      "higher",
      r(100, "2026-01-10"),
    ],
    [
      "lower tie: the earliest date wins",
      [r(250, "2026-04-01"), r(300, "2026-02-01"), r(250, "2026-03-01")],
      "lower",
      r(250, "2026-03-01"),
    ],
    [
      "a single reading is its own best (higher)",
      [r(3, "2026-02-01")],
      "higher",
      r(3, "2026-02-01"),
    ],
    [
      "a single reading is its own best (lower)",
      [r(3, "2026-02-01")],
      "lower",
      r(3, "2026-02-01"),
    ],
    [
      "the estimated flag travels with the best reading",
      [r(94, "2026-01-10", true), r(98, "2026-02-10")],
      "lower",
      r(94, "2026-01-10", true),
    ],
    [
      "negative values follow the same direction",
      [r(-5, "2026-01-10"), r(-2, "2026-02-10")],
      "higher",
      r(-2, "2026-02-10"),
    ],
  ];

  for (const [label, readings, better, expected] of cases) {
    test(`BR-REC-107 ${label}`, () => {
      expect(bestReading(readings, better)).toEqual(expected);
    });
  }

  test("BR-REC-107 'No direction' has no best", () => {
    expect(
      bestReading([r(172, "2026-01-10"), r(172.5, "2026-02-10")], "none"),
    ).toBeNull();
  });

  test("BR-REC-107 'No direction' has no best even with one reading", () => {
    expect(bestReading([r(172, "2026-01-10")], "none")).toBeNull();
  });
});

describe("BR-REC-22 summary of one member's readings of one measurement", () => {
  test("BR-REC-22 Fran 5:20 -> 4:10: first, latest, best and change -1:10", () => {
    const readings = [
      r(320, "2026-01-10"),
      r(280, "2026-02-10"),
      r(250, "2026-03-10"),
    ];
    expect(summariseReadings(readings, "lower")).toEqual({
      first: r(320, "2026-01-10"),
      latest: r(250, "2026-03-10"),
      best: r(250, "2026-03-10"),
      change: -70,
      readings: 3,
      points: readings,
    });
  });

  test("P2 first and latest are by date, whatever the order readings arrive in", () => {
    const summary = summariseReadings(
      [r(280, "2026-02-10"), r(250, "2026-03-10"), r(320, "2026-01-10")],
      "lower",
    );
    expect(summary.first).toEqual(r(320, "2026-01-10"));
    expect(summary.latest).toEqual(r(250, "2026-03-10"));
    expect(summary.points.map((p) => p.on)).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);
  });

  test("BR-REC-22 best is not always the latest: a regression keeps the older best", () => {
    const summary = summariseReadings(
      [r(100, "2026-01-10"), r(120, "2026-02-10"), r(110, "2026-03-10")],
      "higher",
    );
    expect(summary.best).toEqual(r(120, "2026-02-10"));
    expect(summary.latest).toEqual(r(110, "2026-03-10"));
    expect(summary.change).toBe(10);
  });

  test("BR-REC-107 summary best on a tie is the earliest date", () => {
    const summary = summariseReadings(
      [r(100, "2026-03-10"), r(100, "2026-01-10")],
      "higher",
    );
    expect(summary.best).toEqual(r(100, "2026-01-10"));
    expect(summary.change).toBe(0);
  });

  test("BR-REC-22 under 2 readings: the value only, no change", () => {
    const only = r(3, "2026-02-01");
    expect(summariseReadings([only], "higher")).toEqual({
      first: only,
      latest: only,
      best: only,
      change: null,
      readings: 1,
      points: [only],
    });
  });

  test("BR-REC-107 'No direction': no best, but the change is still given", () => {
    const summary = summariseReadings(
      [r(172, "2026-01-10"), r(172.5, "2026-02-10")],
      "none",
    );
    expect(summary.best).toBeNull();
    expect(summary.change).toBe(0.5);
    expect(summary.readings).toBe(2);
  });

  test("P2 'No direction' with one reading: no best and no change", () => {
    const summary = summariseReadings([r(172, "2026-01-10")], "none");
    expect(summary.best).toBeNull();
    expect(summary.change).toBeNull();
  });

  const rounding: [string, number, number, number][] = [
    ["98.0 -> 94.0", 98, 94, -4],
    ["24.1 -> 30.2 (floating point gives 6.099999999999998)", 24.1, 30.2, 6.1],
    ["0.1 -> 0.3 (floating point gives 0.19999999999999998)", 0.1, 0.3, 0.2],
    ["30.0 -> 29.8", 30, 29.8, -0.2],
    ["12.345 -> 12.346 keeps all three decimals", 12.345, 12.346, 0.001],
  ];
  for (const [label, first, latest, change] of rounding) {
    test(`P2 change = latest - first rounded to 3 decimals: ${label}`, () => {
      const summary = summariseReadings(
        [r(first, "2026-01-10"), r(latest, "2026-02-10")],
        "lower",
      );
      expect(summary.change).toBe(change);
    });
  }

  test("P2 an empty list of readings is a programming error (RangeError)", () => {
    expect(() => summariseReadings([], "higher")).toThrow(RangeError);
  });

  test("P2 points: 12 readings are all kept, oldest first", () => {
    const readings = Array.from({ length: 12 }, (_, i) => r(i, day(i)));
    const summary = summariseReadings(readings, "higher");
    expect(summary.readings).toBe(12);
    expect(summary.points).toEqual(readings);
  });

  test("P2 points: 13 readings keep the last 12, oldest first; readings counts all 13", () => {
    const readings = Array.from({ length: 13 }, (_, i) => r(i, day(i)));
    const summary = summariseReadings(readings, "higher");
    expect(summary.readings).toBe(13);
    expect(summary.points).toHaveLength(12);
    expect(summary.points[0]).toEqual(readings[1] as Reading);
    expect(summary.points[11]).toEqual(readings[12] as Reading);
    // first / best still look at all 13
    expect(summary.first).toEqual(readings[0] as Reading);
    expect(summary.change).toBe(12);
  });

  test("P2 points: shuffled input still gives the last 12 by date, oldest first", () => {
    const readings = Array.from({ length: 15 }, (_, i) => r(i * 2, day(i)));
    const shuffled = [...readings].reverse();
    const summary = summariseReadings(shuffled, "higher");
    expect(summary.points).toEqual(readings.slice(3));
    expect(summary.latest).toEqual(readings[14] as Reading);
  });

  test("BR-REC-22 estimated readings keep their flag in first, latest and points", () => {
    const summary = summariseReadings(
      [r(60, "2025-12-01", true), r(58, "2026-02-01")],
      "lower",
    );
    expect(summary.first.isEstimated).toBe(true);
    expect(summary.latest.isEstimated).toBe(false);
    expect(summary.points.map((p) => p.isEstimated)).toEqual([true, false]);
  });
});
