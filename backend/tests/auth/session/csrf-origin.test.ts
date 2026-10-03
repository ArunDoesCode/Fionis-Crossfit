// BR-REC-37 — a write request (POST, PUT, PATCH, DELETE) whose `Origin` header is not the app's
// address is refused 403 CSRF_ORIGIN; GET requests never change data and are never refused for it.
// Order of checks (contract): Origin first, then auth, validation, rate limit, handler.
// Spec: docs/specs/member-records/auth.md; contract: .pipeline/member-records-auth/contract.md.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../../../src/db/client";
import { appAccount } from "../../../src/db/schemas";
import { signAccessToken } from "../../../src/lib/token";
import {
  APP_ORIGIN,
  call,
  deviceCookies,
  type Fixture,
  freshIp,
  installTestLogin,
  refreshSession,
  type SignedIn,
  sessionRow,
  sessionRowsOf,
  signIn,
  signInRequest,
  TEST_PASSWORD,
  TEST_USERNAME,
} from "./helpers";

setDefaultTimeout(120_000);

const FOREIGN_ORIGIN = "https://evil.example";
const SOME_UUID = "6f1d3c9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f";

/** One write of each method on routes that exist in the contract. */
const WRITES = [
  { method: "POST", path: "/api/members" },
  { method: "PUT", path: "/api/assessment-types/order" },
  { method: "PATCH", path: "/api/settings" },
  { method: "DELETE", path: `/api/assessments/${SOME_UUID}` },
] as const;

/** Addresses a lazy check could mistake for the app's own. */
const LOOKALIKE_ORIGINS = [
  FOREIGN_ORIGIN,
  `${APP_ORIGIN}.evil.example`,
  `${APP_ORIGIN}9`,
  APP_ORIGIN.startsWith("https://")
    ? APP_ORIGIN.replace("https://", "http://")
    : APP_ORIGIN.replace("http://", "https://"),
  "null",
];

let fixture: Fixture | undefined;
let validToken: string;

beforeAll(async () => {
  fixture = await installTestLogin();
  validToken = await signAccessToken({
    userId: crypto.randomUUID(),
    userName: TEST_USERNAME,
    permissions: [],
    sid: crypto.randomUUID(),
  });
});

afterAll(async () => {
  await fixture?.restore();
});

function write(
  target: (typeof WRITES)[number],
  origin: string | null,
  token: string | null = validToken,
) {
  return call(target.path, {
    method: target.method,
    body: {},
    origin,
    ...(token ? { cookies: { access_token: token } } : {}),
  });
}

describe("BR-REC-37 a write from another site is refused", () => {
  for (const target of WRITES) {
    test(`BR-REC-37 ${target.method} ${target.path} with a foreign Origin is 403 CSRF_ORIGIN`, async () => {
      const reply = await write(target, FOREIGN_ORIGIN);
      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({
        success: false,
        code: "CSRF_ORIGIN",
      });
      expect(typeof reply.body?.message).toBe("string");
    });

    test(`BR-REC-37 ${target.method} ${target.path} with no Origin header is 403 CSRF_ORIGIN`, async () => {
      const reply = await write(target, null);
      expect(reply.status).toBe(403);
      expect(reply.body?.code).toBe("CSRF_ORIGIN");
    });

    test(`BR-REC-37 ${target.method} ${target.path} with the app's own Origin is not refused as CSRF`, async () => {
      const reply = await write(target, APP_ORIGIN);
      expect(reply.body?.code).not.toBe("CSRF_ORIGIN");
      expect(reply.status).not.toBe(403);
    });
  }

  test("BR-REC-37 a form on another site posting to /api/members with no sign-in is refused 403, not 401 (Origin is checked first)", async () => {
    const reply = await write(WRITES[0], FOREIGN_ORIGIN, null);
    expect(reply.status).toBe(403);
    expect(reply.body?.code).toBe("CSRF_ORIGIN");
  });

  for (const origin of LOOKALIKE_ORIGINS) {
    test(`BR-REC-37 only the exact app address passes: Origin "${origin}" is refused`, async () => {
      const reply = await write(WRITES[0], origin);
      expect(reply.status).toBe(403);
      expect(reply.body?.code).toBe("CSRF_ORIGIN");
    });
  }
});

