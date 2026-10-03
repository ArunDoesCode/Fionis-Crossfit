// BR-REC-43 — sign-in events go to the change log (success, wrong password, lock, unlock, sign out,
// sign out all, password change, stolen-token signal) with time, network address and device type,
// never the password. Action names: `auth.login`, `auth.login_failed`, `auth.locked`, `auth.unlock`,
// `auth.logout`, `auth.logout_all`, `auth.password_changed`, `auth.token_reuse`.
// Spec: docs/specs/member-records/auth.md; contract: .pipeline/member-records-auth/contract.md.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";

import {
  adopt,
  ago,
  authAuditSince,
  call,
  currentAuditBaseline,
  deviceCookies,
  type Fixture,
  installTestLogin,
  isNear,
  loginStep,
  patchSession,
  type Reply,
  refreshSession,
  resetLock,
  runBootstrapAdmin,
  runProbe,
  SECOND,
  type SignedIn,
  setAccountPassword,
  signIn,
  signInRequest,
  TEST_PASSWORD,
} from "./helpers";

setDefaultTimeout(180_000);

type AuditRow = Awaited<ReturnType<typeof authAuditSince>>[number];

const CHROME_ON_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const NEW_PASSWORD = "TEST_auth_session_New#2";
const WRONG_SINGLE = "TEST_wrong_pw_marker_single";
const WRONG_CURRENT = "TEST_wrong_current_marker";
const WRONG_LOCK = (n: number) => `TEST_wrong_pw_marker_lock_${n}`;

let fixture: Fixture | undefined;

beforeAll(async () => {
  fixture = await installTestLogin();
});

afterAll(async () => {
  await fixture?.restore();
});

const only = (rows: AuditRow[], action: string) =>
  rows.filter((row) => row.action === action);

describe("BR-REC-43 a successful sign-in is logged", () => {
  let rows: AuditRow[];
  let device: SignedIn;
  let signedInAt: number;

  beforeAll(async () => {
    const base = await currentAuditBaseline();
    signedInAt = Date.now();
    device = await signIn({ headers: { "User-Agent": CHROME_ON_ANDROID } });
    rows = await authAuditSince(base);
  });

  test("BR-REC-43 sign-in writes one auth.login row for the new session", () => {
    const logins = only(rows, "auth.login");
    expect(logins).toHaveLength(1);
    expect(logins[0]?.sessionId).toBe(device.sid);
  });

  test("BR-REC-43 the auth.login row carries the time of the sign-in", () => {
    expect(
      isNear(only(rows, "auth.login")[0]?.at ?? 0, signedInAt, 60_000),
    ).toBe(true);
  });

  test("BR-REC-43 the auth.login row carries the device type (Chrome on Android), at most 60 characters", () => {
    const deviceText = only(rows, "auth.login")[0]?.device ?? "";
    expect(deviceText).toMatch(/chrome/i);
    expect(deviceText).toMatch(/android/i);
    expect(deviceText.length).toBeLessThanOrEqual(60);
  });

  test("BR-REC-43 the auth.login row never holds the password", () => {
    expect(JSON.stringify(rows)).not.toContain(TEST_PASSWORD);
  });
});

describe("BR-REC-43 the network address is logged (from the trusted proxy header)", () => {
  test("BR-REC-43 behind one trusted proxy the auth.login row holds the caller's address, at most 60 characters", async () => {
    const base = await currentAuditBaseline();
    const [login] = await runProbe(
      [
        loginStep({
          headers: {
            "X-Forwarded-For": "198.51.100.23",
            "User-Agent": CHROME_ON_ANDROID,
          },
        }),
      ],
      { TRUST_PROXY_HOPS: "1" },
    );
    expect(login?.status).toBe(200);

    const logins = only(await authAuditSince(base), "auth.login");
    expect(logins).toHaveLength(1);
    expect(logins[0]?.ip ?? "").toContain("198.51.100.23");
    expect((logins[0]?.ip ?? "").length).toBeLessThanOrEqual(60);
  });

  test("BR-REC-43 a very long User-Agent is cut to 60 characters in the log", async () => {
    const base = await currentAuditBaseline();
    await signIn({
      headers: { "User-Agent": `Mozilla/5.0 ${"x".repeat(400)}` },
    });
    const logins = only(await authAuditSince(base), "auth.login");
    expect(logins).toHaveLength(1);
    expect((logins[0]?.device ?? "").length).toBeLessThanOrEqual(60);
  });
});

