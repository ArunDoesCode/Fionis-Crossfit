/**
 * member-records/auth · changing the password (E06) and what a password may be
 * BR-REC-02, BR-REC-27, BR-REC-34 (spec: docs/specs/member-records/auth.md v1).
 */
import { describe, expect, test } from "bun:test";

import {
  ACCESS_COOKIE,
  type ApiResponse,
  AUTH_PATHS,
  cookieNamed,
  expectError,
  expectLocked,
  REFRESH_COOKIE,
  type Signed,
  signInAs,
} from "./support/api-server";
import {
  dumpAuthData,
  readAccount,
  sessionById,
  TEST_PASSWORD,
  TEST_USERNAME,
  WRONG_PASSWORD,
} from "./support/fixtures";
import {
  expectAllInvalidCredentials,
  lockTheLogin,
  rightLogin,
  useHarness,
  wrongLogins,
} from "./support/harness";

const h = useHarness();

const creds = { username: TEST_USERNAME, password: TEST_PASSWORD };
const NEW_PASSWORD = "TEST-new-password-2";

async function changePassword(
  device: Signed,
  body: Record<string, unknown>,
): Promise<ApiResponse> {
  return h.api.call("POST", AUTH_PATHS.password, {
    cookies: device.cookies,
    json: body,
  });
}

/** Normalises a validation issue path ("newPassword" or ["newPassword"]) to a dotted string. */
function issuePath(res: ApiResponse, index = 0): string {
  const issues = res.body.details?.issues;
  if (!Array.isArray(issues)) {
    throw new Error(`details.issues missing in ${JSON.stringify(res.body)}`);
  }
  const path = (issues[index] as { path?: unknown } | undefined)?.path;
  return Array.isArray(path) ? path.join(".") : String(path);
}

function issueMessage(res: ApiResponse, index = 0): string {
  const issues = res.body.details?.issues as { message?: string }[] | undefined;
  return issues?.[index]?.message ?? "";
}

describe("BR-REC-02 the password is changed with the current password, 8 characters at least", () => {
  test("BR-REC-02 a new password of 'abc' is rejected with 400 VALIDATION_ERROR on newPassword", async () => {
    const device = await signInAs(h.api, creds);

    const res = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: "abc",
    });

    expectError(res, 400, "VALIDATION_ERROR");
    expect(issuePath(res)).toBe("newPassword");
  });

  test("BR-REC-02 a rejected change changes nothing (same password works, no device signed out)", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    const before = await readAccount(h.account.id);

    await changePassword(tablet, {
      currentPassword: TEST_PASSWORD,
      newPassword: "abc",
    });
    const after = await readAccount(h.account.id);
    const phoneRow = await sessionById(phone.sid);

    expect(after?.passwordHash).toBe(before?.passwordHash as string);
    expect(phoneRow?.revokedAt ?? null).toBeNull();
    expect((await rightLogin(h.api)).status).toBe(200);
  });

  test("BR-REC-02 7 characters are rejected, 8 characters are accepted", async () => {
    const device = await signInAs(h.api, creds);

    const seven = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: "1234567",
    });
    const eight = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: "12345678",
    });

    expectError(seven, 400, "VALIDATION_ERROR");
    expect(issuePath(seven)).toBe("newPassword");
    expect(eight.status).toBe(200);
    expect(eight.body.success).toBe(true);
  });

  test("BR-REC-02 the current password is required (missing -> 400 VALIDATION_ERROR on currentPassword)", async () => {
    const device = await signInAs(h.api, creds);

    const res = await changePassword(device, { newPassword: NEW_PASSWORD });

    expectError(res, 400, "VALIDATION_ERROR");
    expect(issuePath(res)).toBe("currentPassword");
  });

  test("BR-REC-02 after a change the new password signs in and the old one does not", async () => {
    const device = await signInAs(h.api, creds);
    const change = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const withNew = await h.api.login({
      username: TEST_USERNAME,
      password: NEW_PASSWORD,
    });
    const withOld = await h.api.login(creds);

    expect(change.status).toBe(200);
    expect(withNew.status).toBe(200);
    expectError(withOld, 401, "INVALID_CREDENTIALS");
  });
});

