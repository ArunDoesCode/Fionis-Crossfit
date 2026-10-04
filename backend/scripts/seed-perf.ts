/**
 * `bun run seed:perf` — the 1,000-member performance data set (BR-REC-170):
 * half male, ages 18-65, joined over 3 years, 10% archived, continuous
 * memberships, monthly body composition and two-monthly fitness tests with
 * realistic noise. Refuses any non-local database.
 *
 * Run `bun run db:reset` first for a clean set: every run ADDS members (the
 * script never deletes anything). It needs the catalog from `bun run seed`.
 */
import { eq, sql } from "drizzle-orm";

import { db, disconnectDb } from "../src/db/client";
import {
  assessments,
  assessmentTypes,
  gymSettings,
  measurements,
  members,
  membershipPeriods,
  metrics,
} from "../src/db/schemas";
import {
  addDays,
  addInterval,
  addMonths,
  daysBetween,
  gymToday,
  type IsoDate,
} from "../src/lib/domain/dates";
import { membershipEnd } from "../src/lib/domain/membership";
import {
  type IntervalUnit,
  OBJECTIVES,
  type Plan,
  type Sex,
} from "../src/lib/enums";
import { env } from "../src/lib/env";

export type PerfSeedOptions = {
  /** default 1000 */
  memberCount?: number;
  /** "today" for the generated history (default: today in the gym time zone) */
  today?: IsoDate;
  /** makes the generated data repeatable */
  randomSeed?: number;
};

/** Row counts, also printed by the script. */
export type PerfSeedSummary = {
  members: number;
  archivedMembers: number;
  periods: number;
  assessments: number;
  measurements: number;
};

const DEFAULT_MEMBER_COUNT = 1000;
const DEFAULT_TIME_ZONE = "Asia/Kolkata";
const ARCHIVED_SHARE = 0.1;
/** Share of the other members who stop renewing at some point (they show as ended). */
const LAPSED_SHARE = 0.15;
/** Share of members who stop coming to one kind of assessment (they show as overdue). */
const DROP_OFF_SHARE = 0.2;
const MEMBERS_PER_BATCH = 100;
/** Rows per INSERT: keeps every statement under the driver's 65,534-parameter limit. */
const ROWS_PER_INSERT = 5000;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Throws unless `databaseUrl` points at a local database: host `localhost`,
 * `127.0.0.1` or `::1`, and `NODE_ENV` is not `production`. The message never
 * contains the password. Pure apart from reading `NODE_ENV`.
 */
export function assertLocalDatabase(databaseUrl: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed:perf refused: NODE_ENV is production.");
  }
  let host: string;
  try {
    const url = new URL(databaseUrl);
    if (!/^postgres(ql)?:$/.test(url.protocol) || !url.hostname) {
      throw new Error("not a postgres url");
    }
    host = url.hostname.toLowerCase();
  } catch {
    throw new Error("seed:perf refused: DATABASE_URL is not a postgres URL.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `seed:perf refused: ${host} is not a local database (localhost, 127.0.0.1 or ::1).`,
    );
  }
}

// ─── repeatable randomness ──────────────────────────────────────────────────

export function createRandom(seed: number) {
  let state = seed >>> 0;
  /** mulberry32: uniform in [0, 1) */
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p: number): boolean => next() < p,
    pick<T>(items: readonly T[]): T {
      const item = items[int(0, items.length - 1)];
      if (item === undefined) throw new Error("Cannot pick from an empty list");
      return item;
    },
    /** Box-Muller */
    normal: (mean: number, sd: number): number => {
      const u = 1 - next();
      const v = next();
      return (
        mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
      );
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(0, i);
        const a = items[i] as T;
        items[i] = items[j] as T;
        items[j] = a;
      }
      return items;
    },
  };
}
type Random = ReturnType<typeof createRandom>;

// ─── who the members are ────────────────────────────────────────────────────