describe("BR-REC-43 a wrong password is logged without the typed text", () => {
  let rows: AuditRow[];

  beforeAll(async () => {
    const base = await currentAuditBaseline();
    const reply = await signInRequest({ password: WRONG_SINGLE });
    expect(reply.status).toBe(401);
    rows = await authAuditSince(base);
  });

  test("BR-REC-43 a wrong password writes one auth.login_failed row with no session", () => {
    const failed = only(rows, "auth.login_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.sessionId).toBeNull();
  });

  test("BR-REC-43 the auth.login_failed row does not contain the typed password", () => {
    expect(JSON.stringify(rows)).not.toContain(WRONG_SINGLE);
  });

  test("BR-REC-43 a failed try is not logged as a successful sign-in", () => {
    expect(only(rows, "auth.login")).toHaveLength(0);
  });
});

describe("BR-REC-43 a lock and its end are logged", () => {
  let sixth: Reply;
  let whileLocked: AuditRow[];
  let afterUnlock: AuditRow[];
  let unlock: Awaited<ReturnType<typeof runBootstrapAdmin>>;

  beforeAll(async () => {
    await resetLock();
    const base = await currentAuditBaseline();
    for (let n = 1; n <= 5; n++) {
      await signInRequest({ password: WRONG_LOCK(n) });
    }
    // Locked now: even the right password is refused.
    sixth = await signInRequest();
    whileLocked = await authAuditSince(base);

    unlock = await runBootstrapAdmin(["--unlock"]);
    afterUnlock = await authAuditSince(base);
    // Later scenarios need a free login whatever the command did.
    await resetLock();
  }, 150_000);

  test("BR-REC-43 precondition: the 6th try, with the right password, is refused 429 LOGIN_LOCKED", () => {
    expect(sixth.status).toBe(429);
    expect(sixth.body?.code).toBe("LOGIN_LOCKED");
  });

  test("BR-REC-43 the try that starts the lock is logged as auth.locked", () => {
    expect(only(whileLocked, "auth.locked").length).toBeGreaterThanOrEqual(1);
  });

  test("BR-REC-43 a try refused during the lock does not log a second auth.locked", () => {
    expect(only(whileLocked, "auth.locked")).toHaveLength(1);
  });

  test("BR-REC-43 the wrong tries before the lock are logged as auth.login_failed", () => {
    expect(
      only(whileLocked, "auth.login_failed").length,
    ).toBeGreaterThanOrEqual(4);
  });

  test("BR-REC-43 a refused try during the lock is not logged as a sign-in", () => {
    expect(only(whileLocked, "auth.login")).toHaveLength(0);
  });

  test("BR-REC-43 bootstrap-admin --unlock exits 0", () => {
    expect(unlock.exitCode, unlock.stderr).toBe(0);
  });

  test("BR-REC-43 bootstrap-admin --unlock is logged as one auth.unlock row with no session", () => {
    const unlocks = only(afterUnlock, "auth.unlock");
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0]?.sessionId).toBeNull();
  });

  test("BR-REC-43 none of the lock rows contains a typed password", () => {
    const dump = JSON.stringify(afterUnlock);
    for (let n = 1; n <= 5; n++) expect(dump).not.toContain(WRONG_LOCK(n));
    expect(dump).not.toContain(TEST_PASSWORD);
  });
});

describe("BR-REC-43 signing out is logged", () => {
  test("BR-REC-43 Sign out writes one auth.logout row for this session", async () => {
    const device = await signIn();
    const base = await currentAuditBaseline();

    const reply = await call("/api/auth/logout", {
      method: "POST",
      cookies: deviceCookies(device),
    });

    expect(reply.status).toBe(200);
    const rows = only(await authAuditSince(base), "auth.logout");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBe(device.sid);
  });

  test("BR-REC-43 Sign out all devices writes an auth.logout_all row for this session", async () => {
    const device = await signIn();
    const base = await currentAuditBaseline();

    const reply = await call("/api/auth/logout-all", {
      method: "POST",
      cookies: deviceCookies(device),
    });

    expect(reply.status).toBe(200);
    const rows = only(await authAuditSince(base), "auth.logout_all");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.map((row) => row.sessionId)).toContain(device.sid);
  });
});

