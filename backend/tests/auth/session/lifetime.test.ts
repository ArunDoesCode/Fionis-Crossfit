// BR-REC-31 — "Keep me signed in": 7 days since last use (sliding) when ticked,
// 12 hours from sign-in when not. Time is moved by editing the session row
// (`expires_at`, `last_used_at`, `created_at`), consistently, as if it had passed.
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
  DAY,
  expiresAtOf,
  type Fixture,
  fromNow,
  HOUR,
  installTestLogin,
  isNear,
  me,
  patchSession,
  type Reply,
  refreshSession,
  SECOND,
  type SignedIn,
  sessionRow,
  signIn,
  TEST_USERNAME,
} from "./helpers";

setDefaultTimeout(120_000);

const SEVEN_DAYS = 7 * DAY;
const TWELVE_HOURS = 12 * HOUR;

let fixture: Fixture | undefined;

beforeAll(async () => {
  fixture = await installTestLogin();
});

afterAll(async () => {
  await fixture?.restore();
});

describe("BR-REC-31 ticked: signed in until 7 days without use", () => {
  let device: SignedIn;
  let signedInAt: number;

  beforeAll(async () => {
    signedInAt = Date.now();
    device = await signIn({ remember: true });
  });

  test("BR-REC-31 ticked: sign-in lasts 7 days from now", () => {
    expect(isNear(device.expiresAt, signedInAt + SEVEN_DAYS)).toBe(true);
  });

  test("BR-REC-31 ticked: the answer's expiresAt is the auth_sessions.expires_at", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.remember).toBe(true);
    expect(isNear(row?.expiresAt ?? 0, device.expiresAt, 1000)).toBe(true);
  });

  test("BR-REC-31 ticked: E05 reports remember true and the same expiresAt", async () => {
    const reply = await me(device.accessToken);
    expect(reply.status).toBe(200);
    expect(reply.body?.data?.username).toBe(TEST_USERNAME);
    expect(reply.body?.data?.remember).toBe(true);
    expect(isNear(expiresAtOf(reply), device.expiresAt, 1000)).toBe(true);
  });
});

describe("BR-REC-31 ticked: a phone unused for 6 days is still signed in, and every use starts the 7 days again", () => {
  let refreshed: Reply;
  let usedAt: number;
  let sid: string;

  beforeAll(async () => {
    const device = await signIn({ remember: true });
    sid = device.sid;
    // Six days without use: expires_at = last use + 7 days = 1 day from now.
    await patchSession(sid, {
      createdAt: ago(20 * DAY),
      lastUsedAt: ago(6 * DAY),
      expiresAt: fromNow(1 * DAY),
    });
    usedAt = Date.now();
    refreshed = await refreshSession(device.refreshToken);
  });

  test("BR-REC-31 ticked: refresh after 6 unused days still works", () => {
    expect(refreshed.status).toBe(200);
  });

  test("BR-REC-31 ticked: the refresh answer slides expiresAt to 7 days from this use", () => {
    expect(isNear(expiresAtOf(refreshed), usedAt + SEVEN_DAYS)).toBe(true);
  });

  test("BR-REC-31 ticked: the stored expires_at slides to 7 days from this use", async () => {
    const row = await sessionRow(sid);
    expect(isNear(row?.expiresAt ?? 0, usedAt + SEVEN_DAYS)).toBe(true);
  });

  test("BR-REC-31 ticked: the refresh cookie lifetime stays 7 days after the slide", () => {
    const cookie = refreshed.setCookies.find((c) => c.name === "refresh_token");
    expect(cookie?.attrs.get("max-age")).toBe(String(SEVEN_DAYS / 1000));
  });
});

// Review R-14. BR-REC-31: "every use starts the 7 days again". BR-REC-32 (v2): a replaced token
// used inside its 60 seconds gets an access token only — but it is still a use of the sign-in, so
// the 7 days start again from it. The stored expiry is made stale (1 day left, last use 6 days
// ago) while the replacement is still 30 s old, so a slide can only come from the in-grace use.
describe("BR-REC-31 + 32 v2 ticked: a replaced token used inside the 60 seconds also starts the 7 days again", () => {
  let inGrace: Reply;
  let usedAt: number;
  let sid: string;

  beforeAll(async () => {
    const device = await signIn({ remember: true });
    sid = device.sid;
    const replaced = device.refreshToken;
    adopt(device, await refreshSession(replaced));
    await patchSession(sid, {
      createdAt: ago(20 * DAY),
      lastUsedAt: ago(6 * DAY),
      expiresAt: fromNow(1 * DAY),
      rotatedAt: ago(30 * SECOND),
    });
    usedAt = Date.now();
    inGrace = await refreshSession(replaced);
  });

  test("BR-REC-31 + 32 v2 ticked: the stored expires_at slides to 7 days after the in-grace use", async () => {
    expect(inGrace.status).toBe(200);
    const row = await sessionRow(sid);
    expect(isNear(row?.expiresAt ?? 0, usedAt + SEVEN_DAYS)).toBe(true);
  });

  test("BR-REC-31 + 32 v2 ticked: the in-grace answer's expiresAt is 7 days after that use", () => {
    expect(inGrace.status).toBe(200);
    expect(isNear(expiresAtOf(inGrace), usedAt + SEVEN_DAYS)).toBe(true);
  });
});

