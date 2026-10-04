import { beforeAll, describe, expect, test } from "bun:test";

import { call } from "../helpers/http";
import {
  birthdayOffset,
  dataOf,
  expectError,
  type MadeMember,
  type MadeMetric,
  type MemberSpec,
  type PlanName,
  type Sex,
  todayIn,
  useProgressSuite,
} from "./support/suite";

// E36 GET /api/reports/progress: BR-REC-23 (average change since each member's first reading, counts
// of improved / plateaued / regressed, only members with 2+ readings count and n is shown),
// BR-REC-110 (always the latest saves), BR-REC-111 (filters), BR-REC-112 (per-member outcome),
// BR-REC-113 (non-archived members, ended memberships included, "not counted"), BR-REC-114 (age
// bands) and P4 / P5 of the progress spec. Fixtures are written straight to the database.

type Stats = {
  metric: {
    id: string;
    name: string;
    unit: string;
    datatype: string;
    decimals: number;
    better: string;
  };
  n: number;
  notCounted: number;
  avgChange: number | null;
  improved: number;
  noChange: number;
  worse: number;
};

const s = useProgressSuite();

const UNKNOWN = "00000000-0000-4000-8000-000000000001";

async function stats(
  metric: MadeMetric,
  query: Record<string, string> = {},
): Promise<Stats> {
  return dataOf<Stats>(await s.progress({ metricId: metric.id, ...query }));
}

/** Two readings, 90 and 30 days ago. */
async function twoReadings(
  member: MadeMember,
  metric: MadeMetric,
  first: number,
  latest: number,
): Promise<void> {
  await s.series(member.id, metric, [
    [s.day(-90), first],
    [s.day(-30), latest],
  ]);
}

async function oneReading(
  member: MadeMember,
  metric: MadeMetric,
  value: number,
): Promise<void> {
  await s.series(member.id, metric, [[s.day(-30), value]]);
}

