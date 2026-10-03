/**
 * member-records/auth · the developer command `bootstrap-admin`
 * BR-REC-25 (one login, created by the script, no sign-up), BR-REC-26
 * (`--reset` signs every device out), BR-REC-27 (8-128 characters, argon2id).
 * The script runs as a child process against the *_test database.
 */
import { describe, expect, test } from "bun:test";

import { createApp } from "../../../src/app";
import { getRegistry } from "../../../src/lib/route-registry";
import {
  AUTH_PATHS,
  expectError,
  REFRESH_COOKIE,
  signInAs,
} from "./support/api-server";
import { runBootstrap } from "./support/bootstrap";
import {
  allAccounts,
  deleteLockRow,
  insertSession,
  installAccount,
  readLock,
  sessionsOf,
  TEST_PASSWORD,
  TEST_USERNAME,
} from "./support/fixtures";
import { useHarness } from "./support/harness";

const h = useHarness({ account: false });

const BOOT_USER = "test_auth_signin_boot";
const BOOT_PASSWORD = "TEST-boot-password-1";
const RESET_PASSWORD = "TEST-reset-password-2";

function create(username = BOOT_USER, password = BOOT_PASSWORD) {
  return runBootstrap(["--username", username, "--password", password]);
}

describe("BR-REC-25 exactly one login, created by the developer's command", () => {
  test("BR-REC-25 the command creates the one login (exit 0, one row, user name stored lower-case)", async () => {
    const run = await create("Test_Auth_Signin_Boot");
    const accounts = await allAccounts();

    expect(run.exitCode).toBe(0);
    expect(accounts.length).toBe(1);
    expect(accounts[0]?.username).toBe(BOOT_USER);
  });

  test("BR-REC-25 the created login can sign in", async () => {
    await create();

    const res = await h.api.login({
      username: BOOT_USER,
      password: BOOT_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.data?.username).toBe(BOOT_USER);
  });

  test("BR-REC-25 the command never prints the password", async () => {
    const run = await create();

    expect(run.exitCode).toBe(0);
    expect(run.output.includes(BOOT_PASSWORD)).toBe(false);
  });

  test("BR-REC-25 the command refuses when a login already exists (exit 1) and leaves it untouched", async () => {
    const existing = await installAccount();
    const before = (await allAccounts())[0];

    const run = await create(
      "test_auth_signin_second",
      "TEST-second-password-3",
    );
    const after = await allAccounts();

    expect(run.exitCode).toBe(1);
    expect(after.length).toBe(1);
    expect(after[0]?.id).toBe(existing.id);
    expect(after[0]?.username).toBe(existing.username);
    expect(after[0]?.passwordHash).toBe(before?.passwordHash as string);
  });

  test("BR-REC-25 the command also creates the lock row when it is missing (contract)", async () => {
    await deleteLockRow();

    const run = await create();
    const lock = await readLock();

    expect(run.exitCode).toBe(0);
    expect(lock?.failedCount).toBe(0);
    expect(lock?.lockedUntil ?? null).toBeNull();
  });

  test("BR-REC-25 values that are missing cannot be asked for without a terminal: exit 2, nothing created (contract)", async () => {
    const run = await runBootstrap([]);

    expect(run.exitCode).toBe(2);
    expect((await allAccounts()).length).toBe(0);
  });

  test("BR-REC-25 modes are exclusive and unknown flags are refused: exit 2, nothing created (contract)", async () => {
    const mixed = await runBootstrap([
      "--unlock",
      "--username",
      BOOT_USER,
      "--password",
      BOOT_PASSWORD,
    ]);
    const unknown = await runBootstrap(["--whatever"]);

    expect(mixed.exitCode).toBe(2);
    expect(unknown.exitCode).toBe(2);
    expect((await allAccounts()).length).toBe(0);
  });

  test("BR-REC-25 no route of the API is a sign-up (no registered write route about accounts)", () => {
    createApp();

    const writes = getRegistry().filter((r) => r.method !== "GET");
    const suspicious = writes.filter((r) =>
      /sign-?up|regist|accounts?\b|users?\b|create-?login/i.test(r.path),
    );

    expect(suspicious.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  test("BR-REC-25 sign-up style requests are refused and create no login", async () => {
    const paths = [
      "/api/auth/register",
      "/api/auth/signup",
      "/api/auth/sign-up",
      "/api/auth/account",
      "/api/auth/accounts",
      "/api/accounts",
      "/api/users",
      "/api/signup",
    ];

    for (const path of paths) {
      const res = await h.api.call("POST", path, {
        json: { username: BOOT_USER, password: BOOT_PASSWORD, remember: true },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }

    expect((await allAccounts()).length).toBe(0);
  });

  test("BR-REC-25 on a fresh install a sign-in attempt creates nothing (401 INVALID_CREDENTIALS)", async () => {
    const res = await h.api.login({
      username: BOOT_USER,
      password: BOOT_PASSWORD,
    });

    expectError(res, 401, "INVALID_CREDENTIALS");
    expect((await allAccounts()).length).toBe(0);
  });
});

describe("BR-REC-27 passwords of 8-128 characters, stored only as an argon2id hash", () => {
  const cases: { length: number; exitCode: number }[] = [
    { length: 7, exitCode: 2 },
    { length: 8, exitCode: 0 },
    { length: 128, exitCode: 0 },
    { length: 129, exitCode: 2 },
  ];

  for (const { length, exitCode } of cases) {
    test(`BR-REC-27 the command ${exitCode === 0 ? "accepts" : "rejects (exit 2)"} a password of ${length} characters`, async () => {
      const run = await create(BOOT_USER, "x".repeat(length));
      const accounts = await allAccounts();

      expect(run.exitCode).toBe(exitCode);
      expect(accounts.length).toBe(exitCode === 0 ? 1 : 0);
    });
  }

  test("BR-REC-27 the created login keeps only an argon2id hash", async () => {
    await create();

    const row = (await allAccounts())[0];

    expect(row?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row?.passwordHash.includes(BOOT_PASSWORD)).toBe(false);
    expect(
      await Bun.password.verify(BOOT_PASSWORD, row?.passwordHash ?? ""),
    ).toBe(true);
  });

  test("BR-REC-27 a reset keeps only an argon2id hash too", async () => {
    await installAccount();

    const run = await runBootstrap(["--reset", "--password", RESET_PASSWORD]);
    const row = (await allAccounts())[0];

    expect(run.exitCode).toBe(0);
    expect(row?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row?.passwordHash.includes(RESET_PASSWORD)).toBe(false);
  });
});

describe("BR-REC-26 a forgotten password is reset by the developer, which signs out every device", () => {
  test("BR-REC-26 --reset sets the new password (exit 0): the old one stops working, the new one signs in", async () => {
    await installAccount();

    const run = await runBootstrap(["--reset", "--password", RESET_PASSWORD]);
    const withOld = await h.api.login({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    const withNew = await h.api.login({
      username: TEST_USERNAME,
      password: RESET_PASSWORD,
    });

    expect(run.exitCode).toBe(0);
    expectError(withOld, 401, "INVALID_CREDENTIALS");
    expect(withNew.status).toBe(200);
  });

  test("BR-REC-26 --reset revokes every sign-in with reason reset", async () => {
    const account = await installAccount();
    await insertSession(account.id);
    await insertSession(account.id);
    await insertSession(account.id);

    const run = await runBootstrap(["--reset", "--password", RESET_PASSWORD]);
    const rows = await sessionsOf(account.id);

    expect(run.exitCode).toBe(0);
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.revokedAt).toBeInstanceOf(Date);
      expect(row.revokeReason).toBe("reset");
    }
  });

  test("BR-REC-26 every phone is back at Login: refresh cookies of signed-in devices fail with 401 SESSION_EXPIRED", async () => {
    await installAccount();
    const creds = { username: TEST_USERNAME, password: TEST_PASSWORD };
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);

    await runBootstrap(["--reset", "--password", RESET_PASSWORD]);

    for (const device of [tablet, phone]) {
      const res = await h.api.call("POST", AUTH_PATHS.refresh, {
        cookies: { [REFRESH_COOKIE]: device.refresh },
      });
      expectError(res, 401, "SESSION_EXPIRED");
    }
  });

  test("BR-REC-26 --reset never prints the password", async () => {
    await installAccount();

    const run = await runBootstrap(["--reset", "--password", RESET_PASSWORD]);

    expect(run.output.includes(RESET_PASSWORD)).toBe(false);
  });

  test("BR-REC-26 --reset with no login yet exits 1 and creates nothing", async () => {
    const run = await runBootstrap(["--reset", "--password", RESET_PASSWORD]);

    expect(run.exitCode).toBe(1);
    expect((await allAccounts()).length).toBe(0);
  });

  test("BR-REC-26 --reset with a password outside 8-128 characters exits 2 and changes nothing", async () => {
    const account = await installAccount();
    await insertSession(account.id);
    const before = (await allAccounts())[0];

    const tooShort = await runBootstrap(["--reset", "--password", "short"]);
    const tooLong = await runBootstrap([
      "--reset",
      "--password",
      "x".repeat(129),
    ]);
    const after = (await allAccounts())[0];
    const rows = await sessionsOf(account.id);

    expect(tooShort.exitCode).toBe(2);
    expect(tooLong.exitCode).toBe(2);
    expect(after?.passwordHash).toBe(before?.passwordHash as string);
    expect(rows.every((r) => r.revokedAt === null)).toBe(true);
  });

  test("BR-REC-26 --reset does not take a username (exit 2, nothing changes)", async () => {
    await installAccount();
    const before = (await allAccounts())[0];

    const run = await runBootstrap([
      "--reset",
      "--username",
      "test_auth_signin_other",
      "--password",
      RESET_PASSWORD,
    ]);
    const after = (await allAccounts())[0];

    expect(run.exitCode).toBe(2);
    expect(after?.username).toBe(before?.username as string);
    expect(after?.passwordHash).toBe(before?.passwordHash as string);
  });
});
