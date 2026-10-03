import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { inArray, sql } from "drizzle-orm";
import { seed } from "../../scripts/seed";
import {
  assertLocalDatabase,
  type PerfSeedSummary,
  seedPerf,
} from "../../scripts/seed-perf";
import { db } from "../../src/db/client";
import {
  assessments,
  dueOverrides,
  measurements,
  members,
  membershipPeriods,
} from "../../src/db/schemas";
import { ageOn } from "../../src/lib/domain/dates";
import { membershipEnd } from "../../src/lib/domain/membership";
import type { Plan } from "../../src/lib/enums";
import { resetCatalog, resetSingletons } from "../helpers/seed-data";

// BR-REC-170: `seed:perf` refuses any non-local database and creates 1,000
// members (half male, ages 18-65, joined over 3 years, 10% archived) with
// continuous memberships, monthly body composition and two-monthly fitness
// tests with realistic noise.

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> =>
  Array.from(await db.execute(q)) as Row[];

const SUPABASE_URL =
  "postgresql://postgres.abcdefgh:s3cr3tpw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

describe("BR-REC-170 the guard: only a local database", () => {
  const local = [
    "postgres://gym:gym@localhost:5433/gym_test",
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

  for (const url of local) {
    test(`BR-REC-170 a local database is allowed: ${new URL(url).host}`, () => {
      expect(() => assertLocalDatabase(url)).not.toThrow();
    });
  }

  /** The refusal message; "" when nothing was thrown. An unbuilt stub is not a refusal. */
  function refusalOf(url: string): string {
    try {
      assertLocalDatabase(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not implemented/i.test(message)) {
        throw new Error("assertLocalDatabase is not built yet");
      }
      return message;
    }
    return "";
  }

  for (const url of remote) {
    test(`BR-REC-170 a non-local database is refused: ${new URL(url).host}`, () => {
      expect(refusalOf(url)).not.toBe("");
    });
  }

  test("BR-REC-170 the refusal never shows the password", () => {
    for (const url of remote) {
      const message = refusalOf(url);
      expect(message).not.toBe("");
      expect(message).not.toContain("s3cr3tpw");
    }
  });

  test("BR-REC-170 text that is not a database URL is refused", () => {
    expect(refusalOf("")).not.toBe("");
    expect(refusalOf("not a url")).not.toBe("");
  });

  test("BR-REC-170 run against a Supabase URL the script exits with an error and prints no password", async () => {
    const proc = Bun.spawn(
      ["bun", join(import.meta.dir, "../../scripts/seed-perf.ts")],
      {
        cwd: join(import.meta.dir, "../.."),
        env: { ...process.env, DATABASE_URL: SUPABASE_URL },
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
    const output = `${out}\n${err}`;
    expect(code).not.toBe(0);
    expect(output).not.toContain("s3cr3tpw");
    // refused by the guard, not by an unbuilt stub
    expect(output).not.toMatch(/not implemented/i);
  }, 90_000);
});

// ─── the data set ───────────────────────────────────────────────────────────

const TODAY = "2026-10-03";
let before = new Set<string>();
let beforeCaptured = false;
let seeded: Promise<PerfSeedSummary> | undefined;

/** Seeds the catalog and the 1,000-member data set once; every test reads the same data. */
function perfData(): Promise<PerfSeedSummary> {
  seeded ??= (async () => {
    await resetCatalog();
    await resetSingletons();
    await seed();
    const existing = await rows(sql`select id from members`);
    before = new Set(existing.map((r) => String(r.id)));
    beforeCaptured = true;
    return seedPerf({ today: TODAY, randomSeed: 170 });
  })();
  return seeded;
}

async function removeNewMembers() {
  const all = await rows(sql`select id from members`);
  const ids = all.map((r) => String(r.id)).filter((id) => !before.has(id));
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await db.delete(dueOverrides).where(inArray(dueOverrides.memberId, chunk));
    await db.delete(measurements).where(inArray(measurements.memberId, chunk));
    await db.delete(assessments).where(inArray(assessments.memberId, chunk));
    await db
      .delete(membershipPeriods)
      .where(inArray(membershipPeriods.memberId, chunk));
    await db.delete(members).where(inArray(members.id, chunk));
  }
}

afterAll(async () => {
  if (seeded) {
    await seeded.catch(() => undefined);
    // only when we know which members were there before: never delete blind
    if (beforeCaptured) await removeNewMembers();
  }
  await resetCatalog();
  await resetSingletons();
}, 300_000);

/** SQL: `column` is not the id of a member that was there before the run (so only the generated ones). */
const notBefore = (column: string) =>
  before.size === 0
    ? sql`true`
    : sql`${sql.raw(column)} not in (${sql.join(
        [...before].map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`;
describe("BR-REC-170 seed:perf creates the 1,000-member data set", () => {
  test("BR-REC-170 creates 1,000 members and reports the row counts", async () => {
    const summary = await perfData();
    const [count] = await rows(
      sql`select count(*)::int as n from members where ${notBefore("id")}`,
    );
    expect(count?.n).toBe(1000);
    expect(summary.members).toBe(1000);
  }, 600_000);

  test("BR-REC-170 half are male, half female", async () => {
    await perfData();
    const found = await rows(
      sql`select sex, count(*)::int as n from members where ${notBefore("id")} group by sex`,
    );
    const bySex = Object.fromEntries(found.map((r) => [String(r.sex), r.n]));
    expect(bySex).toEqual({ male: 500, female: 500 });
  }, 600_000);

  test("BR-REC-170 10% are archived", async () => {
    const summary = await perfData();
    const [row] = await rows(
      sql`select count(*)::int as n from members where ${notBefore("id")} and archived_at is not null`,
    );
    expect(row?.n).toBe(100);
    expect(summary.archivedMembers).toBe(100);
  }, 600_000);

  test("BR-REC-170 ages are 18 to 65", async () => {
    await perfData();
    const found = await rows(
      sql`select date_of_birth::text as dob from members where ${notBefore("id")}`,
    );
    const ages = found.map((r) => ageOn(String(r.dob), TODAY));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...ages)).toBeLessThanOrEqual(65);
  }, 600_000);

  test("BR-REC-170 members joined over the last 3 years, not in the future", async () => {
    await perfData();
    const [row] = await rows(
      sql`select min(joined_on)::text as first, max(joined_on)::text as last from members where ${notBefore("id")}`,
    );
    const first = String(row?.first);
    const last = String(row?.last);
    expect(first >= "2023-10-03").toBe(true);
    expect(last <= TODAY).toBe(true);
    const spanDays =
      (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
      86_400_000;
    expect(spanDays).toBeGreaterThanOrEqual(900);
  }, 600_000);

  test("BR-REC-170 every member has continuous memberships: no overlap, no gap, end dates as BR-REC-51", async () => {
    await perfData();
    const periods = await rows(sql`
      select p.member_id, p.plan, p.start_on::text as start_on, p.end_on::text as end_on
      from membership_periods p where ${notBefore("p.member_id")}
      order by p.member_id, p.start_on`);
    const perMember = new Map<string, Row[]>();
    for (const p of periods) {
      const list = perMember.get(String(p.member_id)) ?? [];
      list.push(p);
      perMember.set(String(p.member_id), list);
    }
    expect(perMember.size).toBe(1000);

    const problems: string[] = [];
    for (const [memberId, list] of perMember) {
      for (const [i, p] of list.entries()) {
        const expectedEnd = membershipEnd(p.plan as Plan, String(p.start_on));
        if (expectedEnd !== p.end_on)
          problems.push(`${memberId} end ${p.end_on} != ${expectedEnd}`);
        const prev = list[i - 1];
        if (prev) {
          const next = new Date(`${String(prev.end_on)}T00:00:00Z`);
          next.setUTCDate(next.getUTCDate() + 1);
          if (next.toISOString().slice(0, 10) !== p.start_on) {
            problems.push(`${memberId} gap or overlap after ${prev.end_on}`);
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  }, 600_000);

  test("BR-REC-170 body composition is about monthly, fitness tests about every two months", async () => {
    await perfData();
    const found = await rows(sql`
      select t.name as type, avg(a.gap)::float as avg_gap, count(*)::int as n from (
        select type_id, assessed_on - lag(assessed_on) over (partition by member_id, type_id order by assessed_on) as gap
        from assessments where ${notBefore("member_id")}
      ) a join assessment_types t on t.id = a.type_id
      where a.gap is not null group by t.name`);
    const gap = Object.fromEntries(
      found.map((r) => [String(r.type), Number(r.avg_gap)]),
    );
    expect(gap["Body composition"]).toBeGreaterThanOrEqual(27);
    expect(gap["Body composition"]).toBeLessThanOrEqual(33);
    expect(gap["Fitness test"]).toBeGreaterThanOrEqual(55);
    expect(gap["Fitness test"]).toBeLessThanOrEqual(66);
  }, 600_000);

  test("BR-REC-170 members who joined more than 70 days ago have both kinds of assessment", async () => {
    await perfData();
    const found = await rows(sql`
      select count(*)::int as n from members m
      where ${notBefore("m.id")} and m.joined_on <= (${TODAY}::date - 70)
        and (select count(distinct a.type_id) from assessments a where a.member_id = m.id) < 2`);
    expect(found[0]?.n).toBe(0);
  }, 600_000);

  test("BR-REC-170 no assessment is in the future or before the member joined", async () => {
    await perfData();
    const found = await rows(sql`
      select count(*)::int as n from assessments a join members m on m.id = a.member_id
      where ${notBefore("a.member_id")} and (a.assessed_on > ${TODAY}::date or a.assessed_on < m.joined_on)`);
    expect(found[0]?.n).toBe(0);
  }, 600_000);

  test("BR-REC-170 values carry noise (not constant) and stay realistic (inside the check ranges)", async () => {
    await perfData();
    const spread = await rows(sql`
      select count(*)::int as members,
             count(*) filter (where distinct_values > 1)::int as varied
      from (
        select x.member_id, count(distinct x.value) as distinct_values
        from measurements x join metrics m on m.id = x.metric_id
        where ${notBefore("x.member_id")} and m.name = 'Weight'
        group by x.member_id having count(*) >= 6
      ) s`);
    const members = Number(spread[0]?.members);
    expect(members).toBeGreaterThan(100);
    expect(Number(spread[0]?.varied) / members).toBeGreaterThanOrEqual(0.9);

    const range = await rows(sql`
      select count(*)::int as total,
             count(*) filter (
               where (m.plausible_min is null or x.value >= m.plausible_min)
                 and (m.plausible_max is null or x.value <= m.plausible_max))::int as inside
      from measurements x join metrics m on m.id = x.metric_id where ${notBefore("x.member_id")}`);
    expect(Number(range[0]?.total)).toBeGreaterThan(0);
    expect(
      Number(range[0]?.inside) / Number(range[0]?.total),
    ).toBeGreaterThanOrEqual(0.95);
  }, 600_000);

  test("BR-REC-170 times are whole seconds (BR-REC-164)", async () => {
    await perfData();
    const found = await rows(sql`
      select count(*)::int as n from measurements x join metrics m on m.id = x.metric_id
      where ${notBefore("x.member_id")} and m.datatype = 'duration' and x.value <> round(x.value)`);
    expect(found[0]?.n).toBe(0);
  }, 600_000);

  test("BR-REC-170 each value repeats its assessment's member and date (BR-REC-166)", async () => {
    await perfData();
    const found = await rows(sql`
      select count(*)::int as n from measurements x join assessments a on a.id = x.assessment_id
      where ${notBefore("x.member_id")} and (x.member_id <> a.member_id or x.measured_on <> a.assessed_on)`);
    expect(found[0]?.n).toBe(0);
  }, 600_000);

  test("BR-REC-170 the printed row counts equal what is in the database", async () => {
    const summary = await perfData();
    const [p] = await rows(
      sql`select count(*)::int as n from membership_periods p where ${notBefore("p.member_id")}`,
    );
    const [a] = await rows(
      sql`select count(*)::int as n from assessments where ${notBefore("member_id")}`,
    );
    const [x] = await rows(
      sql`select count(*)::int as n from measurements where ${notBefore("member_id")}`,
    );
    expect(summary.periods).toBe(p?.n as number);
    expect(summary.assessments).toBe(a?.n as number);
    expect(summary.measurements).toBe(x?.n as number);
  }, 600_000);
});
