import { describe, expect, test } from "bun:test";

import { changeOutcome, progressStats } from "../../../src/lib/domain/report";

// BR-REC-112 (per-member outcome), BR-REC-23 / 113 (n, not counted, average change, counts) and the
// build clarifications P4 / P5 of the progress spec. Pure functions: no database.

type Better = "higher" | "lower" | "none";

describe("BR-REC-112 / P5 one member's outcome", () => {
  const cases: [string, number, number, Better, string | null][] = [
    // spec example: first 30.0 -> latest 29.8 is -0.67%: No change
    [
      "spec example 30.0 -> 29.8 (-0.67%), lower",
      30,
      29.8,
      "lower",
      "noChange",
    ],
    [
      "30.0 -> 29.8 is also No change when higher is better",
      30,
      29.8,
      "higher",
      "noChange",
    ],
    // direction
    ["lower: a drop of 4 is improved", 30, 26, "lower", "improved"],
    ["lower: a rise of 4 is worse", 30, 34, "lower", "worse"],
    ["higher: a rise of 4 is improved", 30, 34, "higher", "improved"],
    ["higher: a drop of 4 is worse", 30, 26, "higher", "worse"],
    // the 1% threshold: strictly under 1% of the first reading is No change
    [
      "exactly 1% up is not No change (higher: improved)",
      100,
      101,
      "higher",
      "improved",
    ],
    [
      "exactly 1% down is not No change (higher: worse)",
      100,
      99,
      "higher",
      "worse",
    ],
    [
      "exactly 1% down is not No change (lower: improved)",
      100,
      99,
      "lower",
      "improved",
    ],
    ["just under 1% up is No change", 100, 100.99, "higher", "noChange"],
    ["just under 1% down is No change", 100, 99.01, "lower", "noChange"],
    ["no movement at all is No change", 50, 50, "higher", "noChange"],
    [
      "1% of a larger first: 200 -> 202 is not No change",
      200,
      202,
      "higher",
      "improved",
    ],
    [
      "1% of a larger first: 200 -> 201.5 is No change",
      200,
      201.5,
      "lower",
      "noChange",
    ],
    // zero first reading
    ["first 0 and latest 0 is No change", 0, 0, "higher", "noChange"],
    ["first 0 and latest 0 is No change (lower)", 0, 0, "lower", "noChange"],
    ["first 0, latest 5, higher: improved", 0, 5, "higher", "improved"],
    ["first 0, latest 5, lower: worse", 0, 5, "lower", "worse"],
    ["first 0, latest -3, higher: worse", 0, -3, "higher", "worse"],
    ["first 0, latest -3, lower: improved", 0, -3, "lower", "improved"],
    // the 1% is of the size of the first reading, also when it is negative
    [
      "negative first: -10 -> -8, higher: improved",
      -10,
      -8,
      "higher",
      "improved",
    ],
    [
      "negative first: -10 -> -10.05 is under 1%: No change",
      -10,
      -10.05,
      "higher",
      "noChange",
    ],
    // "No direction"
    ["No direction has no outcome (rise)", 30, 34, "none", null],
    ["No direction has no outcome (no change)", 30, 30, "none", null],
  ];

  for (const [label, first, latest, better, expected] of cases) {
    test(`BR-REC-112 ${label}`, () => {
      expect(changeOutcome(first, latest, better)).toBe(expected as never);
    });
  }
});

