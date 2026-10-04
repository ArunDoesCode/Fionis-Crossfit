/**
 * `bun run seed:demo` — the curated demo data set (BR-REC-176): 25 named members whose every date is
 * today (the gym day) plus a fixed offset, so the same day gives the same rows and every screen has
 * something to show (Active / Expiring / Recently ended / Archived members, overdue / due today /
 * due soon / never recorded / partly recorded assessments, "Assess soon" and "Remind me later",
 * long and short histories, ties, estimated dates, a shared phone).
 *
 * Run `bun run db:reset` first: it refuses a database that already has members. It refuses a
 * non-local database, a `*_test` database and NODE_ENV=production, and it creates no login
 * (`bun run bootstrap-admin` does). The rows are built by `seed-demo-data.ts` (pure).
 */
import { count, sql } from "drizzle-orm";

import { type Db, db, disconnectDb, type Tx } from "../src/db/client";
import {
  assessments,
  assessmentTypes,
  dueOverrides,
  gymSettings,
  measurements,
  members,
  membershipPeriods,
  metrics,
} from "../src/db/schemas";
import { gymToday, type IsoDate, isIsoDate } from "../src/lib/domain/dates";
import type { BetterDirection, IntervalUnit } from "../src/lib/enums";
import { seed } from "./seed";
import {
  BODY_COMPOSITION,
  buildDemoRows,
  DEMO_MEMBER_IDS,
  type DemoBuckets,
  type DemoMetric,
  type DemoType,
  demoBuckets,
  demoProblems,
  FITNESS_TEST,
} from "./seed-demo-data";
import { assertLocalDatabase } from "./seed-perf";

export { DEMO_MEMBER_IDS };

type Executor = Db | Tx;

/** Rows per INSERT: keeps every statement under the driver's 65,534-parameter limit. */
const ROWS_PER_INSERT = 5000;

const RESET_HINT = "Run `bun run db:reset` first, then `bun run seed:demo`.";

// ─── the guard ──────────────────────────────────────────────────────────────

/** Name of the database in the URL (the URL is already known to be valid). */
function databaseName(databaseUrl: string): string {
  const raw = new URL(databaseUrl).pathname.replace(/^\//, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Throws unless `databaseUrl` is a local database (`localhost`, `127.0.0.1`, `::1`) whose name does not
 * end in `_test`, and `nodeEnv` (default: NODE_ENV) is not `production`. A URL that is not a postgres
 * URL is refused too. Messages never contain the password.
 */
export function assertDemoSeedAllowed(
  databaseUrl: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (nodeEnv === "production") {
    throw new Error("seed:demo refused: NODE_ENV is production.");
  }
  try {
    assertLocalDatabase(databaseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace("seed:perf", "seed:demo"));
  }
  const name = databaseName(databaseUrl);
  if (name.toLowerCase().endsWith("_test")) {
    throw new Error(
      `seed:demo refused: ${name} is a test database (its name ends in _test); the tests build their own data.`,
    );
  }
}

// ─── the catalog and the database ───────────────────────────────────────────

type GymSettings = {
  timezone: string;
  upcomingLeadDays: number;
  expiryLeadDays: number;
};

async function loadCatalog(): Promise<{
  types: DemoType[];
  settings: GymSettings | null;
}> {
  const [typeRows, metricRows, settingsRows] = await Promise.all([
    db
      .select({
        id: assessmentTypes.id,
        name: assessmentTypes.name,
        isActive: assessmentTypes.isActive,
        sortOrder: assessmentTypes.sortOrder,
        intervalCount: assessmentTypes.intervalCount,
        intervalUnit: assessmentTypes.intervalUnit,
      })
      .from(assessmentTypes),
    db
      .select({
        id: metrics.id,
        typeId: metrics.typeId,
        name: metrics.name,
        datatype: metrics.datatype,
        decimals: metrics.decimals,
        better: metrics.better,
        plausibleMin: metrics.plausibleMin,
        plausibleMax: metrics.plausibleMax,
        isActive: metrics.isActive,
        sortOrder: metrics.sortOrder,
        intervalCount: metrics.intervalCount,
        intervalUnit: metrics.intervalUnit,
      })
      .from(metrics),
    db
      .select({
        timezone: gymSettings.timezone,
        upcomingLeadDays: gymSettings.upcomingLeadDays,
        expiryLeadDays: gymSettings.expiryLeadDays,
      })
      .from(gymSettings)
      .limit(1),
  ]);
  const types = typeRows.map((type) => ({
    ...type,
    intervalUnit: type.intervalUnit as IntervalUnit,
    metrics: metricRows
      .filter((metric) => metric.typeId === type.id)
      .map(
        (metric): DemoMetric => ({
          ...metric,
          better: metric.better as BetterDirection,
          intervalUnit: metric.intervalUnit as IntervalUnit | null,
        }),
      ),
  }));
  return { types, settings: settingsRows[0] ?? null };
}

const hasDefaultCatalog = (
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
): boolean =>
  catalog.settings !== null &&
  [BODY_COMPOSITION, FITNESS_TEST].every((name) =>
    catalog.types.some((type) => type.name === name),
  );

async function assertNoMembers(executor: Executor): Promise<void> {
  const [row] = await executor.select({ n: count() }).from(members);
  if ((row?.n ?? 0) > 0) {
    throw new Error(
      `seed:demo refused: the database already has members. ${RESET_HINT}`,
    );
  }
}

async function insertInChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    await insert(rows.slice(i, i + ROWS_PER_INSERT));
  }
}

