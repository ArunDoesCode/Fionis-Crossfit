import { describe, expect, test } from "bun:test";

import {
  bare,
  expectError,
  type MadeMember,
  type MadeMetric,
  type Sex,
  useProgressSuite,
} from "./support/suite";

// E37 GET /api/reports/leaderboard: BR-REC-115 (each member's latest value of one measurement,
// Male and Female boards, best first by direction, top 10 paged with "Show more", equal values
// share a rank 1, 2, 2, 4, none for "No direction", archived members left out), P6 of the
// progress spec (ordering of equal values, paging, ranks continue across pages) and BR-REC-110
// (always the latest saves). Fixtures are written straight to the database.

type Item = {
  rank: number;
  memberId: string;
  fullName: string;
  value: number;
  on: string;
};
type Board = {
  items: Item[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

const s = useProgressSuite();

const UNKNOWN = "00000000-0000-4000-8000-000000000001";

async function board(
  metric: MadeMetric,
  sex: Sex,
  query: Record<string, string | number> = {},
): Promise<Board> {
  const reply = await s.leaderboard({ metricId: metric.id, sex, ...query });
  expect(reply.status).toBe(200);
  expect(reply.body?.success).toBe(true);
  return {
    items: reply.body?.data as Item[],
    meta: reply.body?.meta as Board["meta"],
  };
}

async function athlete(
  name: string,
  metric: MadeMetric,
  points: [number, number][],
  options: { sex?: Sex; archived?: boolean } = {},
): Promise<MadeMember> {
  const member = await s.makeMember({
    name,
    sex: options.sex ?? "male",
    archived: options.archived ?? false,
  });
  await s.series(
    member.id,
    metric,
    points.map(([daysAgo, value]) => [s.day(-daysAgo), value]),
  );
  return member;
}

const names = (items: Item[]) => items.map((i) => bare(i.fullName));
const ranks = (items: Item[]) => items.map((i) => i.rank);

describe("BR-REC-115 ranking", () => {
  test("BR-REC-115 Fran, lower is better: the fastest time is rank 1", async () => {
    const fran = await s.makeSingleMetric({
      name: "Fran",
      datatype: "duration",
      decimals: 0,
      better: "lower",
    });
    await athlete("Slow", fran, [[10, 320]]);
    await athlete("Fast", fran, [[10, 235]]);
    await athlete("Middle", fran, [[10, 250]]);
    const { items } = await board(fran, "male");
    expect(names(items)).toEqual(["Fast", "Middle", "Slow"]);
    expect(ranks(items)).toEqual([1, 2, 3]);
    expect(items.map((i) => i.value)).toEqual([235, 250, 320]);
  });

  test("BR-REC-115 Deadlift, higher is better: the heaviest lift is rank 1", async () => {
    const deadlift = await s.makeSingleMetric({
      name: "Deadlift",
      unit: "kg",
      decimals: 0,
      better: "higher",
    });
    await athlete("Light", deadlift, [[10, 80]]);
    await athlete("Heavy", deadlift, [[10, 160]]);
    await athlete("Medium", deadlift, [[10, 120]]);
    const { items } = await board(deadlift, "male");
    expect(names(items)).toEqual(["Heavy", "Medium", "Light"]);
    expect(ranks(items)).toEqual([1, 2, 3]);
  });

  test("BR-REC-115 spec example: two at 4:10 behind one at 3:55 both rank 2, the next is rank 4", async () => {
    const fran = await s.makeSingleMetric({
      name: "Fran",
      datatype: "duration",
      decimals: 0,
      better: "lower",
    });
    await athlete("Asha", fran, [[10, 235]]);
    await athlete("Bala", fran, [[10, 250]]);
    await athlete("Cara", fran, [[10, 250]]);
    await athlete("Dev", fran, [[10, 300]]);
    const { items } = await board(fran, "male");
    expect(ranks(items)).toEqual([1, 2, 2, 4]);
    expect(items.map((i) => i.value)).toEqual([235, 250, 250, 300]);
  });

  test("BR-REC-115 a tie for first: 1, 1, 3", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 0 });
    await athlete("Top One", m, [[10, 100]]);
    await athlete("Top Two", m, [[10, 100]]);
    await athlete("Third", m, [[10, 90]]);
    expect(ranks((await board(m, "male")).items)).toEqual([1, 1, 3]);
  });

  test("BR-REC-115 the board shows each member's LATEST value, not the best or the first", async () => {
    const fran = await s.makeSingleMetric({
      datatype: "duration",
      decimals: 0,
      better: "lower",
    });
    // best was 200 s, but the latest is 280 s
    await athlete("Slipped", fran, [
      [90, 300],
      [60, 200],
      [30, 280],
    ]);
    await athlete("Steady", fran, [[20, 250]]);
    const { items } = await board(fran, "male");
    expect(names(items)).toEqual(["Steady", "Slipped"]);
    const slipped = items[1] as Item;
    expect(slipped.value).toBe(280);
    expect(slipped.on).toBe(s.day(-30));
  });

  test("BR-REC-115 a member with a single reading is ranked (1 or more readings)", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 0 });
    await athlete("One Reading", m, [[10, 50]]);
    const { items, meta } = await board(m, "male");
    expect(names(items)).toEqual(["One Reading"]);
    expect(meta.total).toBe(1);
  });

  test("BR-REC-115 each item has rank, member id, name, value and date", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    const member = await athlete("Shape Check", m, [[12, 18.2]]);
    const { items } = await board(m, "male");
    expect(items).toEqual([
      {
        rank: 1,
        memberId: member.id,
        fullName: member.fullName,
        value: 18.2,
        on: s.day(-12),
      },
    ]);
  });

  test("BR-REC-115 decimals rank as numbers: 18.2 before 19.0 before 19.05 for lower", async () => {
    const m = await s.makeSingleMetric({ better: "lower", decimals: 2 });
    await athlete("Surya", m, [[5, 18.2]]);
    await athlete("Ravi K", m, [[5, 19]]);
    await athlete("Third", m, [[5, 19.05]]);
    expect(names((await board(m, "male")).items)).toEqual([
      "Surya",
      "Ravi K",
      "Third",
    ]);
  });
});

