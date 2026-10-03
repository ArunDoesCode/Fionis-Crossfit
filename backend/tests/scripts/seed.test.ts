import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";
import { seed } from "../../scripts/seed";
import { db } from "../../src/db/client";
import {
  type CatalogMetric,
  readMetrics,
  readTypes,
  resetCatalog,
  resetSingletons,
} from "../helpers/seed-data";

// `bun run seed`: settings + the one login_attempts row + the catalog of
// setup.md "Seed detail" on an empty catalog only.
// BR-REC-10 (types and metrics from the paper forms), BR-REC-13 (intervals),
// BR-REC-65 (the 8 report-table items), BR-REC-68 (only on an empty catalog,
// never overwrites a coach's edits), BR-REC-168 (one settings row, one lock row).

async function clean() {
  await resetCatalog();
  await resetSingletons();
}

beforeEach(clean);
afterAll(clean);

type Expected = {
  name: string;
  /** not asserted for timed tests: the paper sheet says min:sec, the stored label is the owner's call */
  unit?: string;
  datatype: "number" | "duration";
  decimals?: number;
  better: "higher" | "lower" | "none";
  min: number;
  max: number;
};

// setup.md "Seed detail" (durations in seconds: 15:00 = 900, 1:30:00 = 5400 ...)
const BODY: Expected[] = [
  {
    name: "Height",
    unit: "cm",
    datatype: "number",
    decimals: 1,
    better: "none",
    min: 120,
    max: 220,
  },
  {
    name: "Weight",
    unit: "kg",
    datatype: "number",
    decimals: 1,
    better: "lower",
    min: 30,
    max: 250,
  },
  {
    name: "BMI",
    unit: "",
    datatype: "number",
    decimals: 1,
    better: "lower",
    min: 12,
    max: 60,
  },
  {
    name: "Body fat",
    unit: "%",
    datatype: "number",
    decimals: 1,
    better: "lower",
    min: 3,
    max: 60,
  },
  {
    name: "Visceral fat",
    unit: "level",
    datatype: "number",
    decimals: 1,
    better: "lower",
    min: 1,
    max: 30,
  },
  {
    name: "Resting metabolism",
    unit: "kcal",
    datatype: "number",
    decimals: 0,
    better: "higher",
    min: 800,
    max: 4000,
  },
  {
    name: "Body age",
    unit: "years",
    datatype: "number",
    decimals: 0,
    better: "lower",
    min: 10,
    max: 99,
  },
];
const FITNESS: Expected[] = [
  {
    name: "Push-ups",
    unit: "reps",
    datatype: "number",
    decimals: 0,
    better: "higher",
    min: 0,
    max: 200,
  },
  {
    name: "Hang time",
    datatype: "duration",
    better: "higher",
    min: 0,
    max: 900,
  },
  {
    name: "Pull-ups",
    unit: "reps",
    datatype: "number",
    decimals: 0,
    better: "higher",
    min: 0,
    max: 200,
  },
  {
    name: "Squats in 1 min",
    unit: "reps",
    datatype: "number",
    decimals: 0,
    better: "higher",
    min: 0,
    max: 200,
  },
  {
    name: "Plank",
    datatype: "duration",
    better: "higher",
    min: 0,
    max: 900,
  },
  {
    name: "Deadlift",
    unit: "kg",
    datatype: "number",
    decimals: 1,
    better: "higher",
    min: 0,
    max: 400,
  },
  {
    name: "Back squat",
    unit: "kg",
    datatype: "number",
    decimals: 1,
    better: "higher",
    min: 0,
    max: 400,
  },
  {
    name: "Chest press",
    unit: "kg",
    datatype: "number",
    decimals: 1,
    better: "higher",
    min: 0,
    max: 400,
  },
  {
    name: "Shoulder press",
    unit: "kg",
    datatype: "number",
    decimals: 1,
    better: "higher",
    min: 0,
    max: 400,
  },
  {
    name: "Flexibility",
    unit: "cm",
    datatype: "number",
    decimals: 1,
    better: "higher",
    min: -30,
    max: 60,
  },
  {
    name: "5K run",
    datatype: "duration",
    better: "lower",
    min: 720,
    max: 5400,
  },
  {
    name: "Filthy 50",
    datatype: "duration",
    better: "lower",
    min: 600,
    max: 5400,
  },
  {
    name: "Fran",
    datatype: "duration",
    better: "lower",
    min: 90,
    max: 1800,
  },
  {
    name: "CrossFit total",
    unit: "kg",
    datatype: "number",
    decimals: 1,
    better: "higher",
    min: 0,
    max: 900,
  },
];
const SEGMENTAL = [
  { group: /subcutaneous fat/i, better: "lower", min: 1, max: 60 },
  { group: /skeletal muscle/i, better: "higher", min: 10, max: 60 },
];
const PARTS = ["whole_body", "arms", "trunk", "legs"];