describe("BR-REC-31 ticked: a phone unused for 8 days is asked to sign in", () => {
  let late: Reply;
  let sid: string;

  beforeAll(async () => {
    const device = await signIn({ remember: true });
    sid = device.sid;
    await patchSession(sid, {
      createdAt: ago(20 * DAY),
      lastUsedAt: ago(8 * DAY),
      expiresAt: ago(1 * DAY),
    });
    late = await refreshSession(device.refreshToken);
  });

  test("BR-REC-31 ticked: refresh after 8 unused days is 401 SESSION_EXPIRED", () => {
    expect(late.status).toBe(401);
    expect(late.body?.code).toBe("SESSION_EXPIRED");
  });
});

describe("BR-REC-31 not ticked: the server ends the sign-in after 12 hours", () => {
  let device: SignedIn;
  let signedInAt: number;

  beforeAll(async () => {
    signedInAt = Date.now();
    device = await signIn({ remember: false });
  });

  test("BR-REC-31 not ticked: sign-in lasts 12 hours from now", () => {
    expect(isNear(device.expiresAt, signedInAt + TWELVE_HOURS)).toBe(true);
  });

  test("BR-REC-31 not ticked: the answer's expiresAt is the auth_sessions.expires_at", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.remember).toBe(false);
    expect(isNear(row?.expiresAt ?? 0, device.expiresAt, 1000)).toBe(true);
  });

  test("BR-REC-31 not ticked: E05 reports remember false and the same expiresAt", async () => {
    const reply = await me(device.accessToken);
    expect(reply.status).toBe(200);
    expect(reply.body?.data?.remember).toBe(false);
    expect(isNear(expiresAtOf(reply), device.expiresAt, 1000)).toBe(true);
  });
});

describe("BR-REC-31 not ticked: a refresh does not extend the 12 hour cap", () => {
  let refreshed: Reply;
  let capAt: Date;
  let sid: string;

  beforeAll(async () => {
    const device = await signIn({ remember: false });
    sid = device.sid;
    // Ten hours have passed since sign-in: the cap is 2 hours away.
    capAt = fromNow(2 * HOUR);
    await patchSession(sid, {
      createdAt: ago(10 * HOUR),
      lastUsedAt: ago(1 * HOUR),
      expiresAt: capAt,
    });
    refreshed = await refreshSession(device.refreshToken);
  });

  test("BR-REC-31 not ticked: refresh before the cap still works", () => {
    expect(refreshed.status).toBe(200);
  });

  test("BR-REC-31 not ticked: the refresh answer keeps expiresAt at the 12 hour cap", () => {
    expect(isNear(expiresAtOf(refreshed), capAt, 5000)).toBe(true);
  });

  test("BR-REC-31 not ticked: the stored expires_at is not moved by a refresh", async () => {
    const row = await sessionRow(sid);
    expect(isNear(row?.expiresAt ?? 0, capAt, 5000)).toBe(true);
  });

  test("BR-REC-31 not ticked: the refreshed refresh_token is still a browser-session cookie", () => {
    const cookie = refreshed.setCookies.find((c) => c.name === "refresh_token");
    expect(cookie).toBeDefined();
    expect(cookie?.attrs.has("max-age")).toBe(false);
    expect(cookie?.attrs.has("expires")).toBe(false);
  });
});

describe("BR-REC-31 not ticked: after 12 hours the sign-in is over", () => {
  let late: Reply;

  beforeAll(async () => {
    const device = await signIn({ remember: false });
    // Thirteen hours since sign-in, used one hour ago: still over the cap.
    await patchSession(device.sid, {
      createdAt: ago(13 * HOUR),
      lastUsedAt: ago(1 * HOUR),
      expiresAt: ago(1 * HOUR),
    });
    late = await refreshSession(device.refreshToken);
  });

  test("BR-REC-31 not ticked: refresh after 12 hours is 401 SESSION_EXPIRED", () => {
    expect(late.status).toBe(401);
    expect(late.body?.code).toBe("SESSION_EXPIRED");
  });
});