describe("BR-REC-115 who is on which board", () => {
  test("BR-REC-115 Male and Female boards are separate", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 0 });
    await athlete("Man One", m, [[10, 100]], { sex: "male" });
    await athlete("Man Two", m, [[10, 90]], { sex: "male" });
    await athlete("Woman One", m, [[10, 95]], { sex: "female" });
    const men = await board(m, "male");
    const women = await board(m, "female");
    expect(names(men.items)).toEqual(["Man One", "Man Two"]);
    expect(ranks(men.items)).toEqual([1, 2]);
    expect(names(women.items)).toEqual(["Woman One"]);
    expect(ranks(women.items)).toEqual([1]);
    expect(men.meta.total).toBe(2);
    expect(women.meta.total).toBe(1);
  });

  test("BR-REC-115 archived members are left out, active ones keep their rank", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 0 });
    await athlete("Archived Leader", m, [[10, 500]], { archived: true });
    await athlete("Active One", m, [[10, 100]]);
    const { items, meta } = await board(m, "male");
    expect(names(items)).toEqual(["Active One"]);
    expect(ranks(items)).toEqual([1]);
    expect(meta.total).toBe(1);
  });

  test("P6 members whose membership has ended are still ranked", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 0 });
    const ended = await s.makeMember({
      name: "Ended Member",
      periods: [{ plan: "monthly", startOn: s.day(-400) }],
    });
    await s.series(ended.id, m, [[s.day(-300), 70]]);
    const { items } = await board(m, "male");
    expect(names(items)).toEqual(["Ended Member"]);
  });

  test("BR-REC-115 an empty board: no entries, total 0", async () => {
    const m = await s.makeSingleMetric({ better: "higher" });
    const { items, meta } = await board(m, "female");
    expect(items).toEqual([]);
    expect(meta.total).toBe(0);
    expect(meta.page).toBe(1);
  });

  test("BR-REC-115 only readings of this measurement are ranked, not of another", async () => {
    const m = await s.makeSingleMetric({ better: "higher" });
    const other = await s.makeSingleMetric({ better: "higher" });
    await athlete("Other Metric Only", other, [[10, 999]]);
    await athlete("This Metric", m, [[10, 10]]);
    expect(names((await board(m, "male")).items)).toEqual(["This Metric"]);
  });
});