const find = (all: CatalogMetric[], type: string, name: string) =>
  all.find(
    (m) => m.type === type && m.name.toLowerCase() === name.toLowerCase(),
  );

describe("BR-REC-10 / BR-REC-68 seed on an empty catalog", () => {
  test("BR-REC-68 an empty catalog gets Body composition and Fitness test with 15 and 14 measurements", async () => {
    const summary = await seed();
    expect(summary).toMatchObject({ typesCreated: 2, metricsCreated: 29 });
    const types = await readTypes();
    expect(types.map((t) => t.name)).toEqual([
      "Body composition",
      "Fitness test",
    ]);
    const metrics = await readMetrics();
    expect(metrics.filter((m) => m.type === "Body composition")).toHaveLength(
      15,
    );
    expect(metrics.filter((m) => m.type === "Fitness test")).toHaveLength(14);
  });

  test("BR-REC-13 Body composition repeats every 1 month, Fitness test every 2 months", async () => {
    await seed();
    const types = await readTypes();
    expect(types[0]).toMatchObject({
      name: "Body composition",
      intervalCount: 1,
      intervalUnit: "month",
    });
    expect(types[1]).toMatchObject({
      name: "Fitness test",
      intervalCount: 2,
      intervalUnit: "month",
    });
  });

  for (const [type, list] of [
    ["Body composition", BODY],
    ["Fitness test", FITNESS],
  ] as const) {
    for (const e of list) {
      test(`BR-REC-10 ${type}: ${e.name} is ${e.datatype}, ${e.unit === undefined ? "any unit" : e.unit || "no unit"}, better ${e.better}, check range ${e.min}..${e.max}`, async () => {
        await seed();
        const m = find(await readMetrics(), type, e.name);
        expect(m, `${e.name} not seeded in ${type}`).toBeDefined();
        expect(m).toMatchObject({
          datatype: e.datatype,
          better: e.better,
          plausibleMin: e.min,
          plausibleMax: e.max,
          isActive: true,
        });
        if (e.unit !== undefined) expect(m?.unit).toBe(e.unit);
        if (e.decimals !== undefined) expect(m?.decimals).toBe(e.decimals);
      });
    }
  }

  test("BR-REC-10 Height is No direction (better = none), the 5 timed tests are durations", async () => {
    await seed();
    const all = await readMetrics();
    expect(find(all, "Body composition", "Height")?.better).toBe("none");
    const durations = all
      .filter((m) => m.datatype === "duration")
      .map((m) => m.name)
      .sort();
    expect(durations).toEqual([
      "5K run",
      "Filthy 50",
      "Fran",
      "Hang time",
      "Plank",
    ]);
  });

  test("BR-REC-10 SCW and SMW are not seeded (a coach can add them later)", async () => {
    await seed();
    const names = (await readMetrics()).map((m) => m.name.toLowerCase());
    expect(names).not.toContain("scw");
    expect(names).not.toContain("smw");
  });

  test("BR-REC-10 measurements keep the paper order: unique sort order per assessment, Body composition before Fitness test", async () => {
    await seed();
    const types = await readTypes();
    const [first, second] = types.map((t) => t.sortOrder);
    expect(first).toBeLessThan(second as number);
    const all = await readMetrics();
    for (const type of ["Body composition", "Fitness test"]) {
      const orders = all.filter((m) => m.type === type).map((m) => m.sortOrder);
      expect(new Set(orders).size).toBe(orders.length);
    }
    const body = all.filter((m) => m.type === "Body composition");
    const position = (name: string) => body.findIndex((m) => m.name === name);
    expect(position("Height")).toBeLessThan(position("Weight"));
    expect(position("Weight")).toBeLessThan(position("Body age"));
  });
});

