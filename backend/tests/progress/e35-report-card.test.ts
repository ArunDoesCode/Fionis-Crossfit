import { beforeAll, describe, expect, test } from "bun:test";

import {
  ageOnDay,
  birthdayOffset,
  dataOf,
  expectError,
  GYM_NAME,
  type MadeMetric,
  type MadeType,
  type Part,
  startFor,
  todayIn,
  useProgressSuite,
} from "./support/suite";

// E35 GET /api/members/:memberId/report-card: BR-REC-22 (header, per-metric first / latest / best /
// change, under 2 points shows the value only), BR-REC-106 (sections in setup order, never-recorded
// left out, turned-off with readings stay), BR-REC-107 (best by direction, earliest on a tie),
// BR-REC-108 (segmental table), build clarifications P2 / P3. All fixtures are written to the
// database directly; expectations come from the spec rules and the fixture values.

type Reading = { value: number; on: string; isEstimated: boolean };
type CardMetric = {
  id: string;
  name: string;
  unit: string;
  datatype: "number" | "duration";
  decimals: number;
  better: "higher" | "lower" | "none";
  first: Reading;
  latest: Reading;
  best: Reading | null;
  change: number | null;
  readings: number;
  points: Reading[];
};
type Card = {
  gymName: string;
  printedOn: string;
  member: {
    fullName: string;
    age: number;
    sex: "male" | "female";
    plan: string;
    membershipStatus: "active" | "expiring" | "expired";
    joinedOn: string;
  };
  types: { id: string; name: string; metrics: CardMetric[] }[];
  segmental: null | {
    on: string;
    isEstimated: boolean;
    groups: { name: string; unit: string; decimals: number }[];
    rows: { part: string; values: Record<string, number | null> }[];
  };
};

const s = useProgressSuite();

const UNKNOWN = "00000000-0000-4000-8000-000000000001";
const rd = (value: number, on: string, isEstimated = false): Reading => ({
  value,
  on,
  isEstimated,
});

async function card(memberId: string): Promise<Card> {
  return dataOf<Card>(await s.reportCard(memberId));
}

// the catalog most tests share: Body composition (weight, height) and Fitness test (Fran, Deadlift, Pull-ups)
let body: MadeType;
let weight: MadeMetric;
let height: MadeMetric;
let fitness: MadeType;
let fran: MadeMetric;
let deadlift: MadeMetric;
let pullUps: MadeMetric;
let neverRecorded: MadeMetric;

beforeAll(async () => {
  body = await s.makeType({ label: "body" });
  weight = await s.makeMetric(body.id, {
    name: "Weight",
    unit: "kg",
    decimals: 1,
    better: "lower",
  });
  height = await s.makeMetric(body.id, {
    name: "Height",
    unit: "cm",
    decimals: 1,
    better: "none",
  });
  neverRecorded = await s.makeMetric(body.id, {
    name: "Visceral fat",
    unit: "",
    decimals: 0,
    better: "lower",
  });
  fitness = await s.makeType({ label: "fitness" });
  fran = await s.makeMetric(fitness.id, {
    name: "Fran",
    unit: "",
    datatype: "duration",
    decimals: 0,
    better: "lower",
  });
  deadlift = await s.makeMetric(fitness.id, {
    name: "Deadlift",
    unit: "kg",
    decimals: 0,
    better: "higher",
  });
  pullUps = await s.makeMetric(fitness.id, {
    name: "Pull-ups",
    unit: "reps",
    decimals: 0,
    better: "higher",
  });
});