describe("P6 order of equal values", () => {
  test("P6 equal values: the earlier date first", async () => {
    const m = await s.makeSingleMetric({ better: "lower", decimals: 0 });
    await athlete("Aaron Later", m, [[10, 250]]);
    await athlete("Zed Earlier", m, [[60, 250]]);
    const { items } = await board(m, "male");
    expect(names(items)).toEqual(["Zed Earlier", "Aaron Later"]);
    expect(ranks(items)).toEqual([1, 1]);
  });

  test("P6 equal value and date: by name, ignoring case", async () => {
    const m = await s.makeSingleMetric({ better: "lower", decimals: 0 });
    await athlete("carl", m, [[10, 250]]);
    await athlete("alice", m, [[10, 250]]);
    await athlete("Bob", m, [[10, 250]]);
    const { items } = await board(m, "male");
    expect(names(items)).toEqual(["alice", "Bob", "carl"]);
    expect(ranks(items)).toEqual([1, 1, 1]);
  });

  test("P6 equal value, date and name: by member id", async () => {
    const m = await s.makeSingleMetric({ better: "lower", decimals: 0 });
    const a = await athlete("Ravi K", m, [[10, 250]]);
    const b = await athlete("Ravi K", m, [[10, 250]]);
    const { items } = await board(m, "male");
    expect(items.map((i) => i.memberId)).toEqual([a.id, b.id].sort());
  });

  test("P6 the value decides before the date: a better value saved later ranks first", async () => {
    const m = await s.makeSingleMetric({ better: "lower", decimals: 0 });
    await athlete("Older Slower", m, [[100, 260]]);
    await athlete("Newer Faster", m, [[5, 240]]);
    expect(names((await board(m, "male")).items)).toEqual([
      "Newer Faster",
      "Older Slower",
    ]);
  });
});

describe("BR-REC-115 / P6 top 10 and Show more", () => {
  /** 12 men: ranks 1..9, two tied at the end of page 1 / start of page 2 (rank 10), then 12. */
  async function twelveMen(): Promise<MadeMetric> {
    const m = await s.makeSingleMetric({
      datatype: "duration",
      decimals: 0,
      better: "lower",
    });
    for (let i = 1; i <= 9; i++) {
      await athlete(`Runner ${String(i).padStart(2, "0")}`, m, [
        [10, 200 + i * 10],
      ]);
    }
    await athlete("Runner 10", m, [[60, 300]]);
    await athlete("Runner 11", m, [[30, 300]]);
    await athlete("Runner 12", m, [[10, 310]]);
    return m;
  }

  test("BR-REC-115 the default is the top 10: 10 entries, 12 ranked in total, 2 pages", async () => {
    const m = await twelveMen();
    const { items, meta } = await board(m, "male");
    expect(items).toHaveLength(10);
    expect(meta).toEqual({ page: 1, pageSize: 10, total: 12, totalPages: 2 });
    expect(names(items).slice(0, 3)).toEqual([
      "Runner 01",
      "Runner 02",
      "Runner 03",
    ]);
  });

  test("P6 ranks continue across pages and a tie keeps its rank over the page break", async () => {
    const m = await twelveMen();
    const first = await board(m, "male", { page: 1 });
    const second = await board(m, "male", { page: 2 });
    expect(ranks(first.items)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(names(first.items).at(-1)).toBe("Runner 10");
    expect(ranks(second.items)).toEqual([10, 12]);
    expect(names(second.items)).toEqual(["Runner 11", "Runner 12"]);
    expect(second.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    });
  });

  test("P6 a smaller page size pages the same ordered list: 5 per page, 3 pages", async () => {
    const m = await twelveMen();
    const pages = [
      await board(m, "male", { page: 1, pageSize: 5 }),
      await board(m, "male", { page: 2, pageSize: 5 }),
      await board(m, "male", { page: 3, pageSize: 5 }),
    ];
    expect(pages.map((p) => p.items.length)).toEqual([5, 5, 2]);
    expect(pages.flatMap((p) => ranks(p.items))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12,
    ]);
    expect(pages[0]?.meta).toEqual({
      page: 1,
      pageSize: 5,
      total: 12,
      totalPages: 3,
    });
  });

  test("P6 the biggest page size (100) holds everyone on one page", async () => {
    const m = await twelveMen();
    const { items, meta } = await board(m, "male", { pageSize: 100 });
    expect(items).toHaveLength(12);
    expect(meta.totalPages).toBe(1);
  });

  test("P6 pageSize above 100 is a 400 VALIDATION_ERROR", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    expectError(
      await s.leaderboard({ metricId: m.id, sex: "male", pageSize: 101 }),
      400,
      "VALIDATION_ERROR",
    );
  });

  test("P6 page 0 and pageSize 0 are 400 VALIDATION_ERROR", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    expectError(
      await s.leaderboard({ metricId: m.id, sex: "male", page: 0 }),
      400,
      "VALIDATION_ERROR",
    );
    expectError(
      await s.leaderboard({ metricId: m.id, sex: "male", pageSize: 0 }),
      400,
      "VALIDATION_ERROR",
    );
  });
});

