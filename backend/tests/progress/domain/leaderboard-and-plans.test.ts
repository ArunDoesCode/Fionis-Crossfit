import { describe, expect, test } from "bun:test";

import {
  countActiveByPlan,
  rankLeaderboard,
} from "../../../src/lib/domain/report";

// BR-REC-115 / P6 (ranking: best first by direction, equal values share a rank 1, 2, 2, 4, ties
// ordered by earlier date, then name, then id) and BR-REC-116 / P7 (active members by plan).
// Pure functions: no database.

type Entry = { memberId: string; fullName: string; value: number; on: string };
const e = (
  memberId: string,
  fullName: string,
  value: number,
  on = "2026-09-01",
): Entry => ({ memberId, fullName, value, on });

const order = (entries: { memberId: string }[]) =>
  entries.map((x) => x.memberId);
const ranks = (entries: { rank: number }[]) => entries.map((x) => x.rank);

describe("BR-REC-115 ranking", () => {
  test("lower is better: the smallest value is rank 1 (Fran 3:55, 4:10, 5:20)", () => {
    const out = rankLeaderboard(
      [e("c", "Cara", 320), e("a", "Asha", 235), e("b", "Bala", 250)],
      "lower",
    );
    expect(order(out)).toEqual(["a", "b", "c"]);
    expect(ranks(out)).toEqual([1, 2, 3]);
  });

  test("higher is better: the largest value is rank 1", () => {
    const out = rankLeaderboard(
      [e("a", "Asha", 80), e("b", "Bala", 120), e("c", "Cara", 100)],
      "higher",
    );
    expect(order(out)).toEqual(["b", "c", "a"]);
    expect(ranks(out)).toEqual([1, 2, 3]);
  });

  test("BR-REC-115 spec example: two at 4:10 behind one at 3:55 both rank 2, the next is rank 4", () => {
    const out = rankLeaderboard(
      [
        e("d", "Dev", 300),
        e("b", "Bala", 250),
        e("a", "Asha", 235),
        e("c", "Cara", 250),
      ],
      "lower",
    );
    expect(ranks(out)).toEqual([1, 2, 2, 4]);
    expect(out.map((x) => x.value)).toEqual([235, 250, 250, 300]);
  });

  test("BR-REC-115 a tie at the top: 1, 1, 3", () => {
    const out = rankLeaderboard(
      [e("a", "Asha", 100), e("b", "Bala", 100), e("c", "Cara", 90)],
      "higher",
    );
    expect(ranks(out)).toEqual([1, 1, 3]);
  });

  test("BR-REC-115 three equal values then one more: 1, 1, 1, 4", () => {
    const out = rankLeaderboard(
      [e("a", "A", 5), e("b", "B", 5), e("c", "C", 5), e("d", "D", 4)],
      "higher",
    );
    expect(ranks(out)).toEqual([1, 1, 1, 4]);
  });

  test("BR-REC-115 everybody equal: all rank 1", () => {
    const out = rankLeaderboard(
      [e("a", "A", 7), e("b", "B", 7), e("c", "C", 7)],
      "lower",
    );
    expect(ranks(out)).toEqual([1, 1, 1]);
  });

  test("P6 equal values: the earlier date comes first", () => {
    const out = rankLeaderboard(
      [
        e("late", "Asha", 250, "2026-09-10"),
        e("early", "Zed", 250, "2026-08-01"),
      ],
      "lower",
    );
    expect(order(out)).toEqual(["early", "late"]);
    expect(ranks(out)).toEqual([1, 1]);
  });

  test("P6 equal values and date: by name, ignoring case", () => {
    const out = rankLeaderboard(
      [e("3", "carl", 250), e("1", "alice", 250), e("2", "Bob", 250)],
      "lower",
    );
    expect(order(out)).toEqual(["1", "2", "3"]);
  });

  test("P6 equal values, date and name: by member id", () => {
    const out = rankLeaderboard(
      [e("m-2", "Ravi K", 250), e("m-1", "Ravi K", 250)],
      "lower",
    );
    expect(order(out)).toEqual(["m-1", "m-2"]);
  });

  test("P6 the value decides before the date: a better value on a later date ranks first", () => {
    const out = rankLeaderboard(
      [
        e("slow", "Asha", 260, "2026-01-01"),
        e("fast", "Bala", 240, "2026-09-01"),
      ],
      "lower",
    );
    expect(order(out)).toEqual(["fast", "slow"]);
    expect(ranks(out)).toEqual([1, 2]);
  });

  test("BR-REC-115 other fields of an entry are kept next to the rank", () => {
    const out = rankLeaderboard([e("a", "Asha", 235, "2026-09-12")], "lower");
    expect(out).toEqual([
      {
        memberId: "a",
        fullName: "Asha",
        value: 235,
        on: "2026-09-12",
        rank: 1,
      },
    ]);
  });

  test("BR-REC-115 no entries: an empty board", () => {
    expect(rankLeaderboard([], "higher")).toEqual([]);
  });

  test("P6 a single entry is rank 1", () => {
    expect(ranks(rankLeaderboard([e("a", "A", 1)], "lower"))).toEqual([1]);
  });

  test("P6 decimals rank as numbers: 18.2 beats 19.0 beats 19.05 for lower", () => {
    const out = rankLeaderboard(
      [e("b", "Ravi K", 19.0), e("c", "C", 19.05), e("a", "Surya", 18.2)],
      "lower",
    );
    expect(order(out)).toEqual(["a", "b", "c"]);
  });
});