const FIRST_NAMES: Record<Sex, string[]> = {
  male: [
    "Arjun",
    "Rohan",
    "Vikram",
    "Karthik",
    "Suresh",
    "Anil",
    "Rahul",
    "Aditya",
    "Manoj",
    "Prakash",
    "Sanjay",
    "Naveen",
    "Deepak",
    "Harish",
    "Imran",
    "Varun",
    "Kiran",
    "Mohan",
    "Rajesh",
    "Sandeep",
  ],
  female: [
    "Priya",
    "Ananya",
    "Divya",
    "Kavya",
    "Meera",
    "Neha",
    "Pooja",
    "Sneha",
    "Lakshmi",
    "Shruti",
    "Aishwarya",
    "Deepa",
    "Isha",
    "Nisha",
    "Rekha",
    "Swati",
    "Tanvi",
    "Usha",
    "Vidya",
    "Zoya",
  ],
};
const LAST_NAMES = [
  "Sharma",
  "Reddy",
  "Nair",
  "Iyer",
  "Gowda",
  "Patel",
  "Menon",
  "Rao",
  "Kulkarni",
  "Joshi",
  "Shetty",
  "Pillai",
  "Bhat",
  "Naidu",
  "Hegde",
  "Desai",
  "Kapoor",
  "Singh",
  "Das",
  "Chopra",
];

const PLAN_WEIGHTS: readonly [Plan, number][] = [
  ["monthly", 3],
  ["quarterly", 3],
  ["half_annual", 2],
  ["annual", 2],
];

function pickPlan(random: Random): Plan {
  const total = PLAN_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random.next() * total;
  for (const [plan, weight] of PLAN_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return plan;
  }
  return "monthly";
}

type Period = { plan: Plan; startOn: IsoDate; endOn: IsoDate };

/**
 * Back-to-back periods from the join day (BR-REC-09, 51): each starts the day
 * after the previous one ends. Members who keep renewing go on until a period
 * covers today; the others stop after some period.
 */
function buildPeriods(
  joinedOn: IsoDate,
  today: IsoDate,
  stopChance: number,
  random: Random,
): Period[] {
  const periods: Period[] = [];
  let startOn = joinedOn;
  for (;;) {
    const plan = pickPlan(random);
    const endOn = membershipEnd(plan, startOn);
    periods.push({ plan, startOn, endOn });
    startOn = addDays(endOn, 1);
    if (startOn > today || random.chance(stopChance)) return periods;
  }
}

// ─── what the measurements look like ────────────────────────────────────────

/** Typical values by sex as [mean, spread across people], a drift per month (own for each person) and reading-to-reading noise. */
type Profile = {
  male: [number, number];
  female: [number, number];
  drift: number;
  noise: number;
};