describe("BR-REC-106 the card header", () => {
  test("BR-REC-106 gym name, printed date, name, age, sex, plan, status and join date", async () => {
    const m = await s.makeMember({
      name: "Surya Pratap",
      dateOfBirth: "1982-05-10",
      sex: "male",
      joinedOn: "2025-06-01",
      periods: [{ plan: "annual", startOn: s.day(-100) }],
    });
    const c = await card(m.id);
    expect(c.gymName).toBe(GYM_NAME);
    expect(c.printedOn).toBe(s.today());
    expect(c.member).toEqual({
      fullName: m.fullName,
      age: ageOnDay("1982-05-10", s.today()),
      sex: "male",
      plan: "annual",
      membershipStatus: "active",
      joinedOn: "2025-06-01",
    });
  });

  test("BR-REC-106 the response has exactly the fields of the contract", async () => {
    const m = await s.makeMember({ name: "Shape Check" });
    const c = await card(m.id);
    expect(Object.keys(c).sort()).toEqual([
      "gymName",
      "member",
      "printedOn",
      "segmental",
      "types",
    ]);
    expect(Object.keys(c.member).sort()).toEqual([
      "age",
      "fullName",
      "joinedOn",
      "membershipStatus",
      "plan",
      "sex",
    ]);
  });

  test("BR-REC-106 a female member shows her sex", async () => {
    const m = await s.makeMember({ name: "Asha Rao", sex: "female" });
    expect((await card(m.id)).member.sex).toBe("female");
  });

  test("BR-REC-106 the plan is written as its code: half_annual", async () => {
    const m = await s.makeMember({
      name: "Half Year",
      periods: [{ plan: "half_annual", startOn: s.day(-30) }],
    });
    expect((await card(m.id)).member.plan).toBe("half_annual");
  });

  test("BR-REC-106 plan and status are those of the latest period (by start), not the first", async () => {
    const m = await s.makeMember({
      name: "Renewed Early",
      periods: [
        { plan: "annual", startOn: s.day(-500) },
        { plan: "monthly", startOn: startFor("monthly", s.day(20)) },
      ],
    });
    const c = await card(m.id);
    expect(c.member.plan).toBe("monthly");
    expect(c.member.membershipStatus).toBe("active");
  });

  const statusCases: [string, number, "active" | "expiring" | "expired"][] = [
    ["ends in 15 days", 15, "active"],
    ["ends in 14 days (the lead days)", 14, "expiring"],
    ["ends in 7 days", 7, "expiring"],
    ["ends today", 0, "expiring"],
    ["ended yesterday", -1, "expired"],
    ["ended 90 days ago", -90, "expired"],
  ];
  for (const [label, endsIn, wanted] of statusCases) {
    test(`BR-REC-106 membership ${label}: ${wanted}`, async () => {
      const m = await s.makeMember({
        name: `Status ${label}`,
        periods: [
          { plan: "monthly", startOn: startFor("monthly", s.day(endsIn)) },
        ],
      });
      expect((await card(m.id)).member.membershipStatus).toBe(wanted);
    });
  }

  test("BR-REC-106 a renewal that has not started yet counts as active", async () => {
    const m = await s.makeMember({
      name: "Early Renewal",
      periods: [
        { plan: "annual", startOn: s.day(-400) },
        { plan: "quarterly", startOn: s.day(1) },
      ],
    });
    const c = await card(m.id);
    expect(c.member.plan).toBe("quarterly");
    expect(c.member.membershipStatus).toBe("active");
  });

  test("BR-REC-106 the printed date and the age use the gym's day, not the server's", async () => {
    const utcDay = new Date().toISOString().slice(0, 10);
    const zone =
      todayIn("Pacific/Kiritimati") !== utcDay
        ? "Pacific/Kiritimati"
        : "Pacific/Pago_Pago";
    await s.setSettings({ timezone: zone });
    try {
      const gymDay = todayIn(zone);
      expect(gymDay).not.toBe(utcDay);
      // gym day after the UTC day: 30th birthday today; before: 30th birthday tomorrow
      const dateOfBirth =
        gymDay > utcDay
          ? birthdayOffset(gymDay, 30, 0)
          : birthdayOffset(gymDay, 30, 1);
      const m = await s.makeMember({
        name: "Time Zone",
        dateOfBirth,
        joinedOn: "2025-01-01",
        periods: [{ plan: "annual", startOn: "2025-01-01" }],
      });
      const c = await card(m.id);
      expect(c.printedOn).toBe(gymDay);
      expect(c.member.age).toBe(ageOnDay(dateOfBirth, gymDay));
    } finally {
      await s.setSettings({ timezone: "Asia/Kolkata" });
    }
  });

  test("BR-REC-106 the gym name is the one in the settings", async () => {
    await s.setSettings({ gymName: "TEST_progress Other Name" });
    try {
      const m = await s.makeMember({ name: "Gym Name" });
      expect((await card(m.id)).gymName).toBe("TEST_progress Other Name");
    } finally {
      await s.setSettings({ gymName: GYM_NAME });
    }
  });

  test("BR-REC-22 a member with no readings: header only, no sections, no table", async () => {
    const m = await s.makeMember({ name: "No Readings" });
    const c = await card(m.id);
    expect(c.types).toEqual([]);
    expect(c.segmental).toBeNull();
  });
});

