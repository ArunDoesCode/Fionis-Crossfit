import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import {
  assertDemoSeedAllowed,
  DEMO_MEMBER_IDS,
  seedDemo,
} from "../../scripts/seed-demo";
import { db } from "../../src/db/client";
import {
  ageOn,
  daysBetween,
  gymToday,
  type IsoDate,
} from "../../src/lib/domain/dates";
import { type DueStatus, dueListRows } from "../../src/lib/domain/due";
import { membershipEnd } from "../../src/lib/domain/membership";
import type { Plan } from "../../src/lib/enums";
import {
  BODY_COMPOSITION,
  type Buckets,
  bucketsOf,
  cleanAll,
  type DemoData,
  type DemoMeasurement,
  dueStatuses,
  listedIds,
  prepareCatalog,
  readDemo,
  rows,
  snapshotOf,
  wipeDemo,
} from "./support/demo-data";

// BR-REC-176: `seed:demo` (run after `db:reset`) creates exactly 25 named demo members whose every
// date is today (the gym day) plus a fixed offset, so the same day gives the same rows and the demo
// always has something on every screen. It refuses a non-local database, a `*_test` database and a
// database that already holds members, and it creates no login.
//
// These tests run `seedDemo` directly against the *_test database (the `_test` refusal lives in
// `assertDemoSeedAllowed` and the command line only) and remove the demo rows by their fixed member
// ids afterwards. Dates are fixed days, not the real clock, except in the default-day tests.

const TODAY = "2026-10-04";
const NEXT_DAY = "2026-10-05";
const SLOW = 120_000;

const SUPABASE_URL =
  "postgresql://postgres.abcdefgh:s3cr3tpw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

afterAll(cleanAll, SLOW);

/** The error a call ends with; undefined when it did not fail. */
async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "");

const countOf = async (table: string): Promise<number> => {
  const [row] = await rows(
    sql`select count(*)::int as n from ${sql.raw(table)}`,
  );
  return Number(row?.n);
};

// ─── the wiring ─────────────────────────────────────────────────────────────