describe("BR-REC-116 / P7 active members by plan", () => {
  type M = Parameters<typeof countActiveByPlan>[0][number];
  const many = (n: number, plan: M["plan"], status: M["status"]): M[] =>
    Array.from({ length: n }, () => ({ plan, status }));

  test("BR-REC-116 spec example: 40 Monthly, 22 Quarterly, 9 Half-annual, 31 Annual -> total 102", () => {
    const out = countActiveByPlan([
      ...many(40, "monthly", "active"),
      ...many(22, "quarterly", "active"),
      ...many(9, "half_annual", "active"),
      ...many(31, "annual", "active"),
    ]);
    expect(out).toEqual({
      monthly: 40,
      quarterly: 22,
      halfAnnual: 9,
      annual: 31,
      total: 102,
    });
  });

  test("BR-REC-116 'Ends soon' counts as active", () => {
    const out = countActiveByPlan([
      ...many(2, "monthly", "expiring"),
      ...many(1, "monthly", "active"),
    ]);
    expect(out.monthly).toBe(3);
    expect(out.total).toBe(3);
  });

  test("BR-REC-116 ended memberships are not counted", () => {
    const out = countActiveByPlan([
      ...many(3, "annual", "expired"),
      ...many(1, "annual", "active"),
      ...many(2, "quarterly", "expired"),
    ]);
    expect(out).toEqual({
      monthly: 0,
      quarterly: 0,
      halfAnnual: 0,
      annual: 1,
      total: 1,
    });
  });

  test("BR-REC-116 nobody: every count is 0", () => {
    expect(countActiveByPlan([])).toEqual({
      monthly: 0,
      quarterly: 0,
      halfAnnual: 0,
      annual: 0,
      total: 0,
    });
  });

  test("BR-REC-116 the total is the sum of the four plans", () => {
    const out = countActiveByPlan([
      ...many(1, "monthly", "active"),
      ...many(2, "quarterly", "expiring"),
      ...many(3, "half_annual", "active"),
      ...many(4, "annual", "expiring"),
      ...many(5, "annual", "expired"),
    ]);
    expect(out.total).toBe(
      out.monthly + out.quarterly + out.halfAnnual + out.annual,
    );
    expect(out.total).toBe(10);
  });
});