describe("BR-REC-22 / 106 / 107 the rows", () => {
  test("BR-REC-22 Surya's S12 sketch: weight 98 -> 94, height 172 -> 172.5, Fran 5:20 -> 4:10", async () => {
    const m = await s.makeMember({ name: "Surya Sketch" });
    const d1 = s.day(-300);
    const d2 = s.day(-1);
    await s.series(m.id, weight, [
      [d1, 98],
      [d2, 94],
    ]);
    await s.series(m.id, height, [
      [d1, 172],
      [d2, 172.5],
    ]);
    await s.series(m.id, fran, [
      [s.day(-200), 320],
      [d2, 250],
    ]);
    const c = await card(m.id);
    expect(c.types).toEqual([
      {
        id: body.id,
        name: body.name,
        metrics: [
          {
            id: weight.id,
            name: "Weight",
            unit: "kg",
            datatype: "number",
            decimals: 1,
            better: "lower",
            first: rd(98, d1),
            latest: rd(94, d2),
            best: rd(94, d2),
            change: -4,
            readings: 2,
            points: [rd(98, d1), rd(94, d2)],
          },
          {
            id: height.id,
            name: "Height",
            unit: "cm",
            datatype: "number",
            decimals: 1,
            better: "none",
            first: rd(172, d1),
            latest: rd(172.5, d2),
            best: null,
            change: 0.5,
            readings: 2,
            points: [rd(172, d1), rd(172.5, d2)],
          },
        ],
      },
      {
        id: fitness.id,
        name: fitness.name,
        metrics: [
          {
            id: fran.id,
            name: "Fran",
            unit: "",
            datatype: "duration",
            decimals: 0,
            better: "lower",
            first: rd(320, s.day(-200)),
            latest: rd(250, d2),
            best: rd(250, d2),
            change: -70,
            readings: 2,
            points: [rd(320, s.day(-200)), rd(250, d2)],
          },
        ],
      },
    ]);
  });

  test("BR-REC-22 first and latest are by date even when saved in the other order", async () => {
    const m = await s.makeMember({ name: "Saved Backwards" });
    await s.series(m.id, weight, [
      [s.day(-10), 90],
      [s.day(-100), 100],
      [s.day(-50), 95],
    ]);
    const row = (await card(m.id)).types[0]?.metrics[0];
    expect(row?.first).toEqual(rd(100, s.day(-100)));
    expect(row?.latest).toEqual(rd(90, s.day(-10)));
    expect(row?.points.map((p) => p.value)).toEqual([100, 95, 90]);
    expect(row?.readings).toBe(3);
  });

  test("BR-REC-22 under 2 points shows the value only: readings 1, change null", async () => {
    const m = await s.makeMember({ name: "One Reading" });
    await s.series(m.id, pullUps, [[s.day(-1), 3]]);
    const row = (await card(m.id)).types[0]?.metrics[0];
    expect(row?.name).toBe("Pull-ups");
    expect(row?.readings).toBe(1);
    expect(row?.change).toBeNull();
    expect(row?.first).toEqual(rd(3, s.day(-1)));
    expect(row?.latest).toEqual(rd(3, s.day(-1)));
    expect(row?.points).toEqual([rd(3, s.day(-1))]);
  });

  test("BR-REC-107 Deadlift 100 (Jan), 100 (Mar): best is 100 on the earlier date", async () => {
    const m = await s.makeMember({ name: "Deadlift Tie" });
    await s.series(m.id, deadlift, [
      [s.day(-30), 100],
      [s.day(-90), 100],
    ]);
    const row = (await card(m.id)).types[0]?.metrics[0];
    expect(row?.best).toEqual(rd(100, s.day(-90)));
    expect(row?.change).toBe(0);
  });

  test("BR-REC-107 best by direction: lower is better for Fran, higher for Deadlift", async () => {
    const m = await s.makeMember({ name: "Directions" });
    await s.series(m.id, fran, [
      [s.day(-90), 300],
      [s.day(-60), 240],
      [s.day(-30), 260],
    ]);
    await s.series(m.id, deadlift, [
      [s.day(-90), 100],
      [s.day(-60), 140],
      [s.day(-30), 120],
    ]);
    const rows = (await card(m.id)).types[0]?.metrics ?? [];
    const f = rows.find((r) => r.name === "Fran");
    const d = rows.find((r) => r.name === "Deadlift");
    expect(f?.best).toEqual(rd(240, s.day(-60)));
    expect(f?.latest.value).toBe(260);
    expect(f?.change).toBe(-40);
    expect(d?.best).toEqual(rd(140, s.day(-60)));
    expect(d?.change).toBe(20);
  });

  test("BR-REC-107 'No direction' has no best", async () => {
    const m = await s.makeMember({ name: "No Direction" });
    await s.series(m.id, height, [
      [s.day(-90), 172],
      [s.day(-30), 172.5],
    ]);
    const row = (await card(m.id)).types[0]?.metrics[0];
    expect(row?.best).toBeNull();
    expect(row?.change).toBe(0.5);
  });

  test("P2 an estimated reading is flagged on first and points, a measured one is not", async () => {
    const m = await s.makeMember({ name: "Estimated Start" });
    await s.series(m.id, weight, [
      [s.day(-200), 98, true],
      [s.day(-1), 94, false],
    ]);
    const row = (await card(m.id)).types[0]?.metrics[0];
    expect(row?.first).toEqual(rd(98, s.day(-200), true));
    expect(row?.latest).toEqual(rd(94, s.day(-1), false));
    expect(row?.points.map((p) => p.isEstimated)).toEqual([true, false]);
  });

  test("P2 change is rounded to 3 decimals: 24.1 -> 30.2 is 6.1", async () => {
    const fat = await s.makeSingleMetric({ name: "Body fat", better: "lower" });
    const m = await s.makeMember({ name: "Rounded Change" });
    await s.series(m.id, fat, [
      [s.day(-60), 24.1],
      [s.day(-30), 30.2],
    ]);
    expect((await card(m.id)).types[0]?.metrics[0]?.change).toBe(6.1);
  });

  test("P2 points are the last 12 readings, oldest first; readings counts all 14", async () => {
    const m = await s.makeMember({ name: "Many Readings" });
    const points: [string, number][] = Array.from({ length: 14 }, (_, i) => [
      s.day(-140 + i * 10),
      100 - i,
    ]);
    await s.series(m.id, weight, points);
    const row = (await card(m.id)).types[0]?.metrics[0];
    expect(row?.readings).toBe(14);
    expect(row?.points).toHaveLength(12);
    expect(row?.points[0]).toEqual(rd(98, s.day(-120)));
    expect(row?.points[11]).toEqual(rd(87, s.day(-10)));
    expect(row?.first).toEqual(rd(100, s.day(-140)));
    expect(row?.change).toBe(-13);
  });

  test("BR-REC-106 the measurement block has exactly the contract's fields", async () => {
    const m = await s.makeMember({ name: "Metric Shape" });
    await s.series(m.id, weight, [[s.day(-5), 90]]);
    const row = (await card(m.id)).types[0]?.metrics[0] as CardMetric;
    expect(Object.keys(row).sort()).toEqual([
      "best",
      "better",
      "change",
      "datatype",
      "decimals",
      "first",
      "id",
      "latest",
      "name",
      "points",
      "readings",
      "unit",
    ]);
    expect(Object.keys(row.first).sort()).toEqual([
      "isEstimated",
      "on",
      "value",
    ]);
  });
});