describe("BR-REC-176 the script is wired", () => {
  test("BR-REC-176 the fixed member ids are the 25 uuids 00000000-0000-4000-8000-0000000000NN, NN = 01..25", () => {
    const expected = Array.from(
      { length: 25 },
      (_, i) =>
        `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
    );
    expect([...DEMO_MEMBER_IDS].sort()).toEqual(expected);
  });

  test("BR-REC-176 the package script `seed:demo` runs bun scripts/seed-demo.ts", () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, "../../package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["seed:demo"]).toBe("bun scripts/seed-demo.ts");
  });
});

// ─── the guards ─────────────────────────────────────────────────────────────

describe("BR-REC-176 the guard: local only, never a *_test database, never production", () => {
  const local = [
    "postgresql://postgres:postgres@localhost:5432/gym",
    "postgres://gym:gym@127.0.0.1:5432/gym",
  ];
  const remote = [
    SUPABASE_URL,
    "postgresql://postgres:s3cr3tpw@db.abcdefghijkl.supabase.co:5432/postgres",
    "postgres://gym:s3cr3tpw@10.0.0.5:5432/gym",
    "postgres://gym:s3cr3tpw@203.0.113.9:5432/gym",
    "postgres://gym:s3cr3tpw@db.example.com:5432/gym",
    "postgres://gym:s3cr3tpw@localhost.evil.example:5432/gym",
    "postgres://gym:s3cr3tpw@notlocalhost:5432/gym",
  ];
  const testDatabases = [
    "postgres://gym:s3cr3tpw@localhost:5433/gym_test",
    "postgres://gym:s3cr3tpw@127.0.0.1:5432/other_test",
  ];

  /** The refusal message; "" when nothing was thrown. An unbuilt stub is not a refusal. */
  function refusalOf(url: string, nodeEnv?: string): string {
    try {
      assertDemoSeedAllowed(url, nodeEnv);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not implemented/i.test(message)) {
        throw new Error("assertDemoSeedAllowed is not built yet");
      }
      return message;
    }
    return "";
  }

  for (const url of local) {
    test(`BR-REC-176 a local database that is not a test database is allowed: ${new URL(url).host}`, () => {
      expect(() => assertDemoSeedAllowed(url, "development")).not.toThrow();
    });
  }

  for (const url of remote) {
    test(`BR-REC-176 a non-local database is refused: ${new URL(url).host}`, () => {
      expect(refusalOf(url, "development")).not.toBe("");
    });
  }

  for (const url of testDatabases) {
    test(`BR-REC-176 a *_test database is refused even on a local host: ${new URL(url).pathname}`, () => {
      expect(refusalOf(url, "development")).not.toBe("");
    });
  }

  test("BR-REC-176 NODE_ENV production is refused even for a local database", () => {
    for (const url of local) {
      expect(refusalOf(url, "production")).not.toBe("");
    }
  });

  test("BR-REC-176 no refusal shows the password", () => {
    for (const url of [...remote, ...testDatabases]) {
      const message = refusalOf(url, "development");
      expect(message).not.toBe("");
      expect(message).not.toContain("s3cr3tpw");
    }
    for (const url of local) {
      expect(refusalOf(url, "production")).not.toContain("gym:gym");
    }
  });

  test("BR-REC-176 text that is not a database URL is refused", () => {
    expect(refusalOf("", "development")).not.toBe("");
    expect(refusalOf("not a url", "development")).not.toBe("");
  });
});

describe("BR-REC-176 the command line refuses before it touches any database", () => {
  /** Runs `bun scripts/seed-demo.ts` with the given DATABASE_URL; the output never has to be trusted. */
  async function runCli(databaseUrl: string) {
    const proc = Bun.spawn(
      ["bun", join(import.meta.dir, "../../scripts/seed-demo.ts")],
      {
        cwd: join(import.meta.dir, "../.."),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 60_000,
      },
    );
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { output: `${out}\n${err}`, code };
  }
  /** What a connection that was attempted and failed would print. */
  const CONNECTION_ATTEMPT =
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|CONNECT_TIMEOUT/i;

  test("BR-REC-176 run against a Supabase URL it exits with an error, prints no password and never connects", async () => {
    const { output, code } = await runCli(SUPABASE_URL);
    expect(code).not.toBe(0);
    expect(output).not.toContain("s3cr3tpw");
    expect(output).not.toMatch(/not implemented/i);
    expect(output).not.toMatch(CONNECTION_ATTEMPT);
  }, 90_000);

  test("BR-REC-176 run against a *_test database it exits with an error and never connects", async () => {
    // an unreachable local port: even a missing guard cannot write to a real database
    const { output, code } = await runCli(
      "postgres://gym:s3cr3tpw@localhost:1/gym_test",
    );
    expect(code).not.toBe(0);
    expect(output).not.toContain("s3cr3tpw");
    expect(output).not.toMatch(/not implemented/i);
    expect(output).not.toMatch(CONNECTION_ATTEMPT);
  }, 90_000);
});

// ─── the data set ───────────────────────────────────────────────────────────

/** One test per bucket of the Check column; the same rules are run again for the next day. */
const BUCKET_RULES: [title: string, holds: (b: Buckets) => void][] = [
  ["BR-REC-176 4 members are Expiring", (b) => expect(b.expiring).toBe(4)],
  [
    "BR-REC-176 3 members are Recently ended (ended in the last 30 days)",
    (b) => expect(b.recentlyEnded).toBe(3),
  ],
  [
    "BR-REC-176 1 member ended too long ago for the Recently ended list (more than 30 days)",
    (b) => expect(b.endedLongAgo).toBe(1),
  ],
  ["BR-REC-176 2 members are Archived", (b) => expect(b.archived).toBe(2)],
  [
    "BR-REC-176 there are Active members (not archived, not ending soon, not ended)",
    (b) => expect(b.active).toBeGreaterThanOrEqual(1),
  ],
  [
    "BR-REC-176 at least 5 members the Due list shows are overdue in Body composition",
    (b) => expect(b.overdue).toBeGreaterThanOrEqual(5),
  ],
  [
    "BR-REC-176 exactly 1 member is due today",
    (b) => expect(b.dueToday).toBe(1),
  ],
  [
    "BR-REC-176 at least 3 members are in the Due soon band",
    (b) => expect(b.dueSoon).toBeGreaterThanOrEqual(3),
  ],
  [
    "BR-REC-176 exactly 1 member the Due list shows has never been recorded",
    (b) => expect(b.neverRecorded).toBe(1),
  ],
  [
    "BR-REC-176 at least 1 assessment is partly recorded (some values of its type, not all)",
    (b) => expect(b.partlyRecorded).toBeGreaterThanOrEqual(1),
  ],
  [
    "BR-REC-176 2 members are flagged Assess soon (stored and still active)",
    (b) => {
      expect(b.flagRows).toBe(2);
      expect(b.flaggedActive).toBe(2);
    },
  ],
  [
    "BR-REC-176 2 members have a Remind me later (stored and still active)",
    (b) => {
      expect(b.snoozeRows).toBe(2);
      expect(b.snoozedActive).toBe(2);
    },
  ],
];

const BANDS = [
  "under20",
  "20to29",
  "30to39",
  "40to49",
  "50to59",
  "60plus",
] as const;

/** BR-REC-114: 10-year bands from 20 by age on the day. */
function bandOf(dateOfBirth: IsoDate, on: IsoDate): string {
  const age = ageOn(dateOfBirth, on);
  if (age < 20) return "under20";
  if (age >= 60) return "60plus";
  const from = Math.floor(age / 10) * 10;
  return `${from}to${from + 9}`;
}

/** Readings of one member in one assessment type, as dates, oldest first. */
function readingDates(d: DemoData, memberId: string, typeName: string) {
  return d.assessments
    .filter((a) => a.memberId === memberId && a.typeName === typeName)
    .map((a) => a.assessedOn)
    .sort();
}

/**
 * "Surya Pratap" as the Overdue tab of the Due list shows him on `today`: the plain Body composition
 * row (not Assess soon, not hidden by a reminder, member listed). Undefined when there is none.
 */
function suryaOverdueRow(d: DemoData, today: IsoDate) {
  const listed = listedIds(d, today);
  const overdueTab = dueListRows(
    dueStatuses(d, today).filter((s) => listed.has(s.memberId)),
    "overdue",
  );
  return overdueTab.find(
    (r) =>
      r.fullName === "Surya Pratap" &&
      r.typeName === BODY_COMPOSITION &&
      !r.flagged,
  );
}

/** The measurements whose leaderboards must show a tie; decimals or whole seconds, so a tie is never an accident. */
const TIE_MEASUREMENTS = ["Fran", "Deadlift", "CrossFit total"] as const;

type LeaderboardGroup = {
  sex: string;
  measurement: string;
  /** each non-archived member's latest value, best first by the measurement's direction (BR-REC-115, P6) */
  values: number[];
};

/** The leaderboard of BR-REC-115 per sex and measurement: latest value per non-archived member, best first. */
function leaderboardGroups(d: DemoData): LeaderboardGroup[] {
  const sexOf = new Map(d.members.map((m) => [m.id, m.sex]));
  const archived = new Set(
    d.members.filter((m) => m.archived).map((m) => m.id),
  );
  const groups: LeaderboardGroup[] = [];
  for (const measurement of TIE_MEASUREMENTS) {
    for (const sex of ["male", "female"]) {
      const latest = new Map<string, DemoMeasurement>();
      for (const x of d.measurements) {
        if (x.metricName.toLowerCase() !== measurement.toLowerCase()) continue;
        if (x.better === "none") continue; // no ranking without a direction
        if (archived.has(x.memberId) || sexOf.get(x.memberId) !== sex) continue;
        const known = latest.get(x.memberId);
        if (!known || x.measuredOn > known.measuredOn)
          latest.set(x.memberId, x);
      }
      const readings = [...latest.values()];
      const higherIsBetter = readings[0]?.better === "higher";
      groups.push({
        sex,
        measurement,
        values: readings
          .map((r) => r.value)
          .sort((a, b) => (higherIsBetter ? b - a : a - b)),
      });
    }
  }
  return groups;
}

/** True when two neighbours in the ranked list have the same value: "equal values share a rank (1, 2, 2, 4)". */
const hasSharedRank = (g: LeaderboardGroup): boolean =>
  g.values.some((v, i) => i > 0 && v === g.values[i - 1]);

describe("BR-REC-176 the demo data set seeded for 2026-10-04", () => {
  let d: DemoData;
  let statuses: DueStatus[];
  let listed: Set<string>;
  let buckets: Buckets;

  beforeAll(async () => {
    await prepareCatalog();
    await seedDemo({ today: TODAY });
    d = await readDemo();
    statuses = dueStatuses(d, TODAY);
    listed = listedIds(d, TODAY);
    buckets = bucketsOf(d, TODAY);
  }, SLOW);

  test("BR-REC-176 creates exactly 25 members and they have the fixed ids", () => {
    expect(d.members).toHaveLength(25);
    expect(d.members.map((m) => m.id).sort()).toEqual(
      [...DEMO_MEMBER_IDS].sort(),
    );
  });

  // Surya's example: "Run on 4 Oct -> Surya Pratap is overdue 34 days".
  test('BR-REC-176 "Surya Pratap" is overdue 34 days in Body composition on the seeded day, plainly (not Assess soon, not hidden)', () => {
    expect(d.members.some((m) => m.fullName === "Surya Pratap")).toBe(true);
    expect(suryaOverdueRow(d, TODAY)?.daysOverdue).toBe(34);
  });

  describe("membership states", () => {
    for (const [title, holds] of BUCKET_RULES.slice(0, 5)) {
      test(title, () => holds(buckets));
    }

    test("BR-REC-05 every member has at least one membership period", () => {
      const withPeriod = new Set(d.periods.map((p) => p.memberId));
      expect(d.members.filter((m) => !withPeriod.has(m.id))).toEqual([]);
    });

    test("BR-REC-51 every period ends the day before the same date a plan's months later", () => {
      const wrong = d.periods
        .filter((p) => p.endOn !== membershipEnd(p.plan as Plan, p.startOn))
        .map((p) => `${p.memberId} ${p.plan} ${p.startOn} ends ${p.endOn}`);
      expect(wrong).toEqual([]);
    });

    test("BR-REC-09 a member's periods do not overlap", () => {
      const problems: string[] = [];
      for (const m of d.members) {
        const own = d.periods
          .filter((p) => p.memberId === m.id)
          .sort((a, b) => (a.startOn < b.startOn ? -1 : 1));
        own.forEach((p, i) => {
          const prev = own[i - 1];
          if (prev && prev.endOn >= p.startOn) {
            problems.push(
              `${m.id} ${prev.startOn}..${prev.endOn} / ${p.startOn}`,
            );
          }
        });
      }
      expect(problems).toEqual([]);
    });

    test("BR-REC-50 a member's first period does not start before the join date", () => {
      const early = d.members.filter((m) => {
        const first = d.periods
          .filter((p) => p.memberId === m.id)
          .sort((a, b) => (a.startOn < b.startOn ? -1 : 1))[0];
        return first !== undefined && first.startOn < m.joinedOn;
      });
      expect(early.map((m) => m.id)).toEqual([]);
    });
  });

  describe("assessment states", () => {
    for (const [title, holds] of BUCKET_RULES.slice(5, 10)) {
      test(title, () => holds(buckets));
    }

    test("BR-REC-176 the Overdue and the Due soon tab of the Due list each have rows", () => {
      const shown = statuses.filter((s) => listed.has(s.memberId));
      expect(dueListRows(shown, "overdue").length).toBeGreaterThanOrEqual(1);
      expect(dueListRows(shown, "upcoming").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Assess soon and Remind me later", () => {
    for (const [title, holds] of BUCKET_RULES.slice(10)) {
      test(title, () => holds(buckets));
    }

    test("BR-REC-98 an Assess soon entry has no end date and was set on or before the seeded day", () => {
      const flags = d.overrides.filter((o) => o.kind === "flag");
      expect(flags.filter((o) => o.untilOn !== null)).toEqual([]);
      expect(flags.filter((o) => o.setOn > TODAY)).toEqual([]);
    });

    test("BR-REC-99 a Remind me later is still ahead on the seeded day and at most 90 days after it was set", () => {
      const snoozes = d.overrides.filter((o) => o.kind === "snooze");
      expect(snoozes.filter((o) => o.setOn > TODAY)).toEqual([]);
      for (const o of snoozes) {
        expect(o.untilOn).not.toBeNull();
        expect((o.untilOn ?? "") > TODAY).toBe(true);
        expect(daysBetween(o.setOn, o.untilOn ?? o.setOn)).toBeLessThanOrEqual(
          90,
        );
      }
    });

    test("BR-REC-176 the four entries are on members the Due list shows", () => {
      const hidden = d.overrides
        .filter((o) => !listed.has(o.memberId))
        .map((o) => `${o.kind} ${o.memberId}`);
      expect(hidden).toEqual([]);
    });
  });

  describe("people", () => {
    test("BR-REC-114 both sexes are in each of the six age bands (age on the seeded day)", () => {
      const have = new Set(
        d.members.map((m) => `${bandOf(m.dateOfBirth, TODAY)}:${m.sex}`),
      );
      const missing = BANDS.flatMap((band) =>
        (["male", "female"] as const)
          .filter((sex) => !have.has(`${band}:${sex}`))
          .map((sex) => `${band}:${sex}`),
      );
      expect(missing).toEqual([]);
    });

    test("BR-REC-48 nobody's date of birth or join date is in the future, and ages are 10 to 100", () => {
      const problems: string[] = [];
      for (const m of d.members) {
        const age = ageOn(m.dateOfBirth, TODAY);
        if (m.dateOfBirth > TODAY)
          problems.push(`${m.id} born ${m.dateOfBirth}`);
        if (m.joinedOn > TODAY) problems.push(`${m.id} joined ${m.joinedOn}`);
        if (age < 10 || age > 100) problems.push(`${m.id} age ${age}`);
      }
      expect(problems).toEqual([]);
    });

    test("BR-REC-45 names are 2 to 80 characters, trimmed, without double spaces", () => {
      const bad = d.members.filter(
        (m) =>
          m.fullName.length < 2 ||
          m.fullName.length > 80 ||
          m.fullName !== m.fullName.trim().replace(/\s+/g, " "),
      );
      expect(bad.map((m) => m.fullName)).toEqual([]);
    });

    test("BR-REC-46 phones have 10 to 15 digits and phone_digits is those digits without the +", () => {
      const bad = d.members.filter((m) => {
        const digits = m.phone.replace(/\D/g, "");
        return (
          digits.length < 10 || digits.length > 15 || m.phoneDigits !== digits
        );
      });
      expect(
        bad.map((m) => `${m.fullName} ${m.phone} / ${m.phoneDigits}`),
      ).toEqual([]);
    });

    test("BR-REC-45 an email, where there is one, looks like an email; notes are at most 1,000 characters", () => {
      const bad = d.members.filter(
        (m) =>
          (m.email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) ||
          (m.notes !== null && m.notes.length > 1000),
      );
      expect(bad.map((m) => m.id)).toEqual([]);
    });

    test("BR-REC-176 exactly two members share one phone (same last 10 digits, BR-REC-46) and no other phone is shared", () => {
      const groups = new Map<string, number>();
      for (const m of d.members) {
        const key = m.phoneDigits.slice(-10);
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      const shared = [...groups.values()].filter((n) => n > 1);
      expect(shared).toEqual([2]);
    });
  });

  describe("readings", () => {
    test("BR-REC-176 at least 2 members have 8 or more monthly Body composition readings", () => {
      const rich = d.members.filter(
        (m) => readingDates(d, m.id, BODY_COMPOSITION).length >= 8,
      );
      expect(rich.length).toBeGreaterThanOrEqual(2);
      for (const m of rich) {
        const dates = readingDates(d, m.id, BODY_COMPOSITION);
        const monthly = dates.slice(1).filter((on, i) => {
          const gap = daysBetween(dates[i] ?? on, on);
          return gap >= 25 && gap <= 35;
        }).length;
        // 8 readings in a row are at least 7 monthly steps
        expect(monthly).toBeGreaterThanOrEqual(7);
      }
    });

    test("BR-REC-176 at least 1 member has a single Body composition reading", () => {
      const single = d.members.filter(
        (m) => readingDates(d, m.id, BODY_COMPOSITION).length === 1,
      );
      expect(single.length).toBeGreaterThanOrEqual(1);
    });

    test("BR-REC-176 tied results: in at least 2 leaderboards (sex x Fran / Deadlift / CrossFit total) two neighbours share a rank (BR-REC-115)", () => {
      const groups = leaderboardGroups(d);
      const tied = groups.filter(hasSharedRank);
      expect(
        tied.length,
        `ranked values per group: ${JSON.stringify(groups.map((g) => [g.sex, g.measurement, g.values]))}`,
      ).toBeGreaterThanOrEqual(2);
    });

    test("BR-REC-176 at least 1 assessment has an estimated date (BR-REC-79)", () => {
      expect(
        d.assessments.filter((a) => a.isEstimated).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe("the rows are well formed", () => {
    test("BR-REC-78 every assessment has at least one value", () => {
      const withValues = new Set(d.measurements.map((x) => x.assessmentId));
      expect(
        d.assessments.filter((a) => !withValues.has(a.id)).map((a) => a.id),
      ).toEqual([]);
    });

    test("BR-REC-83 no assessment is dated after the seeded day", () => {
      expect(
        d.assessments.filter((a) => a.assessedOn > TODAY).map((a) => a.id),
      ).toEqual([]);
    });

    test("BR-REC-166 every value repeats its assessment's member and date", () => {
      const bad = d.measurements.filter(
        (x) =>
          x.memberId !== x.assessmentMemberId ||
          x.measuredOn !== x.assessmentDate,
      );
      expect(bad.map((x) => `${x.metricName} ${x.measuredOn}`)).toEqual([]);
    });

    test("BR-REC-10 every value belongs to a measurement of its assessment's type", () => {
      const bad = d.measurements.filter(
        (x) => x.metricTypeId !== x.assessmentTypeId,
      );
      expect(bad.map((x) => `${x.metricName} in ${x.typeName}`)).toEqual([]);
    });

    test("BR-REC-164 times are whole seconds; BR-REC-64 numbers are rounded to the measurement's decimals", () => {
      const bad = d.measurements.filter((x) => {
        const decimals = x.datatype === "duration" ? 0 : x.decimals;
        const scale = 10 ** decimals;
        return Math.abs(x.value * scale - Math.round(x.value * scale)) > 1e-6;
      });
      expect(
        bad.map((x) => `${x.metricName} ${x.measuredOn} = ${x.value}`),
      ).toEqual([]);
    });
  });
});

// ─── same day, same rows; another day, every date moves ─────────────────────

describe("BR-REC-176 the same day gives the same rows; a day later moves every date by a day", () => {
  let first: DemoData;
  let again: DemoData;
  let later: DemoData;

  beforeAll(async () => {
    await prepareCatalog();
    await seedDemo({ today: TODAY });
    first = await readDemo();
    await wipeDemo();
    await seedDemo({ today: TODAY });
    again = await readDemo();
    await wipeDemo();
    await seedDemo({ today: NEXT_DAY });
    later = await readDemo();
  }, SLOW);

  const sections = [
    "members",
    "periods",
    "assessments",
    "measurements",
    "overrides",
  ] as const;

  for (const section of sections) {
    test(`BR-REC-176 seeding the same day twice gives the same ${section}`, () => {
      expect(snapshotOf(again)[section]).toEqual(snapshotOf(first)[section]);
    });
  }

  test("BR-REC-176 member ids survive a re-seed: the second run has the same 25 ids", () => {
    expect(again.members.map((m) => m.id).sort()).toEqual(
      first.members.map((m) => m.id).sort(),
    );
    expect(again.members.map((m) => m.id).sort()).toEqual(
      [...DEMO_MEMBER_IDS].sort(),
    );
  });

  for (const section of sections) {
    test(`BR-REC-176 every date in ${section} is one day later when seeded one day later`, () => {
      // period end dates come from month maths on the start date: only the start moves by exactly a day
      expect(snapshotOf(later, 0, false)[section]).toEqual(
        snapshotOf(first, 1, false)[section],
      );
    });
  }

  // Spec example: run on 4 Oct -> 34 days; run on 5 Oct -> still 34 days (every date moves with today).
  test('BR-REC-176 "Surya Pratap" is still overdue 34 days when the set is seeded on 2026-10-05', () => {
    expect(first.members.some((m) => m.fullName === "Surya Pratap")).toBe(true);
    expect(suryaOverdueRow(first, TODAY)?.daysOverdue).toBe(34);
    expect(suryaOverdueRow(later, NEXT_DAY)?.daysOverdue).toBe(34);
  });

  test("BR-REC-176 the buckets of the Check column hold on the next day too", () => {
    const next = bucketsOf(later, NEXT_DAY);
    const failed = BUCKET_RULES.filter(([, holds]) => {
      try {
        holds(next);
        return false;
      } catch {
        return true;
      }
    }).map(([title]) => title);
    expect(failed).toEqual([]);
  });
});

// ─── the default day ────────────────────────────────────────────────────────

describe("BR-REC-176 without a day the script uses the gym's today from the settings (BR-REC-93)", () => {
  // UTC+14 and UTC-11 are 25 hours apart: their calendar days always differ, so a script that
  // ignores the setting (UTC, the server zone, a fixed zone) is wrong for at least one of them.
  for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    test(
      `BR-REC-176 zone ${zone}: the rows equal the rows of that zone's today given explicitly`,
      async () => {
        await prepareCatalog();
        await db.execute(sql`update gym_settings set timezone = ${zone}`);

        let sameDay: IsoDate | undefined;
        let byDefault: ReturnType<typeof snapshotOf> | undefined;
        for (let attempt = 0; attempt < 3 && sameDay === undefined; attempt++) {
          await wipeDemo();
          const before = gymToday(new Date(), zone);
          await seedDemo();
          const after = gymToday(new Date(), zone);
          if (before === after) {
            sameDay = before;
            byDefault = snapshotOf(await readDemo());
          }
        }
        expect(sameDay).toBeDefined();

        await wipeDemo();
        await seedDemo({ today: sameDay as IsoDate });
        expect(byDefault).toEqual(snapshotOf(await readDemo()));
      },
      SLOW,
    );
  }
});

// ─── the refusals that need a database ──────────────────────────────────────

describe("BR-REC-176 a database that already holds members is refused", () => {
  test(
    'BR-REC-176 run twice with the same day, the second run is refused ("run db:reset first") and changes nothing',
    async () => {
      await prepareCatalog();
      await seedDemo({ today: TODAY });
      const before = snapshotOf(await readDemo());

      const error = await failureOf(() => seedDemo({ today: TODAY }));
      expect(error).toBeInstanceOf(Error);
      expect(messageOf(error)).toMatch(/db:reset/i);

      expect(await countOf("members")).toBe(25);
      expect(snapshotOf(await readDemo())).toEqual(before);
    },
    SLOW,
  );

  test(
    "BR-REC-176 a database with a member that is not a demo member is refused and nothing is added",
    async () => {
      await prepareCatalog();
      const [made] = await rows(sql`
      insert into members (full_name, phone, phone_digits, date_of_birth, sex, joined_on)
      values ('TEST_demo_Existing', '9876500001', '9876500001', '1990-01-01', 'male', '2026-01-01')
      returning id::text as id`);
      const existingId = String(made?.id);
      try {
        const error = await failureOf(() => seedDemo({ today: TODAY }));
        expect(error).toBeInstanceOf(Error);
        expect(messageOf(error)).toMatch(/db:reset/i);

        expect(await countOf("members")).toBe(1);
        expect(await countOf("membership_periods")).toBe(0);
        expect(await countOf("assessments")).toBe(0);
        expect(await countOf("measurements")).toBe(0);
        expect(await countOf("due_overrides")).toBe(0);
      } finally {
        await db.execute(
          sql`delete from members where id = ${existingId}::uuid`,
        );
      }
    },
    SLOW,
  );
});

describe("BR-REC-176 it creates no login", () => {
  test(
    "BR-REC-176 the account and sign-in tables have the same rows before and after",
    async () => {
      await prepareCatalog();
      const before = [
        await countOf("app_account"),
        await countOf("auth_sessions"),
      ];

      await seedDemo({ today: TODAY });

      expect([
        await countOf("app_account"),
        await countOf("auth_sessions"),
      ]).toEqual(before);
    },
    SLOW,
  );
});
