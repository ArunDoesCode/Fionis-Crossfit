/**
 * The curated demo data set of `bun run seed:demo` (BR-REC-176) as plain rows.
 *
 * Pure: no I/O, no clock, no `Math.random`. `today` (a gym day) is an argument and the only randomness
 * is a constant-seed generator for measurement noise (it never depends on the day), so the same day
 * always gives the same rows. Every date is `today` plus a fixed offset, with one exception: the day of
 * a member's newest visit and the start of the latest membership are found by working backwards
 * through the app's own month maths (`fit`), so that "Surya is 34 days overdue" and "ends today" are
 * exact on any day. That is exact except when the wanted day is the 29th-31st and the earlier month is
 * shorter; then it lands a day or two away (the buckets of BR-REC-176 still hold: `demoProblems`).
 */
import type {
  assessments,
  dueOverrides,
  measurements,
  members,
  membershipPeriods,
} from "../src/db/schemas";
import {
  addDays,
  addInterval,
  addMonths,
  daysBetween,
  type IsoDate,
} from "../src/lib/domain/dates";
import {
  computeDue,
  type DueAssessmentType,
  dueListRows,
  isListedInDueList,
} from "../src/lib/domain/due";
import {
  membershipEnd,
  membershipStatus,
  PLAN_MONTHS,
} from "../src/lib/domain/membership";
import {
  type MetricDecimals,
  roundMetricValue,
} from "../src/lib/domain/metric-value";
import type {
  BetterDirection,
  Datatype,
  DueOverrideKind,
  IntervalUnit,
  Objective,
  Plan,
  Sex,
} from "../src/lib/enums";
import { type CatalogMetric, createRandom, profileOf } from "./seed-perf";

export const BODY_COMPOSITION = "Body composition";
export const FITNESS_TEST = "Fitness test";

