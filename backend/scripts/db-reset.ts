/**
 * `bun run db:reset [--allow-remote]`
 *
 * Wipes the `public` and `drizzle` schemas of the database in DATABASE_URL and
 * pushes the current Drizzle schema. (No seed data yet; add steps below as modules need them.)
 *
 * Guard: refuses NODE_ENV=production and non-local hosts. A remote host needs
 * `--allow-remote` AND DB_RESET_CONFIRM=<database name>. A local host that is not the
 * usual dev/test one (database `gym` or `*_test`, port 5432/5433) needs DB_RESET_CONFIRM too,
 * because "localhost" can be an SSH tunnel to a real database.
 * Exit codes: 0 done, 1 a step failed, 2 refused by the guard.
 * Never prints the DB password.
 */
import postgres from "postgres";

const EXIT = { ok: 0, step: 1, guard: 2 } as const;
const BACKEND_DIR = new URL("..", import.meta.url).pathname;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const allowRemote = process.argv.slice(2).includes("--allow-remote");

function refuse(msg: string): never {
  console.error(msg);
  process.exit(EXIT.guard);
}

// The target comes ONLY from the DATABASE_URL handed to this process, never DATABASE_URL_TEST.
const rawUrl = process.env.DATABASE_URL ?? "";
let target: URL;
try {
  target = new URL(rawUrl);
  if (!/^postgres(ql)?:$/.test(target.protocol) || !target.hostname) {
    throw new Error("not a postgres url");
  }
} catch {
  refuse("Refused: DATABASE_URL is missing or not a valid postgres URL.");
}

const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
const port = target.port || "5432";
const targetLabel = `${target.hostname}:${port}/${dbName}`;
const secrets = [decodeURIComponent(target.password), target.password].filter(
  (s) => s.length >= 4,
);

const scrub = (text: string): string =>
  secrets.reduce((out, s) => out.split(s).join("***"), text);

console.log(`db:reset target: ${targetLabel} (password ***)`);

if (process.env.NODE_ENV === "production") {
  refuse("Refused: NODE_ENV=production. db:reset never runs there.");
}

if (!LOCAL_HOSTS.has(target.hostname.toLowerCase())) {
  if (!allowRemote) {
    refuse(
      `Refused: ${target.hostname} is not a local host. Pass --allow-remote and set DB_RESET_CONFIRM=${dbName} to override.`,
    );
  }
  if (process.env.DB_RESET_CONFIRM !== dbName) {
    refuse(
      "Refused: DB_RESET_CONFIRM must equal the database name when using --allow-remote.",
    );
  }
} else {
  const usualTarget =
    (dbName === "gym" || dbName.endsWith("_test")) &&
    (port === "5432" || port === "5433");
  if (!usualTarget && process.env.DB_RESET_CONFIRM !== dbName) {
    refuse(
      `Refused: ${targetLabel} is not the usual local dev/test database (name gym or *_test, port 5432/5433). Set DB_RESET_CONFIRM=${dbName} to override.`,
    );
  }
  if (usualTarget && process.env.DB_RESET_CONFIRM && !allowRemote) {
    refuse("Refused: DB_RESET_CONFIRM is set without --allow-remote.");
  }
}

type Step = { name: string; run: () => Promise<void> };

const steps: Step[] = [
  {
    name: "drop schema",
    run: async () => {
      const sql = postgres(rawUrl, {
        max: 1,
        onnotice: () => {},
        connect_timeout: 10,
      });
      try {
        // Schemas only, never the database.
        await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
        await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
        await sql.unsafe("CREATE SCHEMA public");
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
  },
  {
    name: "push schema",
    run: async () => {
      const proc = Bun.spawn(["bunx", "drizzle-kit", "push", "--force"], {
        cwd: BACKEND_DIR,
        env: process.env as Record<string, string>,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      if ((await proc.exited) !== 0) {
        console.error(scrub(`${out}\n${err}`).trim());
        throw new Error("drizzle-kit push failed");
      }
    },
  },
];

for (const step of steps) {
  console.log(`[${step.name}]`);
  try {
    await step.run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`db:reset failed at step '${step.name}': ${scrub(msg)}`);
    process.exit(EXIT.step);
  }
}

console.log(`\ndb:reset done: ${targetLabel}`);
process.exit(EXIT.ok);
