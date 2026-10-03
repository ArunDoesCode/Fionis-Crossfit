// BR-REC-30 (the two sign-in cookies) and the cookie side of BR-REC-31.
// Spec: docs/specs/member-records/auth.md; wire details: .pipeline/member-records-auth/contract.md.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { jwtVerify } from "jose";

import { db } from "../../../src/db/client";
import { authSessions } from "../../../src/db/schemas";
import {
  ACCESS_SECRET,
  type Fixture,
  hmacCandidates,
  installTestLogin,
  loginStep,
  REFRESH_SECRET,
  type Reply,
  refreshSession,
  runProbe,
  type SignedIn,
  sessionRow,
  signIn,
  TEST_USERNAME,
} from "./helpers";

setDefaultTimeout(120_000);

const COOKIE_NAMES = ["access_token", "refresh_token"] as const;
const ACCESS_TTL_SECONDS = 900; // 15 minutes
const SEVEN_DAYS_SECONDS = 604_800;

let fixture: Fixture | undefined;
let ticked: SignedIn; // "Keep me signed in" ticked
let unticked: SignedIn; // not ticked

beforeAll(async () => {
  fixture = await installTestLogin();
  ticked = await signIn({ remember: true });
  unticked = await signIn({ remember: false });
});

afterAll(async () => {
  await fixture?.restore();
});

/** Every cookie of every sign-in made above, with a label for failure messages. */
function allSignInCookies() {
  return [ticked, unticked].flatMap((device) =>
    COOKIE_NAMES.map((name) => ({
      label: `${name} (remember=${device.remember})`,
      cookie: device.reply.setCookies.find((c) => c.name === name),
    })),
  );
}

describe("BR-REC-30 sign-in sets two cookies", () => {
  test("BR-REC-30 sign-in sets exactly access_token and refresh_token", () => {
    expect(ticked.reply.setCookies.map((c) => c.name).sort()).toEqual([
      "access_token",
      "refresh_token",
    ]);
  });

  test("BR-REC-30 both cookies are HttpOnly (page script cannot read them)", () => {
    for (const { label, cookie } of allSignInCookies()) {
      expect(cookie?.attrs.has("httponly"), label).toBe(true);
    }
  });

  test("BR-REC-30 both cookies are SameSite=Lax", () => {
    for (const { label, cookie } of allSignInCookies()) {
      expect(cookie?.attrs.get("samesite")?.toLowerCase(), label).toBe("lax");
    }
  });

  test("BR-REC-30 both cookies have Path=/", () => {
    for (const { label, cookie } of allSignInCookies()) {
      expect(cookie?.attrs.get("path"), label).toBe("/");
    }
  });

  test("BR-REC-30 both cookies are Secure when NODE_ENV=production", async () => {
    const [login] = await runProbe([loginStep()], { NODE_ENV: "production" });
    expect(login?.status).toBe(200);
    for (const name of COOKIE_NAMES) {
      const raw = login?.setCookie.find((c) => c.startsWith(`${name}=`));
      expect(raw, `${name} set`).toBeDefined();
      expect(raw ?? "", name).toMatch(/;\s*Secure\b/i);
    }
  });

  test("BR-REC-30 the sign-in answer carries no token in its body", () => {
    const text = JSON.stringify(ticked.reply.body);
    expect(text).not.toContain(ticked.accessToken);
    expect(text).not.toContain(ticked.refreshToken);
  });
});

describe("BR-REC-30 access_token is a 15-minute HS256 JWT", () => {
  test("BR-REC-30 access_token is HS256 and verifies with ACCESS_TOKEN_SECRET", async () => {
    const { protectedHeader } = await jwtVerify(
      ticked.accessToken,
      new TextEncoder().encode(ACCESS_SECRET),
      { algorithms: ["HS256"] },
    );
    expect(protectedHeader.alg).toBe("HS256");
  });

  test("BR-REC-30 access_token claims userId, userName, permissions [], sid, iss, aud", async () => {
    const { payload } = await jwtVerify(
      ticked.accessToken,
      new TextEncoder().encode(ACCESS_SECRET),
      { algorithms: ["HS256"] },
    );
    expect(payload.userId).toBe(fixture?.accountId);
    expect(payload.userName).toBe(TEST_USERNAME);
    expect(payload.permissions).toEqual([]);
    expect(typeof payload.sid).toBe("string");
    expect(typeof payload.iss).toBe("string");
    expect(payload.iss).not.toBe("");
    expect(payload.aud).toBeDefined();
  });

  test("BR-REC-30 the sid claim is the id of this device's auth_sessions row", async () => {
    const row = await sessionRow(ticked.sid);
    expect(row?.accountId).toBe(fixture?.accountId);
  });

  test("BR-REC-30 access_token expires 15 minutes after sign-in", async () => {
    const { payload } = await jwtVerify(
      ticked.accessToken,
      new TextEncoder().encode(ACCESS_SECRET),
      { algorithms: ["HS256"] },
    );
    const secondsLeft = (payload.exp ?? 0) - Date.now() / 1000;
    expect(secondsLeft).toBeGreaterThan(ACCESS_TTL_SECONDS - 60);
    expect(secondsLeft).toBeLessThanOrEqual(ACCESS_TTL_SECONDS + 5);
  });

  test("BR-REC-30 access_token cookie lives 15 minutes, whether or not Keep me signed in is ticked", () => {
    for (const device of [ticked, unticked]) {
      const cookie = device.reply.setCookies.find(
        (c) => c.name === "access_token",
      );
      expect(cookie?.attrs.get("max-age"), `remember=${device.remember}`).toBe(
        String(ACCESS_TTL_SECONDS),
      );
    }
  });
});