describe("BR-REC-27 passwords are 8-128 characters of any kind, stored only as an argon2id hash", () => {
  test("BR-REC-27 128 characters are accepted and then work for signing in", async () => {
    const long = "p".repeat(128);
    const device = await signInAs(h.api, creds);

    const change = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: long,
    });
    const signIn = await h.api.login({
      username: TEST_USERNAME,
      password: long,
    });

    expect(change.status).toBe(200);
    expect(signIn.status).toBe(200);
  });

  test("BR-REC-27 129 characters are rejected: 400 VALIDATION_ERROR on newPassword, 'Use at most 128 characters'", async () => {
    const device = await signInAs(h.api, creds);

    const res = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: "p".repeat(129),
    });

    expectError(res, 400, "VALIDATION_ERROR");
    expect(issuePath(res)).toBe("newPassword");
    expect(issueMessage(res)).toBe("Use at most 128 characters");
  });

  test("BR-REC-27 a sign-in with a password longer than 128 characters is a 400 VALIDATION_ERROR, not a wrong-password 401", async () => {
    const res = await h.api.login({
      username: TEST_USERNAME,
      password: "p".repeat(129),
    });

    expectError(res, 400, "VALIDATION_ERROR");
  });

  test("BR-REC-27 there are no other complexity rules (all the same letter is fine)", async () => {
    const device = await signInAs(h.api, creds);

    const res = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: "aaaaaaaa",
    });

    expect(res.status).toBe(200);
    expect(
      (await h.api.login({ username: TEST_USERNAME, password: "aaaaaaaa" }))
        .status,
    ).toBe(200);
  });

  test("BR-REC-27 any kind of character is allowed (spaces, accents, symbols) and is not altered", async () => {
    const odd = "  päss wörd ✓ ß€  ";
    const device = await signInAs(h.api, creds);

    const change = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: odd,
    });
    const signIn = await h.api.login({
      username: TEST_USERNAME,
      password: odd,
    });

    expect(change.status).toBe(200);
    expect(signIn.status).toBe(200);
  });

  test("BR-REC-27 the stored value is an argon2id hash that verifies the password", async () => {
    const device = await signInAs(h.api, creds);
    await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const row = await readAccount(h.account.id);

    expect(row?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(
      await Bun.password.verify(NEW_PASSWORD, row?.passwordHash ?? ""),
    ).toBe(true);
  });

  test("BR-REC-27 no plain-text password is kept anywhere (account, sessions, lock store, change log)", async () => {
    const typedWrong = "TEST-typed-wrong-secret-77";
    const device = await signInAs(h.api, creds);
    await wrongLogins(h.api, 1, { password: typedWrong });
    await changePassword(device, {
      currentPassword: "TEST-typed-wrong-current-88",
      newPassword: "TEST-typed-new-secret-99",
    });
    await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const dump = await dumpAuthData(h.since);

    for (const secret of [
      TEST_PASSWORD,
      NEW_PASSWORD,
      typedWrong,
      "TEST-typed-wrong-current-88",
      "TEST-typed-new-secret-99",
    ]) {
      expect(dump.includes(secret)).toBe(false);
    }
  });
});