describe("BR-REC-23 / 112 / 113 the numbers", () => {
  test("BR-REC-23 spec example: n = 12, average -2.1 %, 8 improved / 3 no change / 1 worse, 5 not counted", async () => {
    const fat = await s.makeSingleMetric({
      name: "Body fat %",
      unit: "%",
      decimals: 1,
      better: "lower",
    });
    for (let i = 0; i < 8; i++) {
      await twoReadings(
        await s.makeMember({ name: `Improved ${i}` }),
        fat,
        30,
        26.5,
      );
    }
    for (let i = 0; i < 3; i++) {
      await twoReadings(
        await s.makeMember({ name: `Steady ${i}` }),
        fat,
        30,
        30,
      );
    }
    await twoReadings(await s.makeMember({ name: "Worse One" }), fat, 20, 22.8);
    for (let i = 0; i < 5; i++) {
      await oneReading(await s.makeMember({ name: `Single ${i}` }), fat, 25);
    }
    await s.makeMember({ name: "No Readings 1" });
    await s.makeMember({ name: "No Readings 2" });

    const result = await stats(fat);
    expect(result).toEqual({
      metric: {
        id: fat.id,
        name: "Body fat %",
        unit: "%",
        datatype: "number",
        decimals: 1,
        better: "lower",
      },
      n: 12,
      notCounted: 5,
      avgChange: -2.1,
      improved: 8,
      noChange: 3,
      worse: 1,
    });
  });

  test("BR-REC-113 a member with one reading is only in 'not counted'", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    await oneReading(await s.makeMember({ name: "One Reading" }), m, 30);
    const result = await stats(m);
    expect(result.n).toBe(0);
    expect(result.notCounted).toBe(1);
    expect(result.avgChange).toBeNull();
  });

  test("BR-REC-113 a member with no reading of this measurement is in neither count", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    const other = await s.makeSingleMetric({ better: "lower" });
    await s.makeMember({ name: "Nothing At All" });
    // two readings of ANOTHER measurement do not make this one count
    await twoReadings(
      await s.makeMember({ name: "Other Metric" }),
      other,
      30,
      28,
    );
    // one reading of this one and two of the other: not counted, not n
    const mixed = await s.makeMember({ name: "Mixed" });
    await twoReadings(mixed, other, 30, 28);
    await oneReading(mixed, m, 20);
    const result = await stats(m);
    expect(result.n).toBe(0);
    expect(result.notCounted).toBe(1);
  });

  test("BR-REC-113 three readings count once, by first and latest", async () => {
    const m = await s.makeSingleMetric({ better: "higher" });
    const member = await s.makeMember({ name: "Three Readings" });
    await s.series(member.id, m, [
      [s.day(-90), 100],
      [s.day(-60), 150],
      [s.day(-30), 120],
    ]);
    const result = await stats(m);
    expect(result.n).toBe(1);
    expect(result.notCounted).toBe(0);
    expect(result.avgChange).toBe(20);
    expect(result.improved).toBe(1);
  });

  test("P4 first and latest are by date, not by the order they were saved", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    const member = await s.makeMember({ name: "Saved Backwards" });
    await s.series(member.id, m, [
      [s.day(-10), 70],
      [s.day(-100), 90],
      [s.day(-50), 80],
    ]);
    const result = await stats(m);
    expect(result.avgChange).toBe(-20);
    expect(result.improved).toBe(1);
  });

  test("BR-REC-113 an ended membership is still counted", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    const ended = await s.makeMember({
      name: "Ended Long Ago",
      periods: [{ plan: "monthly", startOn: s.day(-400) }],
    });
    await twoReadings(ended, m, 30, 27);
    const result = await stats(m);
    expect(result.n).toBe(1);
    expect(result.avgChange).toBe(-3);
  });

  test("BR-REC-113 / Q1 an archived member is left out of n and of 'not counted'", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    await twoReadings(await s.makeMember({ name: "Active" }), m, 30, 28);
    await twoReadings(
      await s.makeMember({ name: "Archived Two", archived: true }),
      m,
      30,
      10,
    );
    await oneReading(
      await s.makeMember({ name: "Archived One", archived: true }),
      m,
      30,
    );
    const result = await stats(m);
    expect(result.n).toBe(1);
    expect(result.notCounted).toBe(0);
    expect(result.avgChange).toBe(-2);
  });

  test("Q1 a restored member counts again, with the values saved while archived", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    const member = await s.makeMember({ name: "Was Archived", archived: true });
    await twoReadings(member, m, 30, 24);
    expect((await stats(m)).n).toBe(0);
    await s.setArchived(member.id, false);
    const result = await stats(m);
    expect(result.n).toBe(1);
    expect(result.avgChange).toBe(-6);
  });

  test("BR-REC-112 higher is better: a rise improves, a drop is worse", async () => {
    const m = await s.makeSingleMetric({
      better: "higher",
      name: "Deadlift",
      unit: "kg",
      decimals: 0,
    });
    await twoReadings(await s.makeMember({ name: "Stronger" }), m, 100, 120);
    await twoReadings(await s.makeMember({ name: "Weaker" }), m, 100, 90);
    const result = await stats(m);
    expect(result).toMatchObject({
      n: 2,
      improved: 1,
      worse: 1,
      noChange: 0,
      avgChange: 5,
    });
  });

  test("BR-REC-112 spec example: first 30.0 -> latest 29.8 (-0.67%) is No change", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    await twoReadings(
      await s.makeMember({ name: "Barely Moved" }),
      m,
      30,
      29.8,
    );
    const result = await stats(m);
    expect(result).toMatchObject({ n: 1, improved: 0, noChange: 1, worse: 0 });
    expect(result.avgChange).toBe(-0.2);
  });

  test("BR-REC-112 exactly 1% is a change, just under 1% is not", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 2 });
    await twoReadings(
      await s.makeMember({ name: "Exactly One Percent" }),
      m,
      100,
      101,
    );
    await twoReadings(
      await s.makeMember({ name: "Just Under" }),
      m,
      100,
      100.99,
    );
    const result = await stats(m);
    expect(result).toMatchObject({ n: 2, improved: 1, noChange: 1, worse: 0 });
  });

  test("BR-REC-112 both readings 0 is No change; from 0 to something moves by direction", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 0 });
    await twoReadings(await s.makeMember({ name: "Zero Zero" }), m, 0, 0);
    await twoReadings(await s.makeMember({ name: "Zero Up" }), m, 0, 5);
    const lower = await s.makeSingleMetric({ better: "lower", decimals: 0 });
    await twoReadings(
      await s.makeMember({ name: "Zero Up Lower" }),
      lower,
      0,
      5,
    );
    expect(await stats(m)).toMatchObject({
      n: 2,
      improved: 1,
      noChange: 1,
      worse: 0,
    });
    expect(await stats(lower)).toMatchObject({
      n: 1,
      improved: 0,
      noChange: 0,
      worse: 1,
    });
  });

  test("BR-REC-112 'No direction' shows only the average change: the three counts are 0", async () => {
    const m = await s.makeSingleMetric({
      better: "none",
      name: "Height",
      unit: "cm",
    });
    await twoReadings(await s.makeMember({ name: "Taller" }), m, 170, 172);
    await twoReadings(await s.makeMember({ name: "Shorter" }), m, 170, 169);
    await oneReading(await s.makeMember({ name: "Once" }), m, 170);
    const result = await stats(m);
    expect(result).toMatchObject({
      n: 2,
      notCounted: 1,
      avgChange: 0.5,
      improved: 0,
      noChange: 0,
      worse: 0,
    });
    expect(result.metric.better).toBe("none");
  });

  test("P4 the average is the mean of the changes of the counted members only, rounded to 3 decimals", async () => {
    const m = await s.makeSingleMetric({ better: "higher", decimals: 2 });
    await twoReadings(await s.makeMember({ name: "Plus One" }), m, 10, 11);
    await twoReadings(
      await s.makeMember({ name: "Plus One Again" }),
      m,
      10,
      11,
    );
    await twoReadings(await s.makeMember({ name: "Plus Two" }), m, 10, 12);
    await oneReading(await s.makeMember({ name: "Not Counted" }), m, 999);
    const result = await stats(m);
    expect(result.n).toBe(3);
    expect(result.avgChange).toBe(1.333);
  });

  test("P4 a turned-off measurement still answers", async () => {
    const m = await s.makeSingleMetric({ better: "lower", isActive: false });
    await twoReadings(await s.makeMember({ name: "Old Metric" }), m, 30, 25);
    const result = await stats(m);
    expect(result.n).toBe(1);
    expect(result.avgChange).toBe(-5);
  });

  test("BR-REC-23 the answer has exactly the contract's fields", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    const result = await stats(m);
    expect(Object.keys(result).sort()).toEqual([
      "avgChange",
      "improved",
      "metric",
      "n",
      "noChange",
      "notCounted",
      "worse",
    ]);
    expect(Object.keys(result.metric).sort()).toEqual([
      "better",
      "datatype",
      "decimals",
      "id",
      "name",
      "unit",
    ]);
  });

  test("P4 a measurement nobody has recorded: n = 0, not counted 0, average null", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    expect(await stats(m)).toMatchObject({
      n: 0,
      notCounted: 0,
      avgChange: null,
      improved: 0,
      noChange: 0,
      worse: 0,
    });
  });
});