describe("BR-REC-110 the latest saves are always on the board", () => {
  test("BR-REC-110 a reading saved just before the call is on the board at once, and a newer value moves the rank", async () => {
    const m = await s.makeSingleMetric({
      datatype: "duration",
      decimals: 0,
      better: "lower",
    });
    await athlete("Rival", m, [[20, 250]]);
    const challenger = await athlete("Challenger", m, [[30, 300]]);
    expect(names((await board(m, "male")).items)).toEqual([
      "Rival",
      "Challenger",
    ]);

    // Challenger saves a faster time today
    await s.series(challenger.id, m, [[s.day(0), 240]]);
    const after = await board(m, "male");
    expect(names(after.items)).toEqual(["Challenger", "Rival"]);
    expect(after.items[0]).toMatchObject({
      memberId: challenger.id,
      value: 240,
      on: s.day(0),
      rank: 1,
    });

    // and a brand-new member appears at once
    await athlete("Newcomer", m, [[0, 200]]);
    const third = await board(m, "male");
    expect(names(third.items)).toEqual(["Newcomer", "Challenger", "Rival"]);
    expect(third.meta.total).toBe(3);
  });
});

describe("E37 errors", () => {
  test("BR-REC-115 'No direction' has no leaderboard: 400 NO_DIRECTION", async () => {
    const height = await s.makeSingleMetric({
      name: "Height",
      unit: "cm",
      better: "none",
    });
    await athlete("Tall", height, [[10, 190]]);
    expectError(
      await s.leaderboard({ metricId: height.id, sex: "male" }),
      400,
      "NO_DIRECTION",
    );
  });

  test("BR-REC-115 an unknown measurement is 404 NOT_FOUND", async () => {
    expectError(
      await s.leaderboard({ metricId: UNKNOWN, sex: "male" }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-115 a missing sex is 400 VALIDATION_ERROR", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    expectError(
      await s.leaderboard({ metricId: m.id }),
      400,
      "VALIDATION_ERROR",
    );
  });

  test("BR-REC-115 an unknown sex value is 400 VALIDATION_ERROR", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    expectError(
      await s.leaderboard({ metricId: m.id, sex: "other" }),
      400,
      "VALIDATION_ERROR",
    );
  });

  test("BR-REC-115 a missing measurement is 400 VALIDATION_ERROR", async () => {
    expectError(await s.leaderboard({ sex: "male" }), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-115 a malformed measurement id is 400 VALIDATION_ERROR", async () => {
    expectError(
      await s.leaderboard({ metricId: "not-a-uuid", sex: "male" }),
      400,
      "VALIDATION_ERROR",
    );
  });
});
