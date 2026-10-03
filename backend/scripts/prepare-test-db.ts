/**
 * `bun run db:test:prepare` — create the test database if missing, then push the
 * current schema into it (DATABASE_URL_TEST only; refuses unless the name ends in
 * `_test`). Safe to re-run: drizzle-kit push diffs the schema.
 */
import postgres from "postgres";

import { resolveTestDatabaseUrl } from "../src/lib/test-db-url";

const url = resolveTestDatabaseUrl();
const target = new URL(url);
const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));

// Create the database via the server's maintenance DB when it does not exist yet.
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), {
  prepare: false,
  max: 1,
  onnotice: () => {},
});
try {
  const exists =
    await admin`select 1 from pg_database where datname = ${dbName}`;
  if (exists.length === 0) {
    // Identifier cannot be a bind parameter; dbName is validated to end in _test above.
    await admin.unsafe(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
    console.log(`Created database ${dbName}`);
  }
} finally {
  await admin.end({ timeout: 5 });
}

const push = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
  env: { ...process.env, DATABASE_URL: url },
  stdout: "inherit",
  stderr: "inherit",
});
if (push.exitCode !== 0) {
  console.error("drizzle-kit push failed against DATABASE_URL_TEST");
  process.exit(push.exitCode ?? 1);
}

console.log(`Test database ready: ${target.hostname}:${target.port}/${dbName}`);