const PROFILES: Record<string, Profile> = {
  height: { male: [174, 7], female: [161, 6], drift: 0, noise: 0.3 },
  weight: { male: [80, 12], female: [64, 10], drift: -0.12, noise: 0.7 },
  bmi: { male: [26, 3], female: [25, 3.5], drift: -0.04, noise: 0.25 },
  "body fat": { male: [22, 6], female: [30, 6], drift: -0.1, noise: 0.5 },
  "visceral fat": { male: [8, 3], female: [5, 2], drift: -0.03, noise: 0.4 },
  "resting metabolism": {
    male: [1750, 200],
    female: [1350, 150],
    drift: 1.5,
    noise: 20,
  },
  "body age": { male: [35, 10], female: [33, 10], drift: -0.1, noise: 1 },
  "subcutaneous fat — whole body": {
    male: [18, 5],
    female: [28, 5],
    drift: -0.1,
    noise: 0.5,
  },
  "subcutaneous fat — arms": {
    male: [20, 5],
    female: [30, 5],
    drift: -0.1,
    noise: 0.5,
  },
  "subcutaneous fat — trunk": {
    male: [17, 5],
    female: [25, 5],
    drift: -0.1,
    noise: 0.5,
  },
  "subcutaneous fat — legs": {
    male: [19, 5],
    female: [31, 5],
    drift: -0.1,
    noise: 0.5,
  },
  "skeletal muscle — whole body": {
    male: [36, 3],
    female: [29, 3],
    drift: 0.06,
    noise: 0.3,
  },
  "skeletal muscle — arms": {
    male: [38, 3],
    female: [30, 3],
    drift: 0.06,
    noise: 0.3,
  },
  "skeletal muscle — trunk": {
    male: [34, 3],
    female: [27, 3],
    drift: 0.06,
    noise: 0.3,
  },
  "skeletal muscle — legs": {
    male: [40, 3],
    female: [32, 3],
    drift: 0.06,
    noise: 0.3,
  },
  "push-ups": { male: [30, 12], female: [15, 8], drift: 0.6, noise: 2 },
  "hang time": { male: [45, 20], female: [35, 15], drift: 0.5, noise: 4 },
  "pull-ups": { male: [8, 5], female: [3, 3], drift: 0.25, noise: 1 },
  "squats in 1 min": { male: [40, 10], female: [35, 10], drift: 0.4, noise: 2 },
  plank: { male: [110, 40], female: [95, 35], drift: 1.5, noise: 8 },
  deadlift: { male: [110, 30], female: [65, 20], drift: 1.2, noise: 3 },
  "back squat": { male: [90, 25], female: [55, 15], drift: 1, noise: 3 },
  "chest press": { male: [60, 20], female: [30, 10], drift: 0.7, noise: 2 },
  "shoulder press": { male: [40, 12], female: [22, 8], drift: 0.4, noise: 1.5 },
  flexibility: { male: [5, 8], female: [12, 8], drift: 0.15, noise: 1 },
  "5k run": { male: [1650, 240], female: [1950, 270], drift: -6, noise: 40 },
  "filthy 50": { male: [1500, 300], female: [1800, 300], drift: -8, noise: 50 },
  fran: { male: [420, 120], female: [540, 140], drift: -4, noise: 20 },
  "crossfit total": { male: [280, 70], female: [160, 45], drift: 2, noise: 6 },
};

export type CatalogMetric = {
  id: string;
  typeId: string;
  name: string;
  datatype: string;
  decimals: number;
  plausibleMin: number | null;
  plausibleMax: number | null;
};

/** Profile of a measurement; one a coach added later gets values around the middle of its check range. */
export function profileOf(metric: CatalogMetric): Profile {
  const known = PROFILES[metric.name.toLowerCase()];
  if (known) return known;
  const min = metric.plausibleMin ?? 0;
  const max = metric.plausibleMax ?? 100;
  const middle: [number, number] = [(min + max) / 2, (max - min) / 10];
  return { male: middle, female: middle, drift: 0, noise: (max - min) / 60 };
}

/** One person's own level and drift for one measurement. */
type Trend = { base: number; slopePerMonth: number; profile: Profile };

function trendFor(metric: CatalogMetric, sex: Sex, random: Random): Trend {
  const profile = profileOf(metric);
  const [mean, spread] = profile[sex];
  return {
    base: random.normal(mean, spread),
    slopePerMonth: profile.drift * 2 * random.next(),
    profile,
  };
}

function readingOf(
  trend: Trend,
  metric: CatalogMetric,
  monthsSinceJoin: number,
  random: Random,
): number {
  let value =
    trend.base +
    trend.slopePerMonth * monthsSinceJoin +
    random.normal(0, trend.profile.noise);
  if (metric.plausibleMin !== null)
    value = Math.max(metric.plausibleMin, value);
  if (metric.plausibleMax !== null)
    value = Math.min(metric.plausibleMax, value);
  // durations are whole seconds (BR-REC-164); numbers keep the measurement's decimals (BR-REC-64)
  const decimals = metric.datatype === "duration" ? 0 : metric.decimals;
  return Number(value.toFixed(decimals));
}

// ─── the run ────────────────────────────────────────────────────────────────

type MemberPlan = {
  id: string;
  sex: Sex;
  archived: boolean;
  lapsed: boolean;
  joinedOn: IsoDate;
};

type TypeInfo = {
  id: string;
  intervalCount: number;
  intervalUnit: IntervalUnit;
  metrics: CatalogMetric[];
};

async function insertInChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    await insert(rows.slice(i, i + ROWS_PER_INSERT));
  }
}