describe("BR-REC-106 which sections and rows appear, and in which order", () => {
  test("BR-REC-106 never-recorded measurements are left out", async () => {
    const m = await s.makeMember({ name: "Partial Body" });
    await s.series(m.id, weight, [[s.day(-5), 90]]);
    const rows = (await card(m.id)).types[0]?.metrics ?? [];
    expect(rows.map((r) => r.name)).toEqual(["Weight"]);
    expect(rows.some((r) => r.id === neverRecorded.id)).toBe(false);
  });

  test("BR-REC-106 an assessment with no readings for this member is left out, even if others have readings", async () => {
    const other = await s.makeMember({ name: "Other Member" });
    await s.series(other.id, fran, [[s.day(-5), 250]]);
    const m = await s.makeMember({ name: "Body Only" });
    await s.series(m.id, weight, [[s.day(-5), 90]]);
    const c = await card(m.id);
    expect(c.types.map((t) => t.id)).toEqual([body.id]);
  });

  test("BR-REC-22 only this member's readings are on the card", async () => {
    const other = await s.makeMember({ name: "Heavier Member" });
    await s.series(other.id, weight, [
      [s.day(-90), 150],
      [s.day(-5), 140],
    ]);
    const m = await s.makeMember({ name: "Lighter Member" });
    await s.series(m.id, weight, [
      [s.day(-80), 70],
      [s.day(-4), 69],
    ]);
    const row = (await card(m.id)).types[0]?.metrics[0];
    expect(row?.readings).toBe(2);
    expect(row?.first.value).toBe(70);
    expect(row?.latest.value).toBe(69);
  });

  test("BR-REC-106 sections and rows follow the setup order, not the order they were created", async () => {
    const later = await s.makeType({ label: "later" });
    const earlier = await s.makeType({
      label: "earlier",
      sortOrder: later.sortOrder - 1,
    });
    const laterA = await s.makeMetric(later.id, { name: "L-A", sortOrder: 20 });
    const laterB = await s.makeMetric(later.id, { name: "L-B", sortOrder: 10 });
    const earlierA = await s.makeMetric(earlier.id, {
      name: "E-A",
      sortOrder: 5,
    });
    const m = await s.makeMember({ name: "Setup Order" });
    await s.record(m.id, later.id, s.day(-5), [
      [laterA, 1],
      [laterB, 2],
    ]);
    await s.record(m.id, earlier.id, s.day(-6), [[earlierA, 3]]);
    const c = await card(m.id);
    expect(c.types.map((t) => t.id)).toEqual([earlier.id, later.id]);
    expect(c.types[1]?.metrics.map((r) => r.name)).toEqual(["L-B", "L-A"]);
  });

  test("BR-REC-106 a turned-off measurement with readings stays; one with none is left out", async () => {
    const type = await s.makeType({ label: "off-metrics" });
    const on = await s.makeMetric(type.id, { name: "On", isActive: true });
    const offWith = await s.makeMetric(type.id, {
      name: "Off with readings",
      isActive: false,
    });
    await s.makeMetric(type.id, {
      name: "Off, never recorded",
      isActive: false,
    });
    const m = await s.makeMember({ name: "Off Metric" });
    await s.record(m.id, type.id, s.day(-5), [
      [on, 1],
      [offWith, 2],
    ]);
    const rows = (await card(m.id)).types[0]?.metrics ?? [];
    expect(rows.map((r) => r.name)).toEqual(["On", "Off with readings"]);
  });

  test("BR-REC-66 / 106 a turned-off assessment keeps its readings on the card (Fran after Fitness test is off)", async () => {
    const off = await s.makeType({ label: "off-type", isActive: false });
    const franOff = await s.makeMetric(off.id, {
      name: "Fran",
      datatype: "duration",
      decimals: 0,
      better: "lower",
    });
    const m = await s.makeMember({ name: "Off Assessment" });
    await s.series(m.id, franOff, [
      [s.day(-60), 300],
      [s.day(-5), 250],
    ]);
    const c = await card(m.id);
    expect(c.types.map((t) => t.id)).toEqual([off.id]);
    expect(c.types[0]?.metrics[0]?.name).toBe("Fran");
    expect(c.types[0]?.metrics[0]?.readings).toBe(2);
  });

  test("BR-REC-106 Surya: 15 body composition rows and 14 fitness rows", async () => {
    const bodyType = await s.makeType({ label: "surya-body" });
    const fitType = await s.makeType({ label: "surya-fit" });
    const bodyMetrics: MadeMetric[] = [];
    for (let i = 0; i < 15; i++) {
      bodyMetrics.push(await s.makeMetric(bodyType.id, { name: `B${i}` }));
    }
    const fitMetrics: MadeMetric[] = [];
    for (let i = 0; i < 14; i++) {
      fitMetrics.push(await s.makeMetric(fitType.id, { name: `F${i}` }));
    }
    const m = await s.makeMember({ name: "Surya Full" });
    await s.record(
      m.id,
      bodyType.id,
      s.day(-10),
      bodyMetrics.map((x, i): [MadeMetric, number] => [x, i]),
    );
    await s.record(
      m.id,
      fitType.id,
      s.day(-10),
      fitMetrics.map((x, i): [MadeMetric, number] => [x, i]),
    );
    const c = await card(m.id);
    expect(c.types.map((t) => t.metrics.length)).toEqual([15, 14]);
  });

  test("BR-REC-22 the card of an archived member still answers 200", async () => {
    const m = await s.makeMember({ name: "Archived Card", archived: true });
    await s.series(m.id, weight, [[s.day(-5), 90]]);
    const reply = await s.reportCard(m.id);
    expect(reply.status).toBe(200);
    expect(dataOf<Card>(reply).types[0]?.metrics[0]?.name).toBe("Weight");
  });
});

