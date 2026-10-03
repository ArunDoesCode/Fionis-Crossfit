/**
 * member-records/auth · sign-in and the global lock
 * BR-REC-01, BR-REC-28, BR-REC-29 (spec: docs/specs/member-records/auth.md v1).
 *
 * Time is simulated by moving the recorded lock moments into the past
 * (`rewindLock`), as if that much time had gone by; no rule is read from code.
 */
import { describe, expect, test } from "bun:test";

import {
  ACCESS_COOKIE,
  AUTH_PATHS,
  cookieNamed,
  expectError,
  expectLocked,
  nextIp,
  REFRESH_COOKIE,
  retryAfterSeconds,
} from "./support/api-server";
import {
  LOCK_SECONDS,
  lockUntil,
  readLock,
  rewindLock,
  TEST_PASSWORD,
  TEST_USERNAME,
  WRONG_PASSWORD,
} from "./support/fixtures";
import {
  expectAllInvalidCredentials,
  lockTheLogin,
  rightLogin,
  useHarness,
  wrongLogin,
  wrongLogins,
} from "./support/harness";

const h = useHarness();

describe("BR-REC-01 one shared login, five wrong tries lock it", () => {
  test("BR-REC-01 the right username and password signs in", async () => {
    const res = await rightLogin(h.api);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.username).toBe(TEST_USERNAME);
    expect(res.body.data?.remember).toBe(true);
    expect(typeof res.body.data?.expiresAt).toBe("string");
    expect(cookieNamed(res, ACCESS_COOKIE)?.value).toBeTruthy();
    expect(cookieNamed(res, REFRESH_COOKIE)?.value).toBeTruthy();
  });

  test("BR-REC-01 the username is matched without regard to upper/lower case", async () => {
    const res = await h.api.login({
      username: TEST_USERNAME.toUpperCase(),
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
  });

  test("BR-REC-01 a wrong password is 401 INVALID_CREDENTIALS", async () => {
    const res = await h.api.login({
      username: TEST_USERNAME,
      password: WRONG_PASSWORD,
    });

    expectError(res, 401, "INVALID_CREDENTIALS");
    expect(cookieNamed(res, ACCESS_COOKIE)).toBeUndefined();
    expect(cookieNamed(res, REFRESH_COOKIE)).toBeUndefined();
  });

  test("BR-REC-01 a wrong username and a wrong password get the same 401 (same code, same text)", async () => {
    const wrongPassword = await h.api.login({
      username: TEST_USERNAME,
      password: WRONG_PASSWORD,
    });
    const wrongUser = await h.api.login({
      username: "test_auth_signin_nobody",
      password: TEST_PASSWORD,
    });

    expect(wrongPassword.status).toBe(401);
    expect(wrongUser.status).toBe(401);
    expect(wrongUser.body.code).toBe(wrongPassword.body.code);
    expect(wrongUser.body.message).toBe(wrongPassword.body.message);
    expect(wrongUser.body.details).toEqual(wrongPassword.body.details);
  });

  test("BR-REC-01 the 5th wrong try is still 401", async () => {
    const tries = await wrongLogins(h.api, 5);

    expect(tries.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
  });

  test("BR-REC-01 the 6th try is 429 LOGIN_LOCKED even with the right password", async () => {
    await lockTheLogin(h.api);

    const res = await rightLogin(h.api);

    expectLocked(res);
    expect(cookieNamed(res, ACCESS_COOKIE)).toBeUndefined();
    expect(cookieNamed(res, REFRESH_COOKIE)).toBeUndefined();
  });

  test("BR-REC-01 a wrong try while locked is also 429 LOGIN_LOCKED (not 401)", async () => {
    await lockTheLogin(h.api);

    const res = await wrongLogin(h.api);

    expectLocked(res);
  });

  test("BR-REC-01 the lock answer does not say which part was wrong", async () => {
    await lockTheLogin(h.api);

    const wrongUser = await h.api.login({
      username: "test_auth_signin_nobody",
      password: TEST_PASSWORD,
    });
    const rightUser = await rightLogin(h.api);

    expectLocked(wrongUser);
    expectLocked(rightUser);
    expect(wrongUser.body.message).toBe(rightUser.body.message);
  });

  test("BR-REC-01 only the shared login gets in: pages of the API need a sign-in (E04, E05, E06 -> 401)", async () => {
    const e05 = await h.api.call("GET", AUTH_PATHS.me);
    const e04 = await h.api.call("POST", AUTH_PATHS.logoutAll);
    const e06 = await h.api.call("POST", AUTH_PATHS.password, {
      json: {
        currentPassword: TEST_PASSWORD,
        newPassword: "TEST-new-password-1",
      },
    });

    expectError(e05, 401, "UNAUTHORIZED");
    expectError(e04, 401, "UNAUTHORIZED");
    expectError(e06, 401, "UNAUTHORIZED");
  });
});

describe("BR-REC-28 one counter for the whole login", () => {
  test("BR-REC-28 wrong tries from two devices add up (3 + 2 -> locked)", async () => {
    const tablet = nextIp();
    const phone = nextIp();
    for (let i = 0; i < 3; i += 1) {
      const res = await h.api.login(
        { username: TEST_USERNAME, password: WRONG_PASSWORD },
        { ip: tablet },
      );
      expectError(res, 401, "INVALID_CREDENTIALS");
    }
    for (let i = 0; i < 2; i += 1) {
      const res = await h.api.login(
        { username: TEST_USERNAME, password: WRONG_PASSWORD },
        { ip: phone },
      );
      expectError(res, 401, "INVALID_CREDENTIALS");
    }

    const third = await h.api.login(
      { username: TEST_USERNAME, password: TEST_PASSWORD },
      { ip: nextIp() },
    );

    expectLocked(third);
  });

  test("BR-REC-28 wrong tries with different typed usernames add up", async () => {
    expectAllInvalidCredentials(
      await wrongLogins(h.api, 3, { username: TEST_USERNAME }),
    );
    expectAllInvalidCredentials(
      await wrongLogins(h.api, 2, { username: "test_auth_signin_someone" }),
    );

    expectLocked(await rightLogin(h.api));
  });

  test("BR-REC-28 tries with unknown usernames count too", async () => {
    expectAllInvalidCredentials(
      await wrongLogins(h.api, 5, {
        username: "test_auth_signin_unknown",
        password: TEST_PASSWORD,
      }),
    );

    expectLocked(await rightLogin(h.api));
  });

  test("BR-REC-28 four wrong tries do not lock the login", async () => {
    expectAllInvalidCredentials(await wrongLogins(h.api, 4));

    const res = await rightLogin(h.api);

    expect(res.status).toBe(200);
  });

  test("BR-REC-28 tries older than 15 minutes drop off (4 wrong, 16 min later 1 wrong -> not locked)", async () => {
    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    await rewindLock(16 * 60);

    const fifth = await wrongLogin(h.api);
    const right = await rightLogin(h.api);

    expectError(fifth, 401, "INVALID_CREDENTIALS");
    expect(right.status).toBe(200);
  });

  test("BR-REC-28 dropped tries are not added to new ones (4 old + 4 new stays below 5)", async () => {
    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    await rewindLock(16 * 60);

    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    const right = await rightLogin(h.api);

    expect(right.status).toBe(200);
  });

  test("BR-REC-28 tries newer than 15 minutes still add up (4 wrong, 10 min later 1 wrong -> locked)", async () => {
    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    await rewindLock(10 * 60);

    const fifth = await wrongLogin(h.api);
    const right = await rightLogin(h.api);

    expectError(fifth, 401, "INVALID_CREDENTIALS");
    expectLocked(right);
  });

  test("BR-REC-28 a correct sign-in clears the count", async () => {
    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    expect((await rightLogin(h.api)).status).toBe(200);

    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    const right = await rightLogin(h.api);

    expect(right.status).toBe(200);
  });

  test("BR-REC-28 the count is kept in the database: a server restart does not reset it", async () => {
    await lockTheLogin(h.api);
    const restarted = await h.restartApi();

    const res = await restarted.login({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });

    expectLocked(res);
  });

  test("BR-REC-28 parallel wrong tries lose no count (10 at once -> locked)", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.api.login({ username: TEST_USERNAME, password: WRONG_PASSWORD }),
      ),
    );

    for (const res of results) expect([401, 429]).toContain(res.status);
    expect(
      results.filter((r) => r.status === 401).length,
    ).toBeGreaterThanOrEqual(5);
    expectLocked(await rightLogin(h.api));
  });
});