describe("BR-REC-30 refresh_token is random and stored only as an HMAC", () => {
  test("BR-REC-30 refresh_token is 32 random bytes in base64url", () => {
    for (const device of [ticked, unticked]) {
      expect(device.refreshToken).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
      expect(Buffer.from(device.refreshToken, "base64url").length).toBe(32);
    }
    expect(ticked.refreshToken).not.toBe(unticked.refreshToken);
  });

  test("BR-REC-30 the database holds no raw token", async () => {
    const rows = await db.select().from(authSessions);
    const dump = JSON.stringify(rows);
    for (const device of [ticked, unticked]) {
      expect(dump).not.toContain(device.refreshToken);
      expect(dump).not.toContain(device.accessToken);
    }
  });

  test("BR-REC-30 the database keeps HMAC-SHA256(REFRESH_TOKEN_SECRET, token) of the refresh token", async () => {
    const row = await sessionRow(ticked.sid);
    expect(hmacCandidates(ticked.refreshToken, REFRESH_SECRET)).toContain(
      row?.tokenHash ?? "",
    );
  });
});

describe("BR-REC-31 refresh_token cookie lifetime", () => {
  test("BR-REC-31 ticked: refresh_token cookie lasts 7 days", () => {
    const cookie = ticked.reply.setCookies.find(
      (c) => c.name === "refresh_token",
    );
    expect(cookie?.attrs.get("max-age")).toBe(String(SEVEN_DAYS_SECONDS));
  });

  test("BR-REC-31 not ticked: refresh_token is a browser-session cookie (no Max-Age, no Expires)", () => {
    const cookie = unticked.reply.setCookies.find(
      (c) => c.name === "refresh_token",
    );
    expect(cookie).toBeDefined();
    expect(cookie?.attrs.has("max-age")).toBe(false);
    expect(cookie?.attrs.has("expires")).toBe(false);
  });
});

describe("BR-REC-30 a refresh sets both cookies again", () => {
  let refreshed: Reply;

  beforeAll(async () => {
    const device = await signIn({ remember: true });
    refreshed = await refreshSession(device.refreshToken);
  });

  test("BR-REC-30 refresh answers 200 and sets exactly access_token and refresh_token", () => {
    expect(refreshed.status).toBe(200);
    expect(refreshed.setCookies.map((c) => c.name).sort()).toEqual([
      "access_token",
      "refresh_token",
    ]);
  });

  test("BR-REC-30 refreshed cookies are HttpOnly, SameSite=Lax, Path=/", () => {
    for (const cookie of refreshed.setCookies) {
      expect(cookie.attrs.has("httponly"), cookie.name).toBe(true);
      expect(cookie.attrs.get("samesite")?.toLowerCase(), cookie.name).toBe(
        "lax",
      );
      expect(cookie.attrs.get("path"), cookie.name).toBe("/");
    }
  });

  test("BR-REC-31 ticked: the refresh cookie lifetime of 7 days is renewed on each refresh", () => {
    const cookie = refreshed.setCookies.find((c) => c.name === "refresh_token");
    expect(cookie?.attrs.get("max-age")).toBe(String(SEVEN_DAYS_SECONDS));
  });

  test("BR-REC-30 the refreshed access_token lives 15 minutes", () => {
    const cookie = refreshed.setCookies.find((c) => c.name === "access_token");
    expect(cookie?.attrs.get("max-age")).toBe(String(ACCESS_TTL_SECONDS));
  });
});
