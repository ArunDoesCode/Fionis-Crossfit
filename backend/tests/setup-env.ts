import { afterAll } from "bun:test";

import { resolveTestDatabaseUrl } from "../src/lib/test-db-url";

// Runs before any test file (bunfig.toml preload) and before `src/lib/env.ts`
// is imported: tests must only ever see the *_test database.
// Throws (aborting the run) if DATABASE_URL_TEST is missing, equals
// DATABASE_URL, or its database name does not end in `_test`.
const testUrl = resolveTestDatabaseUrl();
process.env.DATABASE_URL = testUrl;
// env.ts requires DATABASE_URL_TEST !== DATABASE_URL; the swap makes them equal
// and the name was already verified above, so drop the now-redundant variable.
delete process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = "test";

// One shared DB client for the whole run, closed once here.
afterAll(async () => {
  const { disconnectDb } = await import("../src/db/client");
  await disconnectDb();
});
