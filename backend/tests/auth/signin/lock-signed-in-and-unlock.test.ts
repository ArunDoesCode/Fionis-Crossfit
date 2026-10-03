/**
 * member-records/auth · a lock only stops new sign-ins; the developer can end it
 * BR-REC-171 (spec: docs/specs/member-records/auth.md v1).
 */
import { describe, expect, test } from "bun:test";

import {
  ACCESS_COOKIE,
  AUTH_PATHS,
  cookieNamed,
  expectLocked,
  isCleared,
  REFRESH_COOKIE,
  signInAs,
} from "./support/api-server";
import { runBootstrap } from "./support/bootstrap";
import {
  auditRows,
  readLock,
  TEST_PASSWORD,
  TEST_USERNAME,
} from "./support/fixtures";
import {
  expectAllInvalidCredentials,
  lockTheLogin,
  rightLogin,
  useHarness,
  wrongLogins,
} from "./support/harness";

const h = useHarness();

/** A tablet that is already signed in, then a stranger locks the login. */
async function signedInThenLocked() {
  const tablet = await signInAs(h.api, {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
  });
  await lockTheLogin(h.api);
  expectLocked(await rightLogin(h.api));
  return tablet;
}

describe("BR-REC-171 a lock only stops new sign-ins and password changes", () => {
  test("BR-REC-171 a device that is already signed in can still refresh (E02 -> 200 with new cookies)", async () => {
    const tablet = await signedInThenLocked();

    const res = await h.api.call("POST", AUTH_PATHS.refresh, {
      cookies: { [REFRESH_COOKIE]: tablet.refresh },
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.data?.expiresAt).toBe("string");
    expect(cookieNamed(res, ACCESS_COOKIE)?.value).toBeTruthy();
    expect(cookieNamed(res, REFRESH_COOKIE)?.value).toBeTruthy();
  });

  test("BR-REC-171 a signed-in device can still read its account (E05 -> 200)", async () => {
    const tablet = await signedInThenLocked();

    const res = await h.api.call("GET", AUTH_PATHS.me, {
      cookies: tablet.cookies,
    });

    expect(res.status).toBe(200);
    expect(res.body.data?.username).toBe(TEST_USERNAME);
  });

  test("BR-REC-171 a signed-in device can still sign out (E03 -> 200)", async () => {
    const tablet = await signedInThenLocked();

    const res = await h.api.call("POST", AUTH_PATHS.logout, {
      cookies: tablet.cookies,
    });

    expect(res.status).toBe(200);
    expect(isCleared(cookieNamed(res, ACCESS_COOKIE))).toBe(true);
    expect(isCleared(cookieNamed(res, REFRESH_COOKIE))).toBe(true);
  });

  test("BR-REC-171 a signed-in device can still sign out everywhere (E04 -> 200)", async () => {
    const tablet = await signedInThenLocked();

    const res = await h.api.call("POST", AUTH_PATHS.logoutAll, {
      cookies: tablet.cookies,
    });

    expect(res.status).toBe(200);
    expect(res.body.data?.signedOut).toBe(1);
  });

  test("BR-REC-171 the lock still stops a new sign-in on another device", async () => {
    await signedInThenLocked();

    expectLocked(await rightLogin(h.api));
  });
});

describe("BR-REC-171 the developer ends a lock with bootstrap-admin --unlock", () => {
  test("BR-REC-171 --unlock exits 0 and the owner can sign in at once", async () => {
    await lockTheLogin(h.api);
    expectLocked(await rightLogin(h.api));

    const run = await runBootstrap(["--unlock"]);
    const res = await rightLogin(h.api);

    expect(run.exitCode).toBe(0);
    expect(res.status).toBe(200);
  });

  test("BR-REC-171 --unlock resets the counter (nothing counted, not locked)", async () => {
    await lockTheLogin(h.api);

    const run = await runBootstrap(["--unlock"]);
    const lock = await readLock();

    expect(run.exitCode).toBe(0);
    expect(lock?.failedCount).toBe(0);
    expect(lock?.lockedUntil ?? null).toBeNull();
  });

  test("BR-REC-171 after --unlock it takes five new wrong tries to lock again", async () => {
    await lockTheLogin(h.api);
    await runBootstrap(["--unlock"]);

    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    const right = await rightLogin(h.api);

    expect(right.status).toBe(200);
  });

  test("BR-REC-171 --unlock is logged (audit row auth.unlock, one per run)", async () => {
    await lockTheLogin(h.api);
    const before = (await auditRows("auth.unlock", h.since)).length;

    const run = await runBootstrap(["--unlock"]);
    const rows = await auditRows("auth.unlock", h.since);

    expect(run.exitCode).toBe(0);
    expect(rows.length).toBe(before + 1);
  });

  test("BR-REC-171 --unlock when nobody is locked is harmless (exit 0)", async () => {
    const run = await runBootstrap(["--unlock"]);
    const lock = await readLock();

    expect(run.exitCode).toBe(0);
    expect(lock?.failedCount).toBe(0);
  });
});