describe("BR-REC-111 / 113 / 114 filters", () => {
  // One measurement, one roster. Everybody with two readings changes by -k (first 100 -> 100 - k),
  // so the average change of a group tells which members are in it.
  let fat: MadeMetric;

  type Row = {
    label: string;
    k: number;
    joinedOn: string;
    sex: Sex;
    plan: PlanName;
    years: number;
    shift: number;
    firstPlan?: PlanName;
  };
  const ROSTER: Row[] = [
    {
      label: "A",
      k: 2,
      joinedOn: "2025-12-31",
      sex: "male",
      plan: "monthly",
      years: 20,
      shift: 1,
    }, // 19
    {
      label: "B",
      k: 3,
      joinedOn: "2026-01-01",
      sex: "female",
      plan: "annual",
      years: 20,
      shift: 0,
    }, // 20
    {
      label: "C",
      k: 4,
      joinedOn: "2026-01-31",
      sex: "male",
      plan: "quarterly",
      years: 30,
      shift: 1,
    }, // 29
    {
      label: "D",
      k: 5,
      joinedOn: "2026-02-15",
      sex: "female",
      plan: "monthly",
      years: 30,
      shift: 0,
    }, // 30
    {
      label: "E",
      k: 6,
      joinedOn: "2026-03-31",
      sex: "male",
      plan: "half_annual",
      years: 60,
      shift: 1,
    }, // 59
    {
      label: "F",
      k: 7,
      joinedOn: "2026-04-01",
      sex: "female",
      plan: "annual",
      years: 60,
      shift: 0,
    }, // 60
    // G renewed into annual after a monthly start: the plan is that of the LATEST period
    {
      label: "G",
      k: 8,
      joinedOn: "2026-02-01",
      sex: "female",
      plan: "annual",
      years: 45,
      shift: 0,
      firstPlan: "monthly",
    },
  ];

  beforeAll(async () => {
    fat = await s.makeSingleMetric({
      name: "Body fat %",
      unit: "%",
      better: "lower",
    });
    for (const row of ROSTER) {
      const periods: MemberSpec["periods"] = [];
      if (row.firstPlan) {
        periods.push({ plan: row.firstPlan, startOn: s.day(-500) });
      }
      periods.push({ plan: row.plan, startOn: s.day(-40) });
      const member = await s.makeMember({
        name: `Roster ${row.label}`,
        sex: row.sex,
        joinedOn: row.joinedOn,
        dateOfBirth: birthdayOffset(s.today(), row.years, row.shift),
        periods,
      });
      await twoReadings(member, fat, 100, 100 - row.k);
    }
    // joined 2026-02-10, female, annual, age 30: one reading (counted as 'not counted' where it matches)
    const single = await s.makeMember({
      name: "Roster I",
      sex: "female",
      joinedOn: "2026-02-10",
      dateOfBirth: birthdayOffset(s.today(), 30, 0),
    });
    await oneReading(single, fat, 80);
    // joined 2026-02-10, female, annual, age 30, no reading at all
    await s.makeMember({
      name: "Roster J",
      sex: "female",
      joinedOn: "2026-02-10",
      dateOfBirth: birthdayOffset(s.today(), 30, 0),
    });
    // archived: never counted
    const archivedTwo = await s.makeMember({
      name: "Roster H",
      sex: "female",
      joinedOn: "2026-02-10",
      dateOfBirth: birthdayOffset(s.today(), 30, 0),
      archived: true,
    });
    await twoReadings(archivedTwo, fat, 100, 0);
    const archivedOne = await s.makeMember({
      name: "Roster K",
      sex: "female",
      joinedOn: "2026-02-10",
      dateOfBirth: birthdayOffset(s.today(), 30, 0),
      archived: true,
    });
    await oneReading(archivedOne, fat, 80);
  });

  const cases: [
    string,
    Record<string, string>,
    { n: number; notCounted: number; avgChange: number | null },
  ][] = [
    [
      "no filter: everyone non-archived",
      {},
      { n: 7, notCounted: 1, avgChange: -5 },
    ],
    [
      "joined Jan-Mar 2026 (inclusive months)",
      { joinedFrom: "2026-01", joinedTo: "2026-03" },
      { n: 5, notCounted: 1, avgChange: -5.2 },
    ],
    [
      "joinedFrom only (Jan 2026 and later)",
      { joinedFrom: "2026-01" },
      { n: 6, notCounted: 1, avgChange: -5.5 },
    ],
    [
      "joinedTo only (Jan 2026 and earlier)",
      { joinedTo: "2026-01" },
      { n: 3, notCounted: 0, avgChange: -3 },
    ],
    [
      "one month: February 2026",
      { joinedFrom: "2026-02", joinedTo: "2026-02" },
      { n: 2, notCounted: 1, avgChange: -6.5 },
    ],
    [
      "from after to: nobody",
      { joinedFrom: "2026-03", joinedTo: "2026-01" },
      { n: 0, notCounted: 0, avgChange: null },
    ],
    [
      "plan monthly",
      { plan: "monthly" },
      { n: 2, notCounted: 0, avgChange: -3.5 },
    ],
    [
      "plan quarterly",
      { plan: "quarterly" },
      { n: 1, notCounted: 0, avgChange: -4 },
    ],
    [
      "plan half_annual",
      { plan: "half_annual" },
      { n: 1, notCounted: 0, avgChange: -6 },
    ],
    [
      "plan annual (G's latest period, B, F)",
      { plan: "annual" },
      { n: 3, notCounted: 1, avgChange: -6 },
    ],
    [
      "sex female",
      { sex: "female" },
      { n: 4, notCounted: 1, avgChange: -5.75 },
    ],
    ["sex male", { sex: "male" }, { n: 3, notCounted: 0, avgChange: -4 }],
    [
      "age Under 20",
      { ageBand: "under20" },
      { n: 1, notCounted: 0, avgChange: -2 },
    ],
    [
      "age 20-29 (20 today and 29)",
      { ageBand: "20to29" },
      { n: 2, notCounted: 0, avgChange: -3.5 },
    ],
    [
      "age 30-39",
      { ageBand: "30to39" },
      { n: 1, notCounted: 1, avgChange: -5 },
    ],
    [
      "age 40-49",
      { ageBand: "40to49" },
      { n: 1, notCounted: 0, avgChange: -8 },
    ],
    [
      "age 50-59 (59, 60th birthday tomorrow)",
      { ageBand: "50to59" },
      { n: 1, notCounted: 0, avgChange: -6 },
    ],
    [
      "age 60+ (60 today)",
      { ageBand: "60plus" },
      { n: 1, notCounted: 0, avgChange: -7 },
    ],
    [
      "Jan-Mar 2026 and female together",
      { joinedFrom: "2026-01", joinedTo: "2026-03", sex: "female" },
      { n: 3, notCounted: 1, avgChange: -5.333 },
    ],
    [
      "annual and 60+ together",
      { plan: "annual", ageBand: "60plus" },
      { n: 1, notCounted: 0, avgChange: -7 },
    ],
    [
      "all four filters together: Jan-Mar, monthly, female, 30-39",
      {
        joinedFrom: "2026-01",
        joinedTo: "2026-03",
        plan: "monthly",
        sex: "female",
        ageBand: "30to39",
      },
      { n: 1, notCounted: 0, avgChange: -5 },
    ],
    [
      "filters that match nobody",
      { plan: "half_annual", sex: "female" },
      { n: 0, notCounted: 0, avgChange: null },
    ],
  ];

  for (const [label, query, expected] of cases) {
    test(`BR-REC-111 ${label}`, async () => {
      const result = await stats(fat, query);
      expect({
        n: result.n,
        notCounted: result.notCounted,
        avgChange: result.avgChange,
      }).toEqual(expected);
    });
  }

  test("BR-REC-111 the counts follow the filtered members: Jan-Mar 2026 all improved", async () => {
    const result = await stats(fat, {
      joinedFrom: "2026-01",
      joinedTo: "2026-03",
    });
    expect(result).toMatchObject({ improved: 5, noChange: 0, worse: 0 });
  });

  test("BR-REC-113 the member with one reading is not counted only while the filters include them", async () => {
    // Roster I joined 2026-02-10: inside Feb, outside Mar
    expect(
      (await stats(fat, { joinedFrom: "2026-02", joinedTo: "2026-02" }))
        .notCounted,
    ).toBe(1);
    expect(
      (await stats(fat, { joinedFrom: "2026-03", joinedTo: "2026-03" }))
        .notCounted,
    ).toBe(0);
  });
});

