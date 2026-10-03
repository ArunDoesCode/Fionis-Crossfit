/**
 * member-records/auth · BR-REC-43 (spec v2, review R-6): the developer command's two events go to the
 * change log too — "login created and password reset by the developer's command" — with the time,
 * never the password. (`--unlock` is covered in lock-signed-in-and-unlock.test.ts.)
 * Action names come from the contract: `auth.account_created`, `auth.password_reset`.
 * The script runs as a child process against the *_test database.
 */
import { describe, expect, test } from "bun:test";

import { runBootstrap } from "./support/bootstrap";
import {
  auditRows,
  insertSession,
  installAccount,
  TEST_PASSWORD,
} from "./support/fixtures";
import { useHarness } from "./support/harness";

const h = useHarness({ server: false, account: false });

const BOOT_USER = "test_auth_signin_boot_audit";
const BOOT_PASSWORD = "TEST-audit-boot-password-1";
const RESET_PASSWORD = "TEST-audit-reset-password-2";

const CREATED = "auth.account_created";
const RESET = "auth.password_reset";

/** The change-log rows of `action` that `run` wrote (other rows of this file are ignored). */
async function rowsWrittenBy(action: string, run: () => Promise<unknown>) {
  const known = new Set((await auditRows(action, h.since)).map((r) => r.id));
  await run();
  return (await auditRows(action, h.since)).filter((r) => !known.has(r.id));
}

/** Every change-log row of this file's run, as one string, to look for typed passwords. */
async function everythingLogged(): Promise<string> {
  const [created, reset] = await Promise.all([
    auditRows(CREATED, h.since),
    auditRows(RESET, h.since),
  ]);
  return JSON.stringify([...created, ...reset]);
}

const createLogin = (password = BOOT_PASSWORD) =>
  runBootstrap(["--username", BOOT_USER, "--password", password]);

describe("BR-REC-43 creating the login is logged", () => {
  test("BR-REC-43 bootstrap-admin creating the login writes one auth.account_created row with no session", async () => {
    let exitCode = -1;
    const rows = await rowsWrittenBy(CREATED, async () => {
      exitCode = (await createLogin()).exitCode;
    });

    expect(exitCode).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBeNull();
  });

  test("BR-REC-43 the auth.account_created row carries the time of the command", async () => {
    const rows = await rowsWrittenBy(CREATED, () => createLogin());

    expect(rows).toHaveLength(1);
    const at = rows[0]?.at.getTime() ?? 0;
    expect(Math.abs(at - Date.now())).toBeLessThan(60_000);
  });

  test("BR-REC-43 the auth.account_created row never holds the password", async () => {
    await createLogin();

    const dump = await everythingLogged();

    expect(dump).toContain(CREATED); // the row exists, so the check below means something
    expect(dump).not.toContain(BOOT_PASSWORD);
  });

  test("BR-REC-43 a refused creation (a login already exists, exit 1) logs no auth.account_created", async () => {
    await installAccount();
    let exitCode = -1;

    const rows = await rowsWrittenBy(CREATED, async () => {
      exitCode = (await createLogin()).exitCode;
    });

    expect(exitCode).toBe(1);
    expect(rows).toHaveLength(0);
  });

  test("BR-REC-43 a refused creation (password outside 8-128 characters, exit 2) logs no auth.account_created", async () => {
    let exitCode = -1;

    const rows = await rowsWrittenBy(CREATED, async () => {
      exitCode = (await createLogin("short")).exitCode;
    });

    expect(exitCode).toBe(2);
    expect(rows).toHaveLength(0);
  });

  test("BR-REC-43 creating the login does not log a password reset", async () => {
    const rows = await rowsWrittenBy(RESET, () => createLogin());

    expect(rows).toHaveLength(0);
  });
});

describe("BR-REC-43 a password reset by the developer is logged", () => {
  test("BR-REC-43 bootstrap-admin --reset writes one auth.password_reset row with no session, however many devices were signed in", async () => {
    const account = await installAccount();
    await insertSession(account.id);
    await insertSession(account.id);
    let exitCode = -1;

    const rows = await rowsWrittenBy(RESET, async () => {
      exitCode = (await runBootstrap(["--reset", "--password", RESET_PASSWORD]))
        .exitCode;
    });

    expect(exitCode).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBeNull();
  });

  test("BR-REC-43 the auth.password_reset row carries the time of the command", async () => {
    await installAccount();

    const rows = await rowsWrittenBy(RESET, () =>
      runBootstrap(["--reset", "--password", RESET_PASSWORD]),
    );

    expect(rows).toHaveLength(1);
    const at = rows[0]?.at.getTime() ?? 0;
    expect(Math.abs(at - Date.now())).toBeLessThan(60_000);
  });

  test("BR-REC-43 the auth.password_reset row holds neither the new nor the old password", async () => {
    await installAccount();
    await runBootstrap(["--reset", "--password", RESET_PASSWORD]);

    const dump = await everythingLogged();

    expect(dump).toContain(RESET);
    expect(dump).not.toContain(RESET_PASSWORD);
    expect(dump).not.toContain(TEST_PASSWORD);
  });

  test("BR-REC-43 a reset with no login yet (exit 1) logs no auth.password_reset", async () => {
    let exitCode = -1;

    const rows = await rowsWrittenBy(RESET, async () => {
      exitCode = (await runBootstrap(["--reset", "--password", RESET_PASSWORD]))
        .exitCode;
    });

    expect(exitCode).toBe(1);
    expect(rows).toHaveLength(0);
  });

  test("BR-REC-43 a reset with a password outside 8-128 characters (exit 2) logs no auth.password_reset", async () => {
    await installAccount();
    let exitCode = -1;

    const rows = await rowsWrittenBy(RESET, async () => {
      exitCode = (await runBootstrap(["--reset", "--password", "short"]))
        .exitCode;
    });

    expect(exitCode).toBe(2);
    expect(rows).toHaveLength(0);
  });

  test("BR-REC-43 a reset does not log a login creation", async () => {
    await installAccount();

    const rows = await rowsWrittenBy(CREATED, () =>
      runBootstrap(["--reset", "--password", RESET_PASSWORD]),
    );

    expect(rows).toHaveLength(0);
  });
});