describe("BR-REC-65 the 8 segmental items have a report-table place", () => {
  test("BR-REC-65 exactly 8 measurements, all in Body composition, have a group and a part", async () => {
    await seed();
    const placed = (await readMetrics()).filter(
      (m) => m.tableGroup !== null || m.tablePart !== null,
    );
    expect(placed).toHaveLength(8);
    for (const m of placed) {
      expect(m.type).toBe("Body composition");
      expect(m.tableGroup).not.toBeNull();
      expect(PARTS).toContain(m.tablePart as string);
    }
  });

  for (const group of SEGMENTAL) {
    test(`BR-REC-65 ${group.group.source} has one item for each body part: whole body, arms, trunk, legs`, async () => {
      await seed();
      const items = (await readMetrics()).filter(
        (m) => m.tableGroup && group.group.test(m.tableGroup),
      );
      expect(items.map((m) => m.tablePart).sort()).toEqual([...PARTS].sort());
      expect(new Set(items.map((m) => m.tableGroup)).size).toBe(1);
      for (const m of items) {
        expect(m).toMatchObject({
          unit: "%",
          datatype: "number",
          decimals: 1,
          better: group.better,
          plausibleMin: group.min,
          plausibleMax: group.max,
        });
      }
    });
  }
});

describe("BR-REC-68 the seed fills only what is missing", () => {
  test("BR-REC-68 running seed twice changes nothing", async () => {
    await seed();
    const typesBefore = await readTypes();
    const metricsBefore = await readMetrics();

    const second = await seed();
    expect(second).toMatchObject({
      typesCreated: 0,
      metricsCreated: 0,
      settingsCreated: false,
      loginAttemptsCreated: false,
    });
    expect(await readTypes()).toEqual(typesBefore);
    expect(await readMetrics()).toEqual(metricsBefore);
  });

  test("BR-REC-68 a coach's later edits survive a re-run (renamed, turned off, changed interval)", async () => {
    await seed();
    await db.execute(
      sql`update metrics set name = 'TEST_foundation_Hold time' where name = 'Plank'`,
    );
    await db.execute(
      sql`update metrics set is_active = false where name = 'Fran'`,
    );
    await db.execute(
      sql`update assessment_types set interval_count = 3 where name = 'Fitness test'`,
    );
    const metricsBefore = await readMetrics();
    const typesBefore = await readTypes();

    const again = await seed();
    expect(again).toMatchObject({ typesCreated: 0, metricsCreated: 0 });
    const metrics = await readMetrics();
    expect(metrics).toEqual(metricsBefore);
    expect(metrics.some((m) => m.name === "Plank")).toBe(false);
    expect(
      find(metrics, "Fitness test", "TEST_foundation_Hold time"),
    ).toBeDefined();
    expect(find(metrics, "Fitness test", "Fran")?.isActive).toBe(false);
    expect(await readTypes()).toEqual(typesBefore);
  });

  test("BR-REC-68 a catalog that already has an assessment is left alone (nothing seeded)", async () => {
    await db.execute(
      sql`insert into assessment_types (name, interval_count, interval_unit, sort_order) values ('TEST_foundation_Own test', 1, 'month', 1)`,
    );
    const summary = await seed();
    expect(summary).toMatchObject({ typesCreated: 0, metricsCreated: 0 });
    const types = await readTypes();
    expect(types.map((t) => t.name)).toEqual(["TEST_foundation_Own test"]);
    expect(await readMetrics()).toEqual([]);
  });
});

describe("seed: settings and the lock-counter row (BR-REC-168)", () => {
  test("BR-REC-168 seed creates the one settings row with the gym's defaults", async () => {
    const summary = await seed();
    expect(summary.settingsCreated).toBe(true);
    const rows = Array.from(
      await db.execute(sql`select * from gym_settings`),
    ) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      gym_name: "Fionis CrossFit",
      timezone: "Asia/Kolkata",
      upcoming_lead_days: 7,
      expiry_lead_days: 14,
    });
  });

  test("BR-REC-168 seed creates the one login_attempts row with no failed tries and no lock", async () => {
    const summary = await seed();
    expect(summary.loginAttemptsCreated).toBe(true);
    const rows = Array.from(
      await db.execute(sql`select * from login_attempts`),
    ) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      failed_count: 0,
      locked_until: null,
    });
  });

  test("BR-REC-168 running seed again keeps exactly one of each and does not reset the owner's settings", async () => {
    await seed();
    await db.execute(
      sql`update gym_settings set gym_name = 'TEST_foundation_Gym', upcoming_lead_days = 10`,
    );
    await db.execute(sql`update login_attempts set failed_count = 3`);
    await seed();
    const settings = Array.from(
      await db.execute(sql`select * from gym_settings`),
    ) as Record<string, unknown>[];
    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({
      gym_name: "TEST_foundation_Gym",
      upcoming_lead_days: 10,
    });
    const lock = Array.from(
      await db.execute(sql`select * from login_attempts`),
    ) as Record<string, unknown>[];
    expect(lock).toHaveLength(1);
    expect(lock[0]).toMatchObject({ failed_count: 3 });
  });
});