describe("BR-REC-114 age bands on the gym's day", () => {
  test("BR-REC-114 the band is by the age on the gym's today, not the server's day", async () => {
    const utcDay = new Date().toISOString().slice(0, 10);
    const zone =
      todayIn("Pacific/Kiritimati") !== utcDay
        ? "Pacific/Kiritimati"
        : "Pacific/Pago_Pago";
    await s.setSettings({ timezone: zone });
    try {
      const gymDay = todayIn(zone);
      expect(gymDay).not.toBe(utcDay);
      // gym day after the UTC day: the 20th birthday is today (20-29); before: it is tomorrow (Under 20)
      const gymAhead = gymDay > utcDay;
      const dateOfBirth = birthdayOffset(gymDay, 20, gymAhead ? 0 : 1);
      const rightBand = gymAhead ? "20to29" : "under20";
      const wrongBand = gymAhead ? "under20" : "20to29";
      const m = await s.makeSingleMetric({ better: "lower" });
      const member = await s.makeMember({
        name: "Gym Day Birthday",
        dateOfBirth,
      });
      await twoReadings(member, m, 30, 25);
      expect((await stats(m, { ageBand: rightBand })).n).toBe(1);
      expect((await stats(m, { ageBand: wrongBand })).n).toBe(0);
    } finally {
      await s.setSettings({ timezone: "Asia/Kolkata" });
    }
  });
});