describe("BR-REC-108 the segmental table", () => {
  async function bodyType(): Promise<{
    type: MadeType;
    weight: MadeMetric;
    fat: Record<"whole" | "arms" | "trunk" | "legs", MadeMetric>;
    muscle: Record<"whole" | "arms" | "trunk" | "legs", MadeMetric>;
  }> {
    const type = await s.makeType({ label: "seg" });
    const weight = await s.makeMetric(type.id, { name: "Weight", unit: "kg" });
    const make = (group: string, part: string, tablePart: Part) =>
      s.makeMetric(type.id, {
        name: `${group} ${part}`,
        unit: "%",
        decimals: 1,
        tableGroup: group,
        tablePart,
      });
    const fat = {
      whole: await make("Subcut. fat %", "whole", "whole_body"),
      arms: await make("Subcut. fat %", "arms", "arms"),
      trunk: await make("Subcut. fat %", "trunk", "trunk"),
      legs: await make("Subcut. fat %", "legs", "legs"),
    };
    const muscle = {
      whole: await make("Skeletal muscle %", "whole", "whole_body"),
      arms: await make("Skeletal muscle %", "arms", "arms"),
      trunk: await make("Skeletal muscle %", "trunk", "trunk"),
      legs: await make("Skeletal muscle %", "legs", "legs"),
    };
    return { type, weight, fat, muscle };
  }

  test("BR-REC-108 spec example: Arms missing on that date -> an empty cell, the rest filled, its date shown", async () => {
    const b = await bodyType();
    const m = await s.makeMember({ name: "Segmental Example" });
    // an older, fuller assessment must not fill the missing cell
    await s.record(m.id, b.type.id, s.day(-40), [
      [b.fat.whole, 20],
      [b.fat.arms, 31],
      [b.fat.trunk, 21],
      [b.fat.legs, 25],
    ]);
    await s.record(m.id, b.type.id, s.day(-10), [
      [b.fat.whole, 24],
      [b.fat.trunk, 22],
      [b.fat.legs, 26.3],
      [b.muscle.whole, 30.1],
      [b.muscle.arms, 3.3],
      [b.muscle.trunk, 14],
      [b.muscle.legs, 9.1],
    ]);
    const c = await card(m.id);
    expect(c.segmental).toEqual({
      on: s.day(-10),
      isEstimated: false,
      groups: [
        { name: "Subcut. fat %", unit: "%", decimals: 1 },
        { name: "Skeletal muscle %", unit: "%", decimals: 1 },
      ],
      rows: [
        {
          part: "whole_body",
          values: { "Subcut. fat %": 24, "Skeletal muscle %": 30.1 },
        },
        {
          part: "arms",
          values: { "Subcut. fat %": null, "Skeletal muscle %": 3.3 },
        },
        {
          part: "trunk",
          values: { "Subcut. fat %": 22, "Skeletal muscle %": 14 },
        },
        {
          part: "legs",
          values: { "Subcut. fat %": 26.3, "Skeletal muscle %": 9.1 },
        },
      ],
    });
  });

  test("BR-REC-108 no value of any report-table measurement: no table", async () => {
    const b = await bodyType();
    const m = await s.makeMember({ name: "Weight Only" });
    await s.record(m.id, b.type.id, s.day(-10), [[b.weight, 94]]);
    const c = await card(m.id);
    expect(c.segmental).toBeNull();
    expect(c.types[0]?.metrics.map((r) => r.name)).toEqual(["Weight"]);
  });

  test("BR-REC-108 a newer assessment with no table value is skipped for the latest one that has one", async () => {
    const b = await bodyType();
    const m = await s.makeMember({ name: "Skipped Newer" });
    await s.record(m.id, b.type.id, s.day(-40), [
      [b.fat.whole, 20],
      [b.fat.legs, 25],
    ]);
    await s.record(m.id, b.type.id, s.day(-5), [[b.weight, 93]]);
    const c = await card(m.id);
    expect(c.segmental?.on).toBe(s.day(-40));
    expect(c.segmental?.rows.map((r) => r.values["Subcut. fat %"])).toEqual([
      20,
      null,
      null,
      25,
    ]);
  });

  test("BR-REC-108 the table is of the latest assessment by date, not the fullest", async () => {
    const b = await bodyType();
    const m = await s.makeMember({ name: "Latest Wins" });
    await s.record(m.id, b.type.id, s.day(-40), [
      [b.fat.whole, 20],
      [b.fat.arms, 30],
      [b.fat.trunk, 21],
      [b.fat.legs, 25],
    ]);
    await s.record(m.id, b.type.id, s.day(-10), [[b.fat.whole, 19]]);
    const c = await card(m.id);
    expect(c.segmental?.on).toBe(s.day(-10));
    expect(c.segmental?.rows.map((r) => r.values["Subcut. fat %"])).toEqual([
      19,
      null,
      null,
      null,
    ]);
  });

  test("BR-REC-108 an estimated assessment is flagged (shown as 'about')", async () => {
    const b = await bodyType();
    const m = await s.makeMember({ name: "Estimated Table" });
    await s.record(m.id, b.type.id, s.day(-200), [[b.fat.whole, 24]], {
      estimated: true,
    });
    const c = await card(m.id);
    expect(c.segmental?.on).toBe(s.day(-200));
    expect(c.segmental?.isEstimated).toBe(true);
  });

  test("BR-REC-108 the rows are always Whole body, Arms, Trunk, Legs, even with one value", async () => {
    const b = await bodyType();
    const m = await s.makeMember({ name: "One Cell" });
    await s.record(m.id, b.type.id, s.day(-10), [[b.muscle.legs, 9.1]]);
    const c = await card(m.id);
    expect(c.segmental?.rows.map((r) => r.part)).toEqual([
      "whole_body",
      "arms",
      "trunk",
      "legs",
    ]);
    expect(c.segmental?.rows.map((r) => r.values["Skeletal muscle %"])).toEqual(
      [null, null, null, 9.1],
    );
    // both groups are columns (their measurements are on), every cell of the other one is empty
    expect(c.segmental?.groups.map((g) => g.name)).toEqual([
      "Subcut. fat %",
      "Skeletal muscle %",
    ]);
    expect(c.segmental?.rows.map((r) => r.values["Subcut. fat %"])).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  test("P3 a group takes the unit and decimals of its first measurement in setup order", async () => {
    const type = await s.makeType({ label: "seg-first" });
    const later = await s.makeMetric(type.id, {
      name: "Group later",
      unit: "%",
      decimals: 1,
      sortOrder: 2_000_020,
      tableGroup: "Fat",
      tablePart: "arms",
    });
    const first = await s.makeMetric(type.id, {
      name: "Group first",
      unit: "pct",
      decimals: 2,
      sortOrder: 2_000_010,
      tableGroup: "Fat",
      tablePart: "legs",
    });
    const m = await s.makeMember({ name: "First Of Group" });
    await s.record(m.id, type.id, s.day(-10), [
      [later, 24],
      [first, 26.25],
    ]);
    const c = await card(m.id);
    expect(c.segmental?.groups).toEqual([
      { name: "Fat", unit: "pct", decimals: 2 },
    ]);
  });

  test("P3 columns follow the setup order of the measurements", async () => {
    const type = await s.makeType({ label: "seg-order" });
    const second = await s.makeMetric(type.id, {
      name: "Second group",
      sortOrder: 2_000_030,
      tableGroup: "Group B",
      tablePart: "whole_body",
    });
    const first = await s.makeMetric(type.id, {
      name: "First group",
      sortOrder: 2_000_020,
      tableGroup: "Group A",
      tablePart: "whole_body",
    });
    const m = await s.makeMember({ name: "Column Order" });
    await s.record(m.id, type.id, s.day(-10), [
      [second, 2],
      [first, 1],
    ]);
    const c = await card(m.id);
    expect(c.segmental?.groups.map((g) => g.name)).toEqual([
      "Group A",
      "Group B",
    ]);
  });

  test("P3 a group whose measurements are all off and has no value that day is not a column; one with a value stays", async () => {
    const type = await s.makeType({ label: "seg-off" });
    const retiredEmpty = await s.makeMetric(type.id, {
      name: "Retired no value",
      isActive: false,
      tableGroup: "Retired empty",
      tablePart: "whole_body",
    });
    const retiredValue = await s.makeMetric(type.id, {
      name: "Retired with value",
      isActive: false,
      tableGroup: "Retired valued",
      tablePart: "whole_body",
    });
    const live = await s.makeMetric(type.id, {
      name: "Live",
      tableGroup: "Live group",
      tablePart: "whole_body",
    });
    const m = await s.makeMember({ name: "Retired Groups" });
    await s.record(m.id, type.id, s.day(-10), [
      [retiredValue, 11],
      [live, 24],
    ]);
    const c = await card(m.id);
    const names = c.segmental?.groups.map((g) => g.name);
    expect(names).toEqual(["Retired valued", "Live group"]);
    expect(names).not.toContain("Retired empty");
    expect(retiredEmpty.isActive).toBe(false);
    expect(c.segmental?.rows[0]?.values).toEqual({
      "Retired valued": 11,
      "Live group": 24,
    });
  });
});

describe("E35 errors", () => {
  test("BR-REC-22 an unknown member is 404 NOT_FOUND", async () => {
    expectError(await s.reportCard(UNKNOWN), 404, "NOT_FOUND");
  });

  test("BR-REC-22 a malformed member id is 400 VALIDATION_ERROR", async () => {
    expectError(await s.reportCard("not-a-uuid"), 400, "VALIDATION_ERROR");
  });
});
