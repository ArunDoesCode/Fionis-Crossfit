/**
 * `bun run seed` — settings, the one login-lock row and the assessment catalog.
 * Safe to run on any database, any number of times: it only fills what is
 * missing and never overwrites a coach's later edits (BR-REC-68).
 *
 * The catalog is the "Seed detail" table of docs/specs/member-records/setup.md.
 */
import { count, sql } from "drizzle-orm";

import { db, disconnectDb } from "../src/db/client";
import {
  assessmentTypes,
  gymSettings,
  loginAttempts,
  metrics,
} from "../src/db/schemas";
import type {
  BetterDirection,
  Datatype,
  IntervalUnit,
  TablePart,
} from "../src/lib/enums";

export type SeedSummary = {
  /** `gym_settings` row created (false = it already existed) */
  settingsCreated: boolean;
  /** `login_attempts` row created (false = it already existed) */
  loginAttemptsCreated: boolean;
  /** assessments created (0 when the catalog was not empty) */
  typesCreated: number;
  /** measurements created (0 when the catalog was not empty) */
  metricsCreated: number;
};

type MetricSeed = {
  name: string;
  unit: string;
  datatype: Datatype;
  decimals: number;
  better: BetterDirection;
  /** "please check" range (BR-REC-62); seconds for durations */
  min: number;
  max: number;
  /** report-table place (BR-REC-65) */
  table?: { group: string; part: TablePart };
};

type TypeSeed = {
  name: string;
  intervalCount: number;
  intervalUnit: IntervalUnit;
  metrics: MetricSeed[];
};

const count1 = (
  name: string,
  unit: string,
  decimals: number,
  better: BetterDirection,
  min: number,
  max: number,
): MetricSeed => ({
  name,
  unit,
  datatype: "number",
  decimals,
  better,
  min,
  max,
});

/** A timed test: typed as mm:ss, stored in whole seconds (BR-REC-12, 164). */
const timed = (
  name: string,
  better: BetterDirection,
  min: number,
  max: number,
): MetricSeed => ({
  name,
  unit: "min:sec",
  datatype: "duration",
  decimals: 0,
  better,
  min,
  max,
});

const SEGMENTS: [TablePart, string][] = [
  ["whole_body", "whole body"],
  ["arms", "arms"],
  ["trunk", "trunk"],
  ["legs", "legs"],
];

/** The 4 body parts of one segmental item (BR-REC-65). */
const segmental = (
  label: string,
  better: BetterDirection,
  min: number,
  max: number,
): MetricSeed[] =>
  SEGMENTS.map(([part, partLabel]) => ({
    ...count1(`${label} — ${partLabel}`, "%", 1, better, min, max),
    table: { group: `${label} %`, part },
  }));

const CATALOG: TypeSeed[] = [
  {
    name: "Body composition",
    intervalCount: 1,
    intervalUnit: "month",
    metrics: [
      count1("Height", "cm", 1, "none", 120, 220),
      count1("Weight", "kg", 1, "lower", 30, 250),
      count1("BMI", "", 1, "lower", 12, 60),
      count1("Body fat", "%", 1, "lower", 3, 60),
      count1("Visceral fat", "level", 1, "lower", 1, 30),
      count1("Resting metabolism", "kcal", 0, "higher", 800, 4000),
      count1("Body age", "years", 0, "lower", 10, 99),
      ...segmental("Subcutaneous fat", "lower", 1, 60),
      ...segmental("Skeletal muscle", "higher", 10, 60),
    ],
  },
  {
    name: "Fitness test",
    intervalCount: 2,
    intervalUnit: "month",
    metrics: [
      count1("Push-ups", "reps", 0, "higher", 0, 200),
      timed("Hang time", "higher", 0, 900),
      count1("Pull-ups", "reps", 0, "higher", 0, 200),
      count1("Squats in 1 min", "reps", 0, "higher", 0, 200),
      timed("Plank", "higher", 0, 900),
      count1("Deadlift", "kg", 1, "higher", 0, 400),
      count1("Back squat", "kg", 1, "higher", 0, 400),
      count1("Chest press", "kg", 1, "higher", 0, 400),
      count1("Shoulder press", "kg", 1, "higher", 0, 400),
      count1("Flexibility", "cm", 1, "higher", -30, 60),
      timed("5K run", "lower", 720, 5400),
      timed("Filthy 50", "lower", 600, 5400),
      timed("Fran", "lower", 90, 1800),
      count1("CrossFit total", "kg", 1, "higher", 0, 900),
    ],
  },
];

/**
 * Seeds `gym_settings` (defaults), `login_attempts` (id 1) and, only on an
 * empty catalog, Body composition + Fitness test with the metrics of
 * setup.md "Seed detail" (BR-REC-10, 13, 65, 68). Uses the database in
 * `DATABASE_URL`. One transaction under an advisory lock, so two runs at the
 * same time cannot both fill the catalog.
 */
export async function seed(): Promise<SeedSummary> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('seed'))`);

    const settings = await tx
      .insert(gymSettings)
      .values({ id: 1 })
      .onConflictDoNothing()
      .returning({ id: gymSettings.id });
    const attempts = await tx
      .insert(loginAttempts)
      .values({ id: 1 })
      .onConflictDoNothing()
      .returning({ id: loginAttempts.id });
    const summary: SeedSummary = {
      settingsCreated: settings.length > 0,
      loginAttemptsCreated: attempts.length > 0,
      typesCreated: 0,
      metricsCreated: 0,
    };

    // Only an empty catalog is seeded: a coach's edits (renames, order, off) stay (BR-REC-68).
    const [existing] = await tx.select({ n: count() }).from(assessmentTypes);
    if ((existing?.n ?? 0) > 0) return summary;

    for (const [typeIndex, type] of CATALOG.entries()) {
      const [created] = await tx
        .insert(assessmentTypes)
        .values({
          name: type.name,
          intervalCount: type.intervalCount,
          intervalUnit: type.intervalUnit,
          sortOrder: typeIndex + 1,
        })
        .returning({ id: assessmentTypes.id });
      if (!created) throw new Error(`Could not create ${type.name}`);
      summary.typesCreated += 1;

      await tx.insert(metrics).values(
        type.metrics.map((metric, metricIndex) => ({
          typeId: created.id,
          name: metric.name,
          unit: metric.unit,
          datatype: metric.datatype,
          decimals: metric.decimals,
          better: metric.better,
          plausibleMin: metric.min,
          plausibleMax: metric.max,
          tableGroup: metric.table?.group ?? null,
          tablePart: metric.table?.part ?? null,
          sortOrder: metricIndex + 1,
        })),
      );
      summary.metricsCreated += type.metrics.length;
    }
    return summary;
  });
}

if (import.meta.main) {
  try {
    console.log(await seed());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}