describe("BR-REC-110 the latest saves are always included", () => {
  test("BR-REC-110 a reading saved just before the call is counted at once: n 12 -> 13, then 13 -> 14", async () => {
    const m = await s.makeSingleMetric({
      better: "lower",
      name: "Body fat %",
      unit: "%",
    });
    for (let i = 0; i < 12; i++) {
      await twoReadings(
        await s.makeMember({ name: `Counted ${i}` }),
        m,
        30,
        28,
      );
    }
    const single = await s.makeMember({ name: "Surya Fresh" });
    await oneReading(single, m, 30);

    const before = await stats(m);
    expect(before.n).toBe(12);
    expect(before.notCounted).toBe(1);

    // save Surya's second reading, then read straight away
    await s.series(single.id, m, [[s.day(-1), 26]]);
    const after = await stats(m);
    expect(after.n).toBe(13);
    expect(after.notCounted).toBe(0);
    expect(after.avgChange).toBe(
      Math.round(((-2 * 12 - 4) / 13) * 1000) / 1000,
    );

    // and a brand-new member with two readings
    await twoReadings(
      await s.makeMember({ name: "Surya Fresh Two" }),
      m,
      30,
      20,
    );
    expect((await stats(m)).n).toBe(14);
  });

  test("BR-REC-110 the same query asked twice around a save gives two different answers (nothing is cached)", async () => {
    const m = await s.makeSingleMetric({ better: "higher" });
    const member = await s.makeMember({ name: "Cache Check" });
    await twoReadings(member, m, 100, 110);
    const first = await stats(m);
    const again = await stats(m);
    expect(again).toEqual(first);
    await s.series(member.id, m, [[s.day(-1), 130]]);
    const third = await stats(m);
    expect(third.avgChange).toBe(30);
    expect(first.avgChange).toBe(10);
  });

  test("BR-REC-110 archiving a member through the API removes them from the very next answer; restoring brings them back", async () => {
    const m = await s.makeSingleMetric({ better: "lower" });
    const member = await s.makeMember({ name: "Archive Fresh" });
    await twoReadings(member, m, 30, 28);
    expect((await stats(m)).n).toBe(1);

    const archived = await call(
      s.app,
      "POST",
      `/api/members/${member.id}/archive`,
      {
        token: s.token,
      },
    );
    expect(archived.status).toBe(200);
    expect((await stats(m)).n).toBe(0);

    const restored = await call(
      s.app,
      "POST",
      `/api/members/${member.id}/restore`,
      {
        token: s.token,
      },
    );
    expect(restored.status).toBe(200);
    expect((await stats(m)).n).toBe(1);
  });
});

