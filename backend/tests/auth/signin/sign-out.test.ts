/**
 * member-records/auth · sign out and sign out all devices
 * BR-REC-35 (backend half: sessions ended, cookies cleared; the app half,
 * `queryClient.clear()` and the Login screen after the back button, is a
 * frontend test).
 */
import { describe, expect, test } from "bun:test";

import {
  ACCESS_COOKIE,
  AUTH_PATHS,
  cookieNamed,
  expectError,
  isCleared,
  REFRESH_COOKIE,
  type Signed,
  signInAs,
} from "./support/api-server";
import {
  sessionById,
  sessionsOf,
  TEST_PASSWORD,
  TEST_USERNAME,
} from "./support/fixtures";
import { useHarness } from "./support/harness";

const h = useHarness();

const creds = { username: TEST_USERNAME, password: TEST_PASSWORD };

async function refresh(device: Signed) {
  return h.api.call("POST", AUTH_PATHS.refresh, {
    cookies: { [REFRESH_COOKIE]: device.refresh },
  });
}

describe("BR-REC-35 Sign out ends this device's sign-in", () => {
  test("BR-REC-35 sign out answers 200 and clears both cookies", async () => {
    const device = await signInAs(h.api, creds);

    const res = await h.api.call("POST", AUTH_PATHS.logout, {
      cookies: device.cookies,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(isCleared(cookieNamed(res, ACCESS_COOKIE))).toBe(true);
    expect(isCleared(cookieNamed(res, REFRESH_COOKIE))).toBe(true);
  });

  test("BR-REC-35 sign out revokes this device's sign-in (reason logout)", async () => {
    const device = await signInAs(h.api, creds);

    await h.api.call("POST", AUTH_PATHS.logout, { cookies: device.cookies });
    const row = await sessionById(device.sid);

    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(row?.revokeReason).toBe("logout");
  });

  test("BR-REC-35 after sign out the old refresh cookie no longer works (401 SESSION_EXPIRED)", async () => {
    const device = await signInAs(h.api, creds);
    await h.api.call("POST", AUTH_PATHS.logout, { cookies: device.cookies });

    const res = await refresh(device);

    expectError(res, 401, "SESSION_EXPIRED");
  });

  test("BR-REC-35 sign out leaves the other devices signed in", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);

    await h.api.call("POST", AUTH_PATHS.logout, { cookies: tablet.cookies });
    const phoneRefresh = await refresh(phone);
    const phoneRow = await sessionById(phone.sid);

    expect(phoneRefresh.status).toBe(200);
    expect(phoneRow?.revokedAt ?? null).toBeNull();
  });

  test("BR-REC-35 sign out needs only the refresh cookie (the access cookie may have expired)", async () => {
    const device = await signInAs(h.api, creds);

    const res = await h.api.call("POST", AUTH_PATHS.logout, {
      cookies: { [REFRESH_COOKIE]: device.refresh },
    });
    const row = await sessionById(device.sid);

    expect(res.status).toBe(200);
    expect(row?.revokeReason).toBe("logout");
  });

  test("BR-REC-35 sign out with nothing to end is still 200 and clears the cookies", async () => {
    const res = await h.api.call("POST", AUTH_PATHS.logout);

    expect(res.status).toBe(200);
    expect(isCleared(cookieNamed(res, ACCESS_COOKIE))).toBe(true);
    expect(isCleared(cookieNamed(res, REFRESH_COOKIE))).toBe(true);
  });
});

describe("BR-REC-35 Sign out all devices ends every sign-in, this one too", () => {
  test("BR-REC-35 answers 200 with how many sign-ins it ended, and clears both cookies", async () => {
    const tablet = await signInAs(h.api, creds);
    await signInAs(h.api, creds);
    await signInAs(h.api, creds);

    const res = await h.api.call("POST", AUTH_PATHS.logoutAll, {
      cookies: tablet.cookies,
    });

    expect(res.status).toBe(200);
    expect(res.body.data?.signedOut).toBe(3);
    expect(isCleared(cookieNamed(res, ACCESS_COOKIE))).toBe(true);
    expect(isCleared(cookieNamed(res, REFRESH_COOKIE))).toBe(true);
  });

  test("BR-REC-35 every sign-in is revoked with reason logout_all, this device's included", async () => {
    const tablet = await signInAs(h.api, creds);
    await signInAs(h.api, creds);
    await signInAs(h.api, creds);

    await h.api.call("POST", AUTH_PATHS.logoutAll, { cookies: tablet.cookies });
    const rows = await sessionsOf(h.account.id);

    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.revokedAt).toBeInstanceOf(Date);
      expect(row.revokeReason).toBe("logout_all");
    }
  });

  test("BR-REC-35 no device can refresh afterwards (401 SESSION_EXPIRED at once)", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    await h.api.call("POST", AUTH_PATHS.logoutAll, { cookies: tablet.cookies });

    expectError(await refresh(tablet), 401, "SESSION_EXPIRED");
    expectError(await refresh(phone), 401, "SESSION_EXPIRED");
  });

  test("BR-REC-35 only sign-ins still active are counted (one already signed out -> 2)", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    await signInAs(h.api, creds);
    await h.api.call("POST", AUTH_PATHS.logout, { cookies: phone.cookies });

    const res = await h.api.call("POST", AUTH_PATHS.logoutAll, {
      cookies: tablet.cookies,
    });

    expect(res.body.data?.signedOut).toBe(2);
  });

  test("BR-REC-35 a sign-in already ended by Sign out keeps its original reason", async () => {
    const tablet = await signInAs(h.api, creds);
    const phone = await signInAs(h.api, creds);
    await h.api.call("POST", AUTH_PATHS.logout, { cookies: phone.cookies });

    await h.api.call("POST", AUTH_PATHS.logoutAll, { cookies: tablet.cookies });
    const phoneRow = await sessionById(phone.sid);

    expect(phoneRow?.revokeReason).toBe("logout");
  });

  test("BR-REC-35 signing in again after Sign out all devices works", async () => {
    const tablet = await signInAs(h.api, creds);
    await h.api.call("POST", AUTH_PATHS.logoutAll, { cookies: tablet.cookies });

    const again = await signInAs(h.api, creds);

    expect(again.sid).not.toBe(tablet.sid);
  });
});