async function loadCatalog(): Promise<{ types: TypeInfo[]; timeZone: string }> {
  const [typeRows, metricRows, settings] = await Promise.all([
    db
      .select({
        id: assessmentTypes.id,
        intervalCount: assessmentTypes.intervalCount,
        intervalUnit: assessmentTypes.intervalUnit,
      })
      .from(assessmentTypes)
      .where(eq(assessmentTypes.isActive, true))
      .orderBy(assessmentTypes.sortOrder),
    db
      .select({
        id: metrics.id,
        typeId: metrics.typeId,
        name: metrics.name,
        datatype: metrics.datatype,
        decimals: metrics.decimals,
        plausibleMin: metrics.plausibleMin,
        plausibleMax: metrics.plausibleMax,
      })
      .from(metrics)
      .where(eq(metrics.isActive, true))
      .orderBy(metrics.sortOrder),
    db.select({ timezone: gymSettings.timezone }).from(gymSettings).limit(1),
  ]);
  const types = typeRows.map((type) => ({
    id: type.id,
    intervalCount: type.intervalCount,
    intervalUnit: type.intervalUnit as IntervalUnit,
    metrics: metricRows.filter((metric) => metric.typeId === type.id),
  }));
  return { types, timeZone: settings[0]?.timezone ?? DEFAULT_TIME_ZONE };
}

/**
 * Calls `assertLocalDatabase(DATABASE_URL)` first, then adds the data set to
 * the database in `DATABASE_URL` (run `seed` before it: it needs the catalog).
 * Everything is written in one transaction: a failure leaves nothing behind.
 */