describe("E36 errors", () => {
  test("BR-REC-23 an unknown measurement is 404 NOT_FOUND", async () => {
    expectError(await s.progress({ metricId: UNKNOWN }), 404, "NOT_FOUND");
  });

  test("BR-REC-23 a missing measurement is 400 VALIDATION_ERROR", async () => {
    expectError(await s.progress({}), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-23 a malformed measurement id is 400 VALIDATION_ERROR", async () => {
    expectError(
      await s.progress({ metricId: "not-a-uuid" }),
      400,
      "VALIDATION_ERROR",
    );
  });

  const bad: [string, Record<string, string>][] = [
    ["joinedFrom 2026-13", { joinedFrom: "2026-13" }],
    ["joinedFrom 2026-1", { joinedFrom: "2026-1" }],
    ["joinedFrom 202601", { joinedFrom: "202601" }],
    ["joinedTo a full date", { joinedTo: "2026-01-15" }],
    ["plan weekly", { plan: "weekly" }],
    ["plan Half-annual (not the code)", { plan: "Half-annual" }],
    ["sex other", { sex: "other" }],
    ["ageBand 20-29 (not the code)", { ageBand: "20-29" }],
    ["ageBand under30", { ageBand: "under30" }],
  ];
  for (const [label, extra] of bad) {
    test(`BR-REC-111 ${label} is 400 VALIDATION_ERROR`, async () => {
      const m = await s.makeSingleMetric({ better: "lower" });
      expectError(
        await s.progress({ metricId: m.id, ...extra }),
        400,
        "VALIDATION_ERROR",
      );
    });
  }
});