describe("BR-REC-34 changing the password signs out the other devices, keeps this one", () => {
  test("BR-REC-34 a wrong current password is 400 CURRENT_PASSWORD_WRONG, never 401", async () => {
    const device = await signInAs(h.api, creds);

    const res = await changePassword(device, {
      currentPassword: WRONG_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expectError(res, 400, "CURRENT_PASSWORD_WRONG");
  });

  test("BR-REC-34 a wrong current password changes nothing and signs nobody out", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    const before = await readAccount(h.account.id);

    await changePassword(tablet, {
      currentPassword: WRONG_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    const after = await readAccount(h.account.id);
    const tabletRefresh = await h.api.call("POST", AUTH_PATHS.refresh, {
      cookies: { [REFRESH_COOKIE]: tablet.refresh },
    });

    expect(after?.passwordHash).toBe(before?.passwordHash as string);
    expect(tabletRefresh.status).toBe(200);
    expect((await sessionById(tablet.sid))?.revokedAt ?? null).toBeNull();
    expect((await sessionById(phone.sid))?.revokedAt ?? null).toBeNull();
  });

  test("BR-REC-34 wrong current passwords count toward the lock (5 wrong, then the right one -> 429)", async () => {
    const device = await signInAs(h.api, creds);
    for (let i = 0; i < 5; i += 1) {
      const res = await changePassword(device, {
        currentPassword: WRONG_PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expectError(res, 400, "CURRENT_PASSWORD_WRONG");
    }

    const change = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    const signIn = await rightLogin(h.api);

    expectLocked(change);
    expectLocked(signIn);
  });

  test("BR-REC-34 wrong current passwords add up with wrong sign-ins (3 + 2 -> locked)", async () => {
    const device = await signInAs(h.api, creds);
    expectAllInvalidCredentials(await wrongLogins(h.api, 3));
    for (let i = 0; i < 2; i += 1) {
      const res = await changePassword(device, {
        currentPassword: WRONG_PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expectError(res, 400, "CURRENT_PASSWORD_WRONG");
    }

    expectLocked(await rightLogin(h.api));
  });

  test("BR-REC-34 a request that fails validation does not count toward the lock", async () => {
    const device = await signInAs(h.api, creds);
    for (let i = 0; i < 6; i += 1) {
      const res = await changePassword(device, {
        currentPassword: WRONG_PASSWORD,
        newPassword: "short",
      });
      expectError(res, 400, "VALIDATION_ERROR");
    }

    const change = await changePassword(device, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(change.status).toBe(200);
  });

  test("BR-REC-34 a successful change signs out every other device (revoked, reason password_change)", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    const laptop = await signInAs(h.api, creds);

    const res = await changePassword(tablet, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    const phoneRow = await sessionById(phone.sid);
    const laptopRow = await sessionById(laptop.sid);

    expect(res.status).toBe(200);
    for (const row of [phoneRow, laptopRow]) {
      expect(row?.revokedAt).toBeInstanceOf(Date);
      expect(row?.revokeReason).toBe("password_change");
    }
  });

  test("BR-REC-34 the other devices cannot refresh any more (401 SESSION_EXPIRED)", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    await changePassword(tablet, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const res = await h.api.call("POST", AUTH_PATHS.refresh, {
      cookies: { [REFRESH_COOKIE]: phone.refresh },
    });

    expectError(res, 401, "SESSION_EXPIRED");
  });

  test("BR-REC-34 this device stays signed in (not revoked, still refreshes)", async () => {
    const tablet = await signInAs(h.api, creds);
    await signInAs(h.api, creds);
    await changePassword(tablet, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const row = await sessionById(tablet.sid);
    const refreshed = await h.api.call("POST", AUTH_PATHS.refresh, {
      cookies: { [REFRESH_COOKIE]: tablet.refresh },
    });

    expect(row?.revokedAt ?? null).toBeNull();
    expect(refreshed.status).toBe(200);
  });

  test("BR-REC-34 this device's cookies are not changed by the change", async () => {
    const tablet = await signInAs(h.api, creds);

    const res = await changePassword(tablet, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    for (const [name, value] of [
      [ACCESS_COOKIE, tablet.access],
      [REFRESH_COOKIE, tablet.refresh],
    ] as const) {
      const cookie = cookieNamed(res, name);
      if (cookie !== undefined) expect(cookie.value).toBe(value);
    }
    expect(res.status).toBe(200);
  });

  test("BR-REC-34 while the login is locked a password change is 429 LOGIN_LOCKED, checked before the password", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    await lockTheLogin(h.api);
    const before = await readAccount(h.account.id);

    const res = await changePassword(tablet, {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    const after = await readAccount(h.account.id);

    expectLocked(res);
    expect(after?.passwordHash).toBe(before?.passwordHash as string);
    expect((await sessionById(phone.sid))?.revokedAt ?? null).toBeNull();
  });

  test("BR-REC-34 the 429 does not sign anyone out", async () => {
    const tablet = await signInAs(h.api, creds);
    await lockTheLogin(h.api);

    await changePassword(tablet, {
      currentPassword: WRONG_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    const row = await sessionById(tablet.sid);
    const refreshed = await h.api.call("POST", AUTH_PATHS.refresh, {
      cookies: { [REFRESH_COOKIE]: tablet.refresh },
    });

    expect(row?.revokedAt ?? null).toBeNull();
    expect(refreshed.status).toBe(200);
  });
});