export async function seedPerf(
  options: PerfSeedOptions = {},
): Promise<PerfSeedSummary> {
  assertLocalDatabase(env.DATABASE_URL);

  const memberCount = options.memberCount ?? DEFAULT_MEMBER_COUNT;
  if (!Number.isInteger(memberCount) || memberCount < 1) {
    throw new Error("seed:perf: memberCount must be a whole number, 1 or more");
  }
  const random = createRandom(options.randomSeed ?? 1);

  const { types, timeZone } = await loadCatalog();
  if (types.length === 0 || types.every((t) => t.metrics.length === 0)) {
    throw new Error(
      "seed:perf needs the assessment catalog: run `bun run seed` first.",
    );
  }
  const today = options.today ?? gymToday(new Date(), timeZone);

  // Who is who: sex, archived and join day are dealt independently of each other.
  const archivedCount = Math.round(memberCount * ARCHIVED_SHARE);
  const sexes = random.shuffle(
    Array.from(
      { length: memberCount },
      (_, i): Sex => (i < Math.floor(memberCount / 2) ? "male" : "female"),
    ),
  );
  const archivedFlags = random.shuffle(
    Array.from({ length: memberCount }, (_, i) => i < archivedCount),
  );
  const earliest = addMonths(today, -36);
  const spanDays = daysBetween(earliest, today);
  const joinDays = random.shuffle(
    Array.from({ length: memberCount }, (_, i) =>
      Math.min(
        spanDays,
        Math.floor(((i + random.next()) / memberCount) * spanDays),
      ),
    ),
  );
  const plans: MemberPlan[] = sexes.map((sex, i) => ({
    id: crypto.randomUUID(),
    sex,
    archived: archivedFlags[i] === true,
    lapsed: random.chance(LAPSED_SHARE),
    joinedOn: addDays(earliest, joinDays[i] ?? 0),
  }));

  const usedPhones = new Set<string>();
  const summary: PerfSeedSummary = {
    members: 0,
    archivedMembers: 0,
    periods: 0,
    assessments: 0,
    measurements: 0,
  };

  await db.transaction(async (tx) => {
    for (let from = 0; from < plans.length; from += MEMBERS_PER_BATCH) {
      const memberRows: (typeof members.$inferInsert)[] = [];
      const periodRows: (typeof membershipPeriods.$inferInsert)[] = [];
      const assessmentRows: (typeof assessments.$inferInsert)[] = [];
      const measurementRows: (typeof measurements.$inferInsert)[] = [];

      for (const [offset, plan] of plans
        .slice(from, from + MEMBERS_PER_BATCH)
        .entries()) {
        const index = from + offset;
        const first = random.pick(FIRST_NAMES[plan.sex]);
        const last = random.pick(LAST_NAMES);
        let digits = "";
        do {
          digits = `9${String(random.int(0, 999_999_999)).padStart(9, "0")}`;
        } while (usedPhones.has(digits));
        usedPhones.add(digits);

        const periods = buildPeriods(
          plan.joinedOn,
          today,
          plan.archived ? 0.35 : plan.lapsed ? 0.25 : 0,
          random,
        );
        const lastEnd = periods[periods.length - 1]?.endOn ?? plan.joinedOn;
        const archivedOn = plan.archived
          ? [addDays(lastEnd, random.int(0, 30)), today].sort()[0]
          : null;

        const ageYears = random.int(18, 65);
        memberRows.push({
          id: plan.id,
          fullName: `${first} ${last}`,
          phone: `${digits.slice(0, 5)} ${digits.slice(5)}`,
          phoneDigits: digits,
          email: random.chance(0.4)
            ? `${first}.${last}${index}@example.com`.toLowerCase()
            : null,
          dateOfBirth: addDays(
            addMonths(today, -12 * ageYears),
            -random.int(0, 364),
          ),
          sex: plan.sex,
          joinedOn: plan.joinedOn,
          objective: random.chance(0.7) ? random.pick(OBJECTIVES) : null,
          archivedAt: archivedOn
            ? new Date(`${archivedOn}T09:00:00.000Z`)
            : null,
        });
        for (const period of periods) {
          periodRows.push({ memberId: plan.id, ...period });
        }

        // People come while they are members: from the join day to today or the end of the last period.
        const cutoff = lastEnd < today ? lastEnd : today;
        for (const type of types) {
          const dates: IsoDate[] = [];
          for (let k = 0; ; k++) {
            const anchor = addInterval(
              plan.joinedOn,
              k * type.intervalCount,
              type.intervalUnit,
            );
            // first test on the join day, later ones a few days early or late
            const date = k === 0 ? anchor : addDays(anchor, random.int(-3, 3));
            if (date > cutoff) break;
            dates.push(date);
          }
          const kept = random.chance(DROP_OFF_SHARE)
            ? dates.slice(0, random.int(1, dates.length))
            : dates;

          const trends = type.metrics.map((metric) =>
            trendFor(metric, plan.sex, random),
          );
          for (const assessedOn of kept) {
            const assessmentId = crypto.randomUUID();
            assessmentRows.push({
              id: assessmentId,
              memberId: plan.id,
              typeId: type.id,
              assessedOn,
              isEstimated: random.chance(0.03),
            });
            const months = daysBetween(plan.joinedOn, assessedOn) / 30.4;
            for (const [i, metric] of type.metrics.entries()) {
              const trend = trends[i];
              if (!trend) continue;
              measurementRows.push({
                assessmentId,
                metricId: metric.id,
                memberId: plan.id,
                measuredOn: assessedOn,
                value: readingOf(trend, metric, months, random),
              });
            }
          }
        }
      }

      await insertInChunks(memberRows, (chunk) =>
        tx.insert(members).values(chunk),
      );
      await insertInChunks(periodRows, (chunk) =>
        tx.insert(membershipPeriods).values(chunk),
      );
      await insertInChunks(assessmentRows, (chunk) =>
        tx.insert(assessments).values(chunk),
      );
      await insertInChunks(measurementRows, (chunk) =>
        tx.insert(measurements).values(chunk),
      );

      summary.members += memberRows.length;
      summary.archivedMembers += memberRows.filter((m) => m.archivedAt).length;
      summary.periods += periodRows.length;
      summary.assessments += assessmentRows.length;
      summary.measurements += measurementRows.length;
    }
  });
  // fresh planner statistics, so the first benchmark is not measured on guesses
  await db.execute(sql`analyze`);
  return summary;
}

if (import.meta.main) {
  try {
    const summary = await seedPerf();
    console.log("seed:perf done. Rows added:");
    console.table(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}
