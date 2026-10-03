/**
 * `bun run seed` — settings, the one login-lock row and the assessment catalog.
 * Safe to run on any database, any number of times: it only fills what is
 * missing and never overwrites a coach's later edits (BR-REC-68).
 *
 * STUB (Stream 0 / S1): signature and docs only. S3 builds the body.
 */

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

/**
 * Seeds `gym_settings` (defaults), `login_attempts` (id 1) and, only on an
 * empty catalog, Body composition + Fitness test with the metrics of
 * setup.md "Seed detail" (BR-REC-10, 13, 65, 68). Uses the database in
 * `DATABASE_URL`. Not implemented yet.
 */
export async function seed(): Promise<SeedSummary> {
  throw new Error("not implemented");
}

if (import.meta.main) {
  try {
    console.log(await seed());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