// ─── the run ────────────────────────────────────────────────────────────────

export type DemoSummary = {
  today: IsoDate;
  members: number;
  periods: number;
  assessments: number;
  measurements: number;
  overrides: number;
  buckets: DemoBuckets;
};

/**
 * `seedDemo` that also says what it wrote. Everything is checked before the first write (the buckets
 * of BR-REC-176 are counted on the rows with the app's own rules); a failure leaves nothing behind.
 */
export async function seedDemoWithSummary(
  options: { today?: IsoDate } = {},
): Promise<DemoSummary> {
  if (options.today !== undefined && !isIsoDate(options.today)) {
    throw new Error("seed:demo: today must be a day like 2026-10-04.");
  }
  // a refused run changes nothing, not even the catalog
  await assertNoMembers(db);

  let catalog = await loadCatalog();
  if (!hasDefaultCatalog(catalog)) {
    await seed(); // fills only what is missing: settings and an empty catalog
    catalog = await loadCatalog();
  }
  const { types, settings } = catalog;
  if (settings === null || !hasDefaultCatalog(catalog)) {
    throw new Error(
      `seed:demo needs the settings and the default "${BODY_COMPOSITION}" and "${FITNESS_TEST}" assessments. ${RESET_HINT}`,
    );
  }

  const today = options.today ?? gymToday(new Date(), settings.timezone);
  const rows = buildDemoRows(today, types);
  const buckets = demoBuckets(rows, types, today, settings);
  const problems = demoProblems(buckets);
  if (problems.length > 0) {
    throw new Error(
      `seed:demo: the data for ${today} does not give: ${problems.join("; ")}. Nothing was written. Are the settings (lead days) and the repeat intervals the defaults?`,
    );
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('seed'))`);
    await assertNoMembers(tx); // another run may have finished while this one was preparing
    await tx.insert(members).values(rows.members);
    await tx.insert(membershipPeriods).values(rows.periods);
    await tx.insert(assessments).values(rows.assessments);
    await insertInChunks(rows.measurements, (chunk) =>
      tx.insert(measurements).values(chunk),
    );
  });
  // A second transaction on purpose: an override ends when an assessment was saved after it
  // (`updated_at >= created_at`, BR-REC-98); in one transaction both would carry the same `now()`.
  if (rows.overrides.length > 0) {
    await db.transaction(async (tx) => {
      await tx.insert(dueOverrides).values(rows.overrides);
    });
  }
  const ended = Array.from(
    await db.execute(sql`
      select count(*)::int as n from due_overrides o
      where exists (select 1 from assessments a
        where a.member_id = o.member_id and a.type_id = o.type_id
          and a.updated_at >= o.created_at and a.assessed_on >= o.set_on)`),
  )[0];
  if (Number(ended?.n) > 0) {
    throw new Error(
      `seed:demo: ${String(ended?.n)} Assess soon / Remind me later entries ended at once (database clock). ${RESET_HINT}`,
    );
  }

  return {
    today,
    members: rows.members.length,
    periods: rows.periods.length,
    assessments: rows.assessments.length,
    measurements: rows.measurements.length,
    overrides: rows.overrides.length,
    buckets,
  };
}

/**
 * Adds the 25 demo members to the empty database in `DATABASE_URL` for the gym day `today`
 * (default: today in the time zone of the settings). Throws an Error mentioning `db:reset` when
 * `members` already holds a row. No host guard here: the command line has it (`assertDemoSeedAllowed`).
 */
export async function seedDemo(
  options: { today?: IsoDate } = {},
): Promise<void> {
  await seedDemoWithSummary(options);
}

function describe(summary: DemoSummary): string {
  const b = summary.buckets;
  return [
    `seed:demo done for ${summary.today} (gym day). Rows added:`,
    `  members ${summary.members} · membership periods ${summary.periods} · assessments ${summary.assessments} · values ${summary.measurements} · Assess soon / Remind me later ${summary.overrides}`,
    `Membership: Active ${b.active} · Expiring ${b.expiring} · Recently ended ${b.recentlyEnded} · ended earlier ${b.endedLongAgo} · Archived ${b.archived}`,
    `Due list: overdue in Body composition ${b.overdue} · due today ${b.dueToday} · due soon ${b.dueSoon} · never recorded ${b.neverRecorded} · partly recorded assessments ${b.partlyRecorded} · Assess soon ${b.flagged} · Remind me later ${b.snoozed}`,
    `"Surya Pratap" is overdue ${b.suryaOverdueDays ?? "?"} days in Body composition. No login was created: run \`bun run bootstrap-admin\`.`,
  ].join("\n");
}

async function main(): Promise<void> {
  // before any connection is opened
  assertDemoSeedAllowed(process.env.DATABASE_URL ?? "");
  console.log(describe(await seedDemoWithSummary()));
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}