describe("BR-REC-23 / 113 / P4 the gym-wide numbers of one measurement", () => {
  const m = (count: number, first: number, latest: number) => ({
    count,
    first,
    latest,
  });

  test("BR-REC-23 spec example: n = 12, average -2.1, 8 improved / 3 no change / 1 worse (lower is better)", () => {
    const members = [
      ...Array.from({ length: 8 }, () => m(2, 30, 26.5)), // -3.5 each
      ...Array.from({ length: 3 }, () => m(2, 30, 30)), // 0
      m(2, 20, 22.8), // +2.8
    ];
    expect(progressStats("lower", members)).toEqual({
      n: 12,
      notCounted: 0,
      avgChange: -2.1,
      improved: 8,
      noChange: 3,
      worse: 1,
    });
  });

  test("BR-REC-113 members with one reading are 'not counted' and stay out of n and the average", () => {
    const members = [
      m(2, 30, 28),
      m(2, 32, 30),
      m(1, 99, 99),
      m(1, 10, 10),
      m(1, 20, 20),
    ];
    const stats = progressStats("lower", members);
    expect(stats.n).toBe(2);
    expect(stats.notCounted).toBe(3);
    expect(stats.avgChange).toBe(-2);
    expect(stats.improved).toBe(2);
  });

  test("BR-REC-113 members with no reading are ignored altogether", () => {
    const members = [m(2, 30, 28), m(0, 0, 0), m(0, 500, -500)];
    const stats = progressStats("lower", members);
    expect(stats.n).toBe(1);
    expect(stats.notCounted).toBe(0);
    expect(stats.avgChange).toBe(-2);
  });

  test("BR-REC-113 three or more readings count once, by first and latest", () => {
    const stats = progressStats("higher", [m(5, 100, 120)]);
    expect(stats).toEqual({
      n: 1,
      notCounted: 0,
      avgChange: 20,
      improved: 1,
      noChange: 0,
      worse: 0,
    });
  });

  test("P4 nobody counted: the average is null and every count is 0", () => {
    expect(progressStats("lower", [])).toEqual({
      n: 0,
      notCounted: 0,
      avgChange: null,
      improved: 0,
      noChange: 0,
      worse: 0,
    });
  });

  test("P4 only members with one reading: n = 0, the average is null, they are all not counted", () => {
    const stats = progressStats("lower", [m(1, 30, 30), m(1, 25, 25)]);
    expect(stats.n).toBe(0);
    expect(stats.notCounted).toBe(2);
    expect(stats.avgChange).toBeNull();
  });

  test("P4 the average is rounded to 3 decimals (4 / 3 = 1.333, -4 / 3 = -1.333)", () => {
    expect(
      progressStats("higher", [m(2, 0, 1), m(2, 0, 1), m(2, 0, 2)]).avgChange,
    ).toBe(1.333);
    expect(
      progressStats("higher", [m(2, 5, 4), m(2, 5, 4), m(2, 5, 3)]).avgChange,
    ).toBe(-1.333);
  });

  test("P4 the average is the plain mean of the changes, not of the percentages", () => {
    // +10 on 100 (10%) and +10 on 10 (100%): mean change is +10
    expect(
      progressStats("higher", [m(2, 100, 110), m(2, 10, 20)]).avgChange,
    ).toBe(10);
  });

  test("P4 a worse and an improved member cancel in the average but both are counted", () => {
    const stats = progressStats("higher", [m(2, 50, 60), m(2, 50, 40)]);
    expect(stats.avgChange).toBe(0);
    expect(stats.improved).toBe(1);
    expect(stats.worse).toBe(1);
  });

  test("BR-REC-112 'No direction': only n and the average, all three counts are 0", () => {
    const stats = progressStats("none", [
      m(2, 172, 173),
      m(2, 170, 168),
      m(1, 5, 5),
    ]);
    expect(stats).toEqual({
      n: 2,
      notCounted: 1,
      avgChange: -0.5,
      improved: 0,
      noChange: 0,
      worse: 0,
    });
  });

  test("BR-REC-112 the three counts add up to n when there is a direction", () => {
    const members = [
      m(2, 30, 25),
      m(2, 30, 30),
      m(2, 30, 35),
      m(2, 0, 0),
      m(2, 0, 4),
      m(1, 3, 3),
    ];
    const stats = progressStats("lower", members);
    expect(stats.improved + stats.noChange + stats.worse).toBe(stats.n);
    expect(stats).toMatchObject({
      n: 5,
      notCounted: 1,
      improved: 1,
      noChange: 2,
      worse: 2,
    });
  });
});