/** The 25 fixed member ids (links survive a re-seed): `00000000-0000-4000-8000-0000000000NN`, NN = 01..25. */
export const DEMO_MEMBER_IDS: readonly string[] = Array.from(
  { length: 25 },
  (_, i) =>
    `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
);

const RANDOM_SEED = 176;
/** BR-REC-53: "ended in the last 30 days" */
const RECENT_DAYS = 30;

// ─── the catalog, as `seed` made it ─────────────────────────────────────────

export type DemoMetric = CatalogMetric & {
  better: BetterDirection;
  isActive: boolean;
  sortOrder: number;
  intervalCount: number | null;
  intervalUnit: IntervalUnit | null;
};

export type DemoType = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  intervalCount: number;
  intervalUnit: IntervalUnit;
  metrics: DemoMetric[];
};

type MemberRow = typeof members.$inferInsert & { id: string };
type PeriodRow = typeof membershipPeriods.$inferInsert;
type AssessmentRow = typeof assessments.$inferInsert & { id: string };
type MeasurementRow = typeof measurements.$inferInsert;
type OverrideRow = typeof dueOverrides.$inferInsert;

export type DemoRows = {
  members: MemberRow[];
  periods: PeriodRow[];
  assessments: AssessmentRow[];
  measurements: MeasurementRow[];
  overrides: OverrideRow[];
};

// ─── who the 25 are ─────────────────────────────────────────────────────────

type Trend = "improve" | "worse" | "plateau";

/** How many visits, and where the newest one is: `due` = day its next one is due, `on` = the day itself (both relative to today). */
type Visits = { n: number; due?: number; on?: number };

type Spec = {
  name: string;
  sex: Sex;
  age: number;
  height: number;
  /** body level: higher = heavier and fatter than the average of the sex */
  z: number;
  /** fitness level: higher = better at every test */
  f: number;
  phone: string;
  email?: string;
  objective?: Objective;
  notes?: string;
  /** the latest membership period; `end` / `start` = day offset from today */
  plan: Plan;
  end?: number;
  start?: number;
  /** plan of the periods before it (default: the same) */
  earlier?: Plan;
  /** day offset the member was archived */
  archived?: number;
  bc?: Visits & { trend?: Trend; segmentalFrom?: number };
  ft?: Visits & { partial?: { on: number; metrics: string[] } };
  /** the newest visit of this assessment has an estimated date (BR-REC-79) */
  estimated?: "bc" | "ft";
  /** one "Assess soon" or "Remind me later" on this member's assessment */
  hold?: {
    type: "bc" | "ft";
    kind: DueOverrideKind;
    setOn: number;
    until?: number;
  };
};

/** `90000 1xxxx`, some with +91 (BR-REC-46). */
const ph = (nn: number, intl = false): string =>
  `${intl ? "+91 " : ""}90000 1${String(nn).padStart(4, "0")}`;

// Order = member id number (index + 1). Bands: 19, 18 | 20s x5 | 30s x6 | 40s x5 | 50s x4 | 60+ x3, both sexes in each.
const ROSTER: Spec[] = [
  // ── Active (15) ──
  {
    // 34 days overdue in Body composition on any day (spec example)
    name: "Surya Pratap",
    sex: "male",
    age: 31,
    height: 172,
    z: 0.5,
    f: 0.9,
    phone: ph(1),
    email: "surya.pratap@example.com",
    objective: "strength",
    plan: "annual",
    end: 210,
    bc: { n: 9, due: -34, segmentalFrom: 0 },
    ft: { n: 4, due: 30 },
  },
  {
    // "Assess soon" on a member whose dates are fine
    name: "Kavya Iyer",
    sex: "female",
    age: 33,
    height: 160,
    z: -0.3,
    f: 0.6,
    phone: ph(2),
    email: "kavya.iyer@example.com",
    objective: "fat_loss",
    plan: "quarterly",
    end: 75,
    bc: { n: 10, due: 20, segmentalFrom: 0 },
    ft: { n: 4, due: 35 },
    estimated: "bc",
    hold: { type: "bc", kind: "flag", setOn: -3 },
  },
  {
    // 14 readings: the trend line keeps the last 12
    name: "Rajesh Menon",
    sex: "male",
    age: 43,
    height: 176,
    z: 0.8,
    f: 0.3,
    phone: ph(3, true),
    objective: "general_fitness",
    notes:
      "Prefers the 6 am class. Lower back: no heavy deadlifts until cleared.",
    plan: "annual",
    end: 300,
    bc: { n: 14, due: 12, segmentalFrom: 0 },
    ft: { n: 5, due: 28 },
  },
  {
    // latest Fitness test is partly recorded (Fran + Push-ups); the rest is overdue
    name: "Ananya Reddy",
    sex: "female",
    age: 24,
    height: 163,
    z: -0.6,
    f: 1.2,
    phone: ph(4),
    objective: "strength",
    plan: "half_annual",
    end: 150,
    bc: { n: 9, due: 5, segmentalFrom: 0 },
    ft: { n: 3, due: -10, partial: { on: -15, metrics: ["Fran", "Push-ups"] } },
  },
  {
    name: "Rohan Mehta",
    sex: "male",
    age: 27,
    height: 178,
    z: -0.2,
    f: 1.3,
    phone: ph(5),
    email: "rohan.mehta@example.com",
    plan: "quarterly",
    end: 50,
    bc: { n: 8, due: 2 },
    ft: { n: 4, due: 26 },
  },
  {
    // getting worse
    name: "Meera Joshi",
    sex: "female",
    age: 44,
    height: 158,
    z: 0.7,
    f: -0.4,
    phone: ph(6),
    objective: "fat_loss",
    plan: "half_annual",
    end: 100,
    bc: { n: 9, due: 6, trend: "worse", segmentalFrom: 0 },
    ft: { n: 3, due: 31 },
  },
  {
    // plateau: under 1% change
    name: "Karthik Gowda",
    sex: "male",
    age: 36,
    height: 170,
    z: 0.2,
    f: 0,
    phone: ph(7),
    plan: "annual",
    end: 120,
    bc: { n: 9, due: 18, trend: "plateau" },
    ft: { n: 4, due: 34 },
  },
  {
    // new joiner, one Body composition reading
    name: "Tanvi Patel",
    sex: "female",
    age: 19,
    height: 162,
    z: -0.8,
    f: -0.2,
    phone: ph(8),
    objective: "general_fitness",
    plan: "quarterly",
    start: -10,
    bc: { n: 1, on: -10 },
    ft: { n: 1, on: -10 },
  },
  {
    // new joiner, never recorded
    name: "Pooja Hegde",
    sex: "female",
    age: 34,
    height: 157,
    z: 0.1,
    f: 0,
    phone: ph(9),
    notes: "Trial week. Wants a body scan after the first week.",
    plan: "monthly",
    start: -3,
  },
  {
    // joined today: did the Fitness test, Body composition is due today
    name: "Aditya Sharma",
    sex: "male",
    age: 18,
    height: 175,
    z: -0.5,
    f: 0.4,
    phone: "+91 98450 22171",
    notes: "Joined with his mother (same phone).",
    plan: "annual",
    start: 0,
    ft: { n: 1, on: 0 },
  },
  {
    // renewed early: the next period starts in 9 days
    name: "Divya Nair",
    sex: "female",
    age: 26,
    height: 165,
    z: 0.3,
    f: 0.8,
    phone: ph(11),
    email: "divya.nair@example.com",
    plan: "quarterly",
    start: 9,
    bc: { n: 8, due: -3 },
    ft: { n: 4, due: 23 },
  },
  {
    // "Assess soon" on an overdue assessment
    name: "Imran Sheikh",
    sex: "male",
    age: 29,
    height: 173,
    z: 0,
    f: 1.1,
    phone: ph(12),
    plan: "half_annual",
    end: 60,
    bc: { n: 8, due: -12, segmentalFrom: 0 },
    ft: { n: 4, due: 29 },
    hold: { type: "bc", kind: "flag", setOn: -5 },
  },
  {
    name: "Priya Sharma",
    sex: "female",
    age: 41,
    height: 155,
    z: 0.9,
    f: -0.1,
    phone: "98450 22171",
    objective: "fat_loss",
    plan: "annual",
    end: 250,
    bc: { n: 8, due: -30 },
    ft: { n: 3, due: 25 },
  },
  {
    // Fitness test overdue, reminder in a month
    name: "Naveen Kumar",
    sex: "male",
    age: 46,
    height: 168,
    z: 1,
    f: -0.6,
    phone: ph(14, true),
    plan: "quarterly",
    end: 40,
    bc: { n: 6, due: -75 },
    ft: { n: 3, due: -20 },
    hold: { type: "ft", kind: "snooze", setOn: -6, until: 30 },
  },
  {
    // away for months; Fitness test reminder is tomorrow
    name: "Neha Kulkarni",
    sex: "female",
    age: 22,
    height: 161,
    z: -0.4,
    f: 0.3,
    phone: ph(15),
    plan: "half_annual",
    end: 170,
    bc: { n: 5, due: -130 },
    ft: { n: 3, due: -45 },
    hold: { type: "ft", kind: "snooze", setOn: -2, until: 1 },
  },
  // ── Expiring (4) ──
  {
    name: "Lakshmi Pillai",
    sex: "female",
    age: 37,
    height: 159,
    z: 0.4,
    f: 0.1,
    phone: ph(16),
    plan: "quarterly",
    end: 0,
    bc: { n: 7, due: 10, segmentalFrom: 0 },
    ft: { n: 3, due: 24 },
  },
  {
    name: "Vikram Chopra",
    sex: "male",
    age: 39,
    height: 180,
    z: -0.1,
    f: 0.7,
    phone: ph(17),
    plan: "monthly",
    earlier: "quarterly",
    end: 3,
    bc: { n: 6, due: 10 },
    ft: { n: 3, due: 21 },
  },
  {
    name: "Shruti Rao",
    sex: "female",
    age: 48,
    height: 154,
    z: 0.6,
    f: -0.7,
    phone: ph(18),
    plan: "half_annual",
    end: 9,
    bc: { n: 8, due: 11 },
    ft: { n: 4, due: 36 },
  },
  {
    name: "Harish Shetty",
    sex: "male",
    age: 52,
    height: 171,
    z: 0.5,
    f: -0.2,
    phone: ph(19, true),
    plan: "annual",
    end: 13,
    bc: { n: 6, due: 14 },
    ft: { n: 3, due: 29 },
  },
  // ── Recently ended (3) and ended too long ago for the list (1) ──
  {
    name: "Maria D'Souza",
    sex: "female",
    age: 54,
    height: 156,
    z: 0.2,
    f: -0.5,
    phone: ph(20),
    plan: "monthly",
    earlier: "quarterly",
    end: -5,
    bc: { n: 7, on: -26 },
    ft: { n: 3, on: -33 },
  },
  {
    name: "Manoj Desai",
    sex: "male",
    age: 57,
    height: 169,
    z: 0.9,
    f: -0.9,
    phone: ph(21),
    plan: "quarterly",
    end: -12,
    bc: { n: 6, on: -38 },
    ft: { n: 3, on: -45 },
    estimated: "ft",
  },
  {
    name: "Usha Naidu",
    sex: "female",
    age: 59,
    height: 152,
    z: 0,
    f: -0.8,
    phone: ph(22, true),
    plan: "half_annual",
    end: -27,
    bc: { n: 5, on: -50 },
    ft: { n: 3, on: -57 },
  },
  {
    name: "Venkata Subramanya Sai Kishore Chandrasekharan",
    sex: "male",
    age: 64,
    height: 166,
    z: -0.3,
    f: -1,
    phone: ph(23),
    plan: "annual",
    end: -45,
    bc: { n: 5, on: -75 },
    ft: { n: 4, on: -80 },
  },
  // ── Archived (2) ──
  {
    name: "Sandeep Bhat",
    sex: "male",
    age: 68,
    height: 165,
    z: 0.6,
    f: -1.1,
    phone: ph(24),
    plan: "quarterly",
    end: -120,
    archived: -100,
    bc: { n: 4, on: -160, segmentalFrom: 4 },
    ft: { n: 3, on: -170 },
  },
  {
    // archived while the membership still runs (BR-REC-172 banner)
    name: "Rekha Kapoor",
    sex: "female",
    age: 61,
    height: 153,
    z: 0.4,
    f: -0.6,
    phone: ph(25),
    notes: "Moved to Pune: archived at her request.",
    plan: "half_annual",
    end: 60,
    archived: -7,
    bc: { n: 3, on: -40 },
    ft: { n: 3, on: -45 },
  },
];

/** Equal results (BR-REC-107, 115): the 3rd best of the 11 non-archived members of a sex gets the 2nd best's latest value, so ranks run 1, 2, 2, 4. */
const TIES: [measurement: string, sex: Sex][] = [
  ["Fran", "male"],
  ["Deadlift", "female"],
  ["CrossFit total", "male"],
];

// ─── dates ──────────────────────────────────────────────────────────────────

/**
 * The day `from` within 4 days of `guess` whose `forward(from)` lands on `target`; when no day does
 * (month-end clamps) the closest one, a tie going to the later result. `atLeast` never lets the result
 * fall before `target` (an Expiring membership must not end a day early).
 */
function fit(
  target: IsoDate,
  forward: (from: IsoDate) => IsoDate,
  guess: IsoDate,
  side: "nearest" | "atLeast" = "nearest",
): IsoDate {
  let best = guess;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let delta = -4; delta <= 4; delta++) {
    const from = addDays(guess, delta);
    const gap = daysBetween(target, forward(from));
    if (side === "atLeast" && gap < 0) continue;
    const score = Math.abs(gap) * 2 + (gap < 0 ? 1 : 0);
    if (score < bestScore) {
      best = from;
      bestScore = score;
    }
  }
  return best;
}

/** Dates of one assessment's visits, oldest first, one repeat interval apart. */
function visitDates(today: IsoDate, type: DemoType, visits: Visits): IsoDate[] {
  let last = addDays(today, visits.on ?? 0);
  if (visits.due !== undefined) {
    // the newest visit is placed so that its next one is due on the asked day
    const dueOn = addDays(today, visits.due);
    last = fit(
      dueOn,
      (from) => addInterval(from, type.intervalCount, type.intervalUnit),
      addInterval(dueOn, -type.intervalCount, type.intervalUnit),
    );
  }
  // the older ones are a fixed number of days apart (a month = 30.4 days), so they move with today
  const stepDays =
    type.intervalUnit === "week"
      ? 7 * type.intervalCount
      : Math.round(30.4 * type.intervalCount);
  return Array.from({ length: visits.n }, (_, i) =>
    addDays(last, -(visits.n - 1 - i) * stepDays),
  );
}

type Period = { plan: Plan; startOn: IsoDate; endOn: IsoDate };

/** Days of the longest period of each plan. */
const LONGEST: Record<Plan, number> = {
  monthly: 31,
  quarterly: 92,
  half_annual: 184,
  annual: 366,
};

/**
 * The membership periods ending with the latest one (BR-REC-09, 51), going back until one starts on or
 * before `coverFrom` (the first reading). The join day is the first period's start (BR-REC-50).
 */
function periodsOf(
  today: IsoDate,
  spec: Spec,
  coverFrom: IsoDate | null,
): Period[] {
  let startOn: IsoDate;
  if (spec.start !== undefined) {
    startOn = addDays(today, spec.start);
  } else {
    const end = spec.end ?? 0;
    const endOn = addDays(today, end);
    // an Expiring member (ends within the 14 lead days) must never end a day early
    startOn = fit(
      endOn,
      (from) => membershipEnd(spec.plan, from),
      addMonths(addDays(endOn, 1), -PLAN_MONTHS[spec.plan]),
      end >= 0 && end <= 14 ? "atLeast" : "nearest",
    );
  }
  const periods: Period[] = [
    { plan: spec.plan, startOn, endOn: membershipEnd(spec.plan, startOn) },
  ];
  // earlier periods sit a fixed number of days apart (the longest their plan can be: never an overlap,
  // at most 3 days between two) so every date moves with today
  const earlier = spec.earlier ?? spec.plan;
  while (coverFrom !== null && (periods[0]?.startOn ?? coverFrom) > coverFrom) {
    const start = addDays(periods[0]?.startOn ?? coverFrom, -LONGEST[earlier]);
    periods.unshift({
      plan: earlier,
      startOn: start,
      endOn: membershipEnd(earlier, start),
    });
  }
  return periods;
}

// ─── values ─────────────────────────────────────────────────────────────────

/** Body composition change per month for a member who improves; worse = the other way, plateau = none. */
const TREND_FACTOR: Record<Trend, number> = {
  improve: 1,
  worse: -1.2,
  plateau: 0,
};
const NOISE_FACTOR: Record<Trend, number> = {
  improve: 0.6,
  worse: 0.6,
  plateau: 0.12,
};
const BODY_SLOPE: Record<string, number> = {
  weight: -0.4,
  "body fat": -0.3,
  "visceral fat": -0.06,
  "resting metabolism": 3,
  "body age": -0.25,
};

const isSegmental = (name: string): boolean =>
  name.startsWith("subcutaneous fat") || name.startsWith("skeletal muscle");

function bodySlope(name: string): number {
  if (name.startsWith("subcutaneous fat")) return -0.3;
  if (name.startsWith("skeletal muscle")) return 0.12;
  return BODY_SLOPE[name] ?? 0;
}

const turnedOn = (type: DemoType): DemoMetric[] =>
  type.metrics
    .filter((metric) => metric.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

type Visit = {
  type: DemoType;
  on: IsoDate;
  metrics: DemoMetric[];
  step: number;
  trend: Trend;
  estimated: boolean;
};

type NewestFitness = {
  metricId: string;
  sex: Sex;
  archived: boolean;
  row: MeasurementRow;
};

/**
 * The 25 members, their membership periods, assessments, values and the four "Assess soon" /
 * "Remind me later" entries for the gym day `today` (BR-REC-176). `types` is the catalog.
 */
export function buildDemoRows(today: IsoDate, types: DemoType[]): DemoRows {
  const body = types.find((type) => type.name === BODY_COMPOSITION);
  const fitness = types.find((type) => type.name === FITNESS_TEST);
  if (!body || !fitness) {
    throw new Error(
      `The demo data needs the "${BODY_COMPOSITION}" and "${FITNESS_TEST}" assessments of the default catalog.`,
    );
  }
  const random = createRandom(RANDOM_SEED);
  const biases = new Map<string, number>();
  const newest = new Map<string, NewestFitness>();
  const rows: DemoRows = {
    members: [],
    periods: [],
    assessments: [],
    measurements: [],
    overrides: [],
  };

  /** Values of one visit: level of the person + their own offset + the trend of the visit + noise, as E26 would store them. */
  const valuesOf = (spec: Spec, visit: Visit): [DemoMetric, number][] => {
    const isBody = visit.type === body;
    const monthsPerStep =
      visit.type.intervalCount *
      (visit.type.intervalUnit === "week" ? 0.23 : 1);
    const out: [DemoMetric, number][] = [];
    let weight: number | undefined;
    for (const metric of visit.metrics) {
      const name = metric.name.toLowerCase();
      const profile = profileOf(metric);
      const [mean, spread] = profile[spec.sex];
      let value: number;
      if (isBody && name === "height") {
        value = spec.height;
      } else if (isBody && name === "bmi" && weight !== undefined) {
        value = weight / (spec.height / 100) ** 2;
      } else {
        let level: number;
        if (isBody && name === "body age") {
          level = spec.age + 2 * spec.z;
        } else if (isBody) {
          const sign = name.startsWith("skeletal muscle") ? -1 : 1;
          level = mean + sign * spread * 0.75 * spec.z;
        } else {
          level = mean + (metric.better === "lower" ? -1 : 1) * spread * spec.f;
        }
        const key = `${spec.name}|${name}`;
        let bias = biases.get(key);
        if (bias === undefined) {
          bias = random.normal(0, spread * 0.2);
          biases.set(key, bias);
        }
        const slope = isBody
          ? bodySlope(name) * TREND_FACTOR[visit.trend]
          : profile.drift;
        const noise =
          profile.noise * (isBody ? NOISE_FACTOR[visit.trend] : 0.6);
        value =
          level +
          bias +
          slope * visit.step * monthsPerStep +
          random.normal(0, noise);
      }
      const clamped = Math.min(
        metric.plausibleMax ?? Number.POSITIVE_INFINITY,
        Math.max(metric.plausibleMin ?? Number.NEGATIVE_INFINITY, value),
      );
      const rounded = roundMetricValue(
        clamped,
        metric.datatype as Datatype,
        metric.decimals as MetricDecimals,
      );
      if (isBody && name === "weight") weight = rounded;
      out.push([metric, rounded]);
    }
    return out;
  };

  for (const [index, spec] of ROSTER.entries()) {
    const id = DEMO_MEMBER_IDS[index] as string;

    const visits: Visit[] = [];
    if (spec.bc) {
      const dates = visitDates(today, body, spec.bc);
      const from = spec.bc.segmentalFrom ?? Math.max(0, spec.bc.n - 2);
      for (const [k, on] of dates.entries()) {
        visits.push({
          type: body,
          on,
          // older readings come from a scale without the body-part table
          metrics: turnedOn(body).filter(
            (metric) => k >= from || !isSegmental(metric.name.toLowerCase()),
          ),
          step: k,
          trend: spec.bc.trend ?? "improve",
          estimated: spec.estimated === "bc" && k === dates.length - 1,
        });
      }
    }
    if (spec.ft) {
      const dates = visitDates(today, fitness, spec.ft);
      for (const [k, on] of dates.entries()) {
        visits.push({
          type: fitness,
          on,
          metrics: turnedOn(fitness),
          step: k,
          trend: "improve",
          estimated: spec.estimated === "ft" && k === dates.length - 1,
        });
      }
      if (spec.ft.partial) {
        const wanted = spec.ft.partial.metrics.map((name) =>
          name.toLowerCase(),
        );
        visits.push({
          type: fitness,
          on: addDays(today, spec.ft.partial.on),
          metrics: turnedOn(fitness).filter((metric) =>
            wanted.includes(metric.name.toLowerCase()),
          ),
          step: dates.length,
          trend: "improve",
          estimated: false,
        });
      }
    }

    const periods = periodsOf(
      today,
      spec,
      visits.map((visit) => visit.on).sort()[0] ?? null,
    );
    const joinedOn = periods[0]?.startOn ?? today;
    for (const period of periods) {
      rows.periods.push({ memberId: id, ...period });
    }

    rows.members.push({
      id,
      fullName: spec.name,
      phone: spec.phone,
      phoneDigits: spec.phone.replace(/\D/g, ""),
      email: spec.email ?? null,
      // born 10-289 days before the day `age` years ago, so the age is the same on neighbouring days
      dateOfBirth: addDays(
        addMonths(today, -12 * spec.age),
        -(((index * 53 + 17) % 280) + 10),
      ),
      sex: spec.sex,
      joinedOn,
      objective: spec.objective ?? null,
      notes: spec.notes ?? null,
      archivedAt:
        spec.archived === undefined
          ? null
          : new Date(`${addDays(today, spec.archived)}T09:00:00.000Z`),
    });

    for (const visit of visits) {
      const assessmentId = crypto.randomUUID();
      rows.assessments.push({
        id: assessmentId,
        memberId: id,
        typeId: visit.type.id,
        assessedOn: visit.on,
        isEstimated: visit.estimated,
      });
      for (const [metric, value] of valuesOf(spec, visit)) {
        const row: MeasurementRow = {
          assessmentId,
          metricId: metric.id,
          memberId: id,
          measuredOn: visit.on,
          value,
        };
        rows.measurements.push(row);
        if (visit.type === fitness) {
          const key = `${id}|${metric.id}`;
          const known = newest.get(key);
          if (!known || visit.on >= known.row.measuredOn) {
            newest.set(key, {
              metricId: metric.id,
              sex: spec.sex,
              archived: spec.archived !== undefined,
              row,
            });
          }
        }
      }
    }

    if (spec.hold) {
      const type = spec.hold.type === "bc" ? body : fitness;
      rows.overrides.push({
        memberId: id,
        typeId: type.id,
        kind: spec.hold.kind,
        setOn: addDays(today, spec.hold.setOn),
        untilOn:
          spec.hold.until === undefined
            ? null
            : addDays(today, spec.hold.until),
      });
    }
  }

  // equal results: ranks 1, 2, 2, 4 on the leaderboard
  for (const [name, sex] of TIES) {
    const metric = fitness.metrics.find(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    );
    if (!metric || metric.better === "none") continue;
    const ranked = [...newest.values()]
      .filter((n) => n.metricId === metric.id && n.sex === sex && !n.archived)
      .sort((a, b) =>
        metric.better === "higher"
          ? b.row.value - a.row.value
          : a.row.value - b.row.value,
      );
    const second = ranked[1];
    const third = ranked[2];
    if (second && third) third.row.value = second.row.value;
  }
  return rows;
}

// ─── the Check column of BR-REC-176, counted on the rows ────────────────────

export type DemoBuckets = {
  members: number;
  archived: number;
  active: number;
  expiring: number;
  recentlyEnded: number;
  endedLongAgo: number;
  /** listed members whose Body composition is overdue */
  overdue: number;
  dueToday: number;
  dueSoon: number;
  neverRecorded: number;
  partlyRecorded: number;
  flagged: number;
  snoozed: number;
  /** rows on the Overdue / Due soon tab of the Due list */
  overdueRows: number;
  soonRows: number;
  /** days the member "Surya Pratap" is overdue in Body composition on the Overdue tab; null when not shown */
  suryaOverdueDays: number | null;
};

/**
 * Counts the buckets the way the app does (`membershipStatus`, `computeDue`, `dueListRows`,
 * `isListedInDueList`); an override is still active (it was written after every assessment).
 */
export function demoBuckets(
  rows: DemoRows,
  types: DemoType[],
  today: IsoDate,
  leads: { upcomingLeadDays: number; expiryLeadDays: number },
): DemoBuckets {
  const latestOf = (memberId: string): Period | null => {
    const own = rows.periods
      .filter((p) => p.memberId === memberId)
      .sort((a, b) => (a.startOn < b.startOn ? 1 : -1))[0];
    return own
      ? { plan: own.plan as Plan, startOn: own.startOn, endOn: own.endOn }
      : null;
  };
  const dueTypes: DueAssessmentType[] = types.map((type) => ({
    id: type.id,
    name: type.name,
    isActive: type.isActive,
    sortOrder: type.sortOrder,
    intervalCount: type.intervalCount,
    intervalUnit: type.intervalUnit,
    measurements: type.metrics.map((metric) => ({
      id: metric.id,
      name: metric.name,
      isActive: metric.isActive,
      sortOrder: metric.sortOrder,
      intervalCount: metric.intervalCount,
      intervalUnit: metric.intervalUnit,
    })),
  }));
  const statuses = computeDue({
    today,
    upcomingLeadDays: leads.upcomingLeadDays,
    members: rows.members.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      joinedOn: m.joinedOn,
    })),
    types: dueTypes,
    lastMeasured: rows.measurements.map((x) => ({
      memberId: x.memberId,
      metricId: x.metricId,
      measuredOn: x.measuredOn,
    })),
    overrides: rows.overrides.map((o) => ({
      memberId: o.memberId,
      typeId: o.typeId,
      kind: o.kind as DueOverrideKind,
      setOn: o.setOn,
      untilOn: o.untilOn ?? null,
      latestAssessedOnSinceSet: null,
    })),
  });

  const listed = new Set(
    rows.members
      .filter((m) =>
        isListedInDueList(
          { archived: m.archivedAt != null, latestMembership: latestOf(m.id) },
          today,
        ),
      )
      .map((m) => m.id),
  );
  const shown = statuses.filter((s) => listed.has(s.memberId));
  const distinct = (list: typeof statuses): number =>
    new Set(list.map((s) => s.memberId)).size;

  const live = rows.members.filter((m) => m.archivedAt == null);
  const states = live.map((m) =>
    membershipStatus(latestOf(m.id), today, leads.expiryLeadDays),
  );
  const withAssessments = new Set(rows.assessments.map((a) => a.memberId));
  const valuesPer = new Map<string, number>();
  for (const x of rows.measurements) {
    valuesPer.set(x.assessmentId, (valuesPer.get(x.assessmentId) ?? 0) + 1);
  }
  const metricsOf = (typeId: string): number =>
    types.find((t) => t.id === typeId)?.metrics.filter((m) => m.isActive)
      .length ?? 0;
  const overdueTab = dueListRows(shown, "overdue");

  return {
    members: rows.members.length,
    archived: rows.members.length - live.length,
    active: states.filter((s) => s?.status === "active").length,
    expiring: states.filter((s) => s?.status === "expiring").length,
    recentlyEnded: states.filter(
      (s) => s?.status === "expired" && s.daysLeft >= -RECENT_DAYS,
    ).length,
    endedLongAgo: states.filter(
      (s) => s?.status === "expired" && s.daysLeft < -RECENT_DAYS,
    ).length,
    overdue: distinct(
      shown.filter(
        (s) => s.typeName === BODY_COMPOSITION && s.state === "overdue",
      ),
    ),
    dueToday: distinct(
      shown.filter((s) => s.state === "upcoming" && s.daysOverdue === 0),
    ),
    dueSoon: distinct(shown.filter((s) => s.state === "upcoming")),
    neverRecorded: rows.members.filter(
      (m) => listed.has(m.id) && !withAssessments.has(m.id),
    ).length,
    partlyRecorded: rows.assessments.filter((a) => {
      const n = valuesPer.get(a.id) ?? 0;
      return n > 0 && n < metricsOf(a.typeId);
    }).length,
    flagged: statuses.filter((s) => s.flagged).length,
    snoozed: statuses.filter((s) => s.snoozedUntil !== null).length,
    overdueRows: overdueTab.length,
    soonRows: dueListRows(shown, "upcoming").length,
    suryaOverdueDays:
      overdueTab.find(
        (r) =>
          r.fullName === "Surya Pratap" &&
          r.typeName === BODY_COMPOSITION &&
          !r.flagged,
      )?.daysOverdue ?? null,
  };
}

/** What is wrong with the buckets, one line each; empty when every item of the Check column holds. */
export function demoProblems(b: DemoBuckets): string[] {
  const rules: [string, boolean][] = [
    ["25 members", b.members === 25],
    ["4 Expiring", b.expiring === 4],
    ["3 Recently ended", b.recentlyEnded === 3],
    ["1 ended long ago", b.endedLongAgo === 1],
    ["2 Archived", b.archived === 2],
    ["Active members", b.active >= 5],
    ["at least 5 overdue in Body composition", b.overdue >= 5],
    ["exactly 1 due today", b.dueToday === 1],
    ["at least 3 due soon", b.dueSoon >= 3],
    ["exactly 1 never recorded", b.neverRecorded === 1],
    ["a partly recorded assessment", b.partlyRecorded >= 1],
    ["2 Assess soon", b.flagged === 2],
    ["2 Remind me later", b.snoozed === 2],
    ["rows on the Overdue tab", b.overdueRows >= 1],
    ["rows on the Due soon tab", b.soonRows >= 1],
  ];
  return rules.filter(([, holds]) => !holds).map(([title]) => title);
}
