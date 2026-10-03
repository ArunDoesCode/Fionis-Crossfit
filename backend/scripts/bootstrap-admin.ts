/**
 * `bun run bootstrap-admin` — the developer's command for the one shared login (BR-REC-25, 26, 171).
 * Uses the database in this process's `DATABASE_URL`. Never prints a password.
 *
 *   bootstrap-admin [--username <u>] [--password <p>]   create the one login (asks for what is missing)
 *   bootstrap-admin --reset [--password <p>]            new password, signs out every device
 *   bootstrap-admin --unlock                            end a sign-in lock now
 *
 * Exit codes: 0 done · 1 refused (a login already exists / no login yet) · 2 bad input (modes mixed,
 * unknown flag, value outside 1-64 / 8-128 characters, value missing and no terminal to ask) ·
 * 3 unexpected failure (database unreachable, ...).
 *
 * This script is the "controller" of the three commands: it parses and validates, then calls
 * `authService`, which does the work in one transaction with its change-log row.
 */
import { parseArgs } from "node:util";

import type { ZodType, z } from "zod";

import { disconnectDb } from "../src/db/client";
import { AppError } from "../src/lib/errors";
import { authService } from "../src/service/authService";
import {
  newPasswordSchema,
  type RequestMeta,
  usernameSchema,
} from "../src/types/auth.types";

const EXIT = { ok: 0, refused: 1, badInput: 2, failed: 3 } as const;

/** Change-log origin of everything this script does: no network address, no session. */
const META: RequestMeta = { ip: null, device: "bootstrap-admin" };

class UsageError extends Error {}

const USAGE =
  "Usage: bun run bootstrap-admin [--username <u>] [--password <p>] | --reset [--password <p>] | --unlock";

function parseFlags() {
  let values: ReturnType<typeof parseArgs>["values"];
  try {
    ({ values } = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        username: { type: "string" },
        password: { type: "string" },
        reset: { type: "boolean" },
        unlock: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  const username =
    typeof values.username === "string" ? values.username : undefined;
  const password =
    typeof values.password === "string" ? values.password : undefined;
  const reset = values.reset === true;
  const unlock = values.unlock === true;

  if (reset && unlock)
    throw new UsageError("--reset and --unlock cannot be combined");
  if (unlock && (username !== undefined || password !== undefined)) {
    throw new UsageError("--unlock takes no other flags");
  }
  if (reset && username !== undefined) {
    throw new UsageError("--reset keeps the username: it takes no --username");
  }
  return { username, password, reset, unlock };
}

/** Asks on the terminal; refuses when there is none (a script run must not hang waiting). */
function requireTerminal(missing: string) {
  if (!process.stdin.isTTY) {
    throw new UsageError(
      `${missing} is missing and there is no terminal to ask for it`,
    );
  }
}

function askVisible(question: string): string {
  return prompt(question) ?? "";
}

/** Reads a line from the terminal without echoing it. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let typed = "";
    const finish = (done: () => void) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      done();
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") return finish(() => resolve(typed));
        if (char === "\u0003")
          return finish(() => reject(new UsageError("Cancelled")));
        typed =
          char === "\u007f" || char === "\b"
            ? typed.slice(0, -1)
            : typed + char;
      }
    };
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function askNewPassword(): Promise<string> {
  const first = await askHidden("Password: ");
  const second = await askHidden("Repeat password: ");
  if (first !== second) throw new UsageError("The two passwords differ");
  return first;
}

/** Validates one typed value with the API's own schema; the message never repeats the value. */
function checked<S extends ZodType>(
  label: string,
  schema: S,
  value: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new UsageError(
      `${label}: ${result.error.issues[0]?.message ?? "not valid"}`,
    );
  }
  return result.data;
}

async function run(): Promise<void> {
  const flags = parseFlags();
  const now = new Date();

  if (flags.unlock) {
    const { wasLocked } = await authService.unlock(META, now);
    console.log(
      wasLocked
        ? "Sign-in unlocked."
        : "Sign-in was not locked; the counter is clear.",
    );
    return;
  }

  if (flags.reset) {
    if (flags.password === undefined) requireTerminal("--password");
    const password = checked(
      "Password",
      newPasswordSchema,
      flags.password ?? (await askNewPassword()),
    );
    const done = await authService.resetPassword(password, META, now);
    console.log(
      `Password reset for "${done.username}"; ${done.signedOut} sign-in(s) ended.`,
    );
    return;
  }

  if (flags.username === undefined) requireTerminal("--username");
  if (flags.password === undefined) requireTerminal("--password");
  const username = checked(
    "Username",
    usernameSchema,
    flags.username ?? askVisible("Username: "),
  );
  const password = checked(
    "Password",
    newPasswordSchema,
    flags.password ?? (await askNewPassword()),
  );
  const created = await authService.createAccount(
    { username, password },
    META,
    now,
  );
  console.log(`Login "${created.username}" created.`);
}

async function main(): Promise<number> {
  try {
    await run();
    return EXIT.ok;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n${USAGE}`);
      return EXIT.badInput;
    }
    if (error instanceof AppError && error.statusCode < 500) {
      console.error(error.message);
      return EXIT.refused;
    }
    console.error(
      `bootstrap-admin failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT.failed;
  } finally {
    await disconnectDb();
  }
}

process.exit(await main());
