/**
 * `bun run seed:perf` — the 1,000-member performance data set (BR-REC-170):
 * half male, ages 18-65, joined over 3 years, 10% archived, continuous
 * memberships, monthly body composition and two-monthly fitness tests with
 * realistic noise. Refuses any non-local database.
 *
 * STUB (Stream 0 / S1): signatures and docs only. S3 builds the bodies.
 */
import type { IsoDate } from "../src/lib/domain/dates";

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

/**
 * Throws unless `databaseUrl` points at a local database: host `localhost`,
 * `127.0.0.1` or `::1`, and `NODE_ENV` is not `production`. The message never
 * contains the password. Pure apart from reading `NODE_ENV`. Not implemented yet.
 */
export function assertLocalDatabase(_databaseUrl: string): void {
  throw new Error("not implemented");
}

/**
 * Calls `assertLocalDatabase(DATABASE_URL)` first, then adds the data set to
 * the database in `DATABASE_URL` (run `seed` before it: it needs the catalog).
 * Not implemented yet.
 */
export async function seedPerf(
  _options: PerfSeedOptions = {},
): Promise<PerfSeedSummary> {
  throw new Error("not implemented");
}

if (import.meta.main) {
  try {
    console.log(await seedPerf());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