describe("BR-REC-37 reads are never refused for their Origin", () => {
  test("BR-REC-37 GET with a foreign Origin is not refused as CSRF", async () => {
    const reply = await call("/api/settings", {
      origin: FOREIGN_ORIGIN,
      cookies: { access_token: validToken },
    });
    expect(reply.body?.code).not.toBe("CSRF_ORIGIN");
    expect(reply.status).not.toBe(403);
  });

  test("BR-REC-37 GET with no Origin header works (health check)", async () => {
    const reply = await call("/api/health", { origin: null });
    expect(reply.status).toBe(200);
  });
});

describe("BR-REC-37 sign-in endpoints are checked too", () => {
  const signInFrom = (origin: string | null) =>
    call("/api/auth/login", {
      method: "POST",
      body: {
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        remember: true,
      },
      origin,
      ip: freshIp(),
    });

  test("BR-REC-37 a sign-in with the right password but a foreign Origin is 403 CSRF_ORIGIN and sets no cookie", async () => {
    const reply = await signInFrom(FOREIGN_ORIGIN);
    expect(reply.status).toBe(403);
    expect(reply.body?.code).toBe("CSRF_ORIGIN");
    expect(reply.setCookies).toEqual([]);
  });

  test("BR-REC-37 a refused cross-site sign-in creates no session", async () => {
    const before = (await sessionRowsOf(fixture?.accountId ?? "")).length;
    await signInFrom(FOREIGN_ORIGIN);
    expect((await sessionRowsOf(fixture?.accountId ?? "")).length).toBe(before);
  });

  test("BR-REC-37 a sign-in with no Origin header is 403 CSRF_ORIGIN", async () => {
    const reply = await signInFrom(null);
    expect(reply.status).toBe(403);
    expect(reply.body?.code).toBe("CSRF_ORIGIN");
  });

  test("BR-REC-37 a sign-in from the app's own address is accepted", async () => {
    const reply = await signInRequest();
    expect(reply.status).toBe(200);
  });
});

describe("BR-REC-37 a refused cross-site write changes nothing", () => {
  let device: SignedIn;

  beforeAll(async () => {
    device = await signIn();
  });

  test("BR-REC-37 a cross-site Sign out all devices leaves the sign-in active", async () => {
    const reply = await call("/api/auth/logout-all", {
      method: "POST",
      cookies: deviceCookies(device),
      origin: FOREIGN_ORIGIN,
    });
    expect(reply.status).toBe(403);
    expect(reply.body?.code).toBe("CSRF_ORIGIN");
    expect((await sessionRow(device.sid))?.revokedAt).toBeNull();
  });

  test("BR-REC-37 a cross-site Sign out leaves the sign-in active", async () => {
    const reply = await call("/api/auth/logout", {
      method: "POST",
      cookies: deviceCookies(device),
      origin: FOREIGN_ORIGIN,
    });
    expect(reply.status).toBe(403);
    expect(reply.body?.code).toBe("CSRF_ORIGIN");
    expect((await sessionRow(device.sid))?.revokedAt).toBeNull();
  });

  test("BR-REC-37 a cross-site password change is refused and the password stays", async () => {
    const [before] = await db.select().from(appAccount);
    const reply = await call("/api/auth/password", {
      method: "POST",
      cookies: deviceCookies(device),
      body: {
        currentPassword: TEST_PASSWORD,
        newPassword: "TEST_attacker_chosen_pw",
      },
      origin: FOREIGN_ORIGIN,
    });
    const [after] = await db
      .select()
      .from(appAccount)
      .where(eq(appAccount.id, before?.id ?? ""));
    expect(reply.status).toBe(403);
    expect(reply.body?.code).toBe("CSRF_ORIGIN");
    expect(after?.passwordHash).toBe(before?.passwordHash ?? "");
  });

  test("BR-REC-37 a cross-site refresh is refused and does not use up the refresh token", async () => {
    const before = await sessionRow(device.sid);
    const reply = await call("/api/auth/refresh", {
      method: "POST",
      cookies: { refresh_token: device.refreshToken },
      origin: FOREIGN_ORIGIN,
      ip: freshIp(),
    });
    const after = await sessionRow(device.sid);
    expect(reply.status).toBe(403);
    expect(reply.body?.code).toBe("CSRF_ORIGIN");
    expect(after?.tokenHash).toBe(before?.tokenHash ?? "");
    // and the token still works from the app's own address
    expect((await refreshSession(device.refreshToken)).status).toBe(200);
  });
});