describe("BR-REC-29 while the login is locked", () => {
  test("BR-REC-29 a fresh lock reports about 15 minutes, in whole seconds, with a matching Retry-After", async () => {
    await lockTheLogin(h.api);

    const seconds = expectLocked(await rightLogin(h.api));

    expect(seconds).toBeGreaterThanOrEqual(LOCK_SECONDS - 10);
    expect(seconds).toBeLessThanOrEqual(LOCK_SECONDS);
  });

  test("BR-REC-29 locked at 10:00, a try at 10:06 has 9 minutes left (minutes rounded up)", async () => {
    await lockTheLogin(h.api);
    await rewindLock(6 * 60);

    const res = await rightLogin(h.api);
    expectLocked(res);
    const seconds = retryAfterSeconds(res);

    expect(seconds).toBeGreaterThan(8 * 60);
    expect(seconds).toBeLessThanOrEqual(9 * 60);
    expect(Math.ceil(seconds / 60)).toBe(9);
  });

  test("BR-REC-29 seconds left are rounded up, never 0 (2.5 s left -> 3)", async () => {
    await lockUntil(2.5);

    const res = await rightLogin(h.api);

    expect(expectLocked(res)).toBe(3);
  });

  test("BR-REC-29 tries while locked, right or wrong, do not extend the lock", async () => {
    await lockTheLogin(h.api);
    const before = await readLock();
    const firstLeft = expectLocked(await rightLogin(h.api));

    expectLocked(await rightLogin(h.api));
    expectLocked(await wrongLogin(h.api));
    const lastLeft = expectLocked(await rightLogin(h.api));
    const after = await readLock();

    expect(before?.lockedUntil).toBeInstanceOf(Date);
    expect(after?.lockedUntil?.getTime()).toBe(before?.lockedUntil?.getTime());
    expect(lastLeft).toBeLessThanOrEqual(firstLeft);
  });

  test("BR-REC-29 at 10:14 the login is still locked, with about a minute left", async () => {
    await lockTheLogin(h.api);
    await rewindLock(14 * 60);

    const seconds = expectLocked(await rightLogin(h.api));

    expect(seconds).toBeGreaterThanOrEqual(50);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  test("BR-REC-29 at 10:15 the right password works again", async () => {
    await lockTheLogin(h.api);
    await rewindLock(15 * 60 + 2);

    const res = await rightLogin(h.api);

    expect(res.status).toBe(200);
    expect(cookieNamed(res, ACCESS_COOKIE)?.value).toBeTruthy();
  });

  test("BR-REC-29 once a lock has ended the count starts from zero (4 wrong tries do not lock again)", async () => {
    await lockTheLogin(h.api);
    await rewindLock(16 * 60);

    expectAllInvalidCredentials(await wrongLogins(h.api, 4));
    const right = await rightLogin(h.api);

    expect(right.status).toBe(200);
  });
});