describe("BR-REC-43 a password change is logged without any password", () => {
  let device: SignedIn;
  let reply: Reply;
  let rows: AuditRow[];

  beforeAll(async () => {
    device = await signIn();
    const base = await currentAuditBaseline();
    reply = await call("/api/auth/password", {
      method: "POST",
      cookies: deviceCookies(device),
      body: { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD },
    });
    rows = await authAuditSince(base);
  });

  afterAll(async () => {
    await setAccountPassword(TEST_PASSWORD);
  });

  test("BR-REC-43 precondition: the password change succeeds", () => {
    expect(reply.status).toBe(200);
  });

  test("BR-REC-43 a password change writes one auth.password_changed row for this session", () => {
    const changed = only(rows, "auth.password_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]?.sessionId).toBe(device.sid);
  });

  test("BR-REC-43 the auth.password_changed row holds neither the old nor the new password", () => {
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(TEST_PASSWORD);
    expect(dump).not.toContain(NEW_PASSWORD);
  });
});

describe("BR-REC-43 a wrong current password in the change-password form is a logged wrong try", () => {
  let reply: Reply;
  let rows: AuditRow[];

  beforeAll(async () => {
    await resetLock();
    const device = await signIn();
    const base = await currentAuditBaseline();
    reply = await call("/api/auth/password", {
      method: "POST",
      cookies: deviceCookies(device),
      body: { currentPassword: WRONG_CURRENT, newPassword: NEW_PASSWORD },
    });
    rows = await authAuditSince(base);
  });

  test("BR-REC-43 precondition: the wrong current password is 400 CURRENT_PASSWORD_WRONG", () => {
    expect(reply.status).toBe(400);
    expect(reply.body?.code).toBe("CURRENT_PASSWORD_WRONG");
  });

  test("BR-REC-43 it writes an auth.login_failed row", () => {
    expect(only(rows, "auth.login_failed")).toHaveLength(1);
  });

  test("BR-REC-43 the row holds neither the typed current password nor the new one", () => {
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(WRONG_CURRENT);
    expect(dump).not.toContain(NEW_PASSWORD);
  });
});

describe("BR-REC-43 the stolen-token signal is logged", () => {
  let device: SignedIn;
  let reuse: Reply;
  let rows: AuditRow[];

  beforeAll(async () => {
    device = await signIn();
    const replaced = device.refreshToken;
    adopt(device, await refreshSession(replaced));
    await patchSession(device.sid, { rotatedAt: ago(120 * SECOND) });
    const base = await currentAuditBaseline();
    reuse = await refreshSession(replaced);
    rows = await authAuditSince(base);
  });

  test("BR-REC-43 precondition: the replaced token used after 2 minutes is 401", () => {
    expect(reuse.status).toBe(401);
  });

  test("BR-REC-43 reuse of a replaced refresh token writes one auth.token_reuse row for that session", () => {
    const signals = only(rows, "auth.token_reuse");
    expect(signals).toHaveLength(1);
    expect(signals[0]?.sessionId).toBe(device.sid);
  });
});

describe("BR-REC-43 the change log never holds a typed password", () => {
  test("BR-REC-43 no auth.* row written by this file contains any password typed in it", async () => {
    const rows = await authAuditSince(fixture?.auditBaseline ?? 0);
    expect(rows.length).toBeGreaterThan(0);
    const dump = JSON.stringify(rows);
    const typed = [
      TEST_PASSWORD,
      NEW_PASSWORD,
      WRONG_SINGLE,
      WRONG_CURRENT,
      ...[1, 2, 3, 4, 5].map(WRONG_LOCK),
    ];
    for (const secret of typed) expect(dump).not.toContain(secret);
  });
});
