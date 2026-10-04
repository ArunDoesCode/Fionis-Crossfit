// BR-REC-33 — access tokens are checked by signature only (no database read), so a signed-out
// device loses access within 15 minutes at most; BR-REC-30 (HS256 pinned); BR-REC-44 — rotating the
// access secret is seamless (devices refresh), rotating the refresh secret signs every device out.
// Spec and contract: docs/specs/member-records/auth.md.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";

import { signAccessToken } from "../../../src/lib/token";
import {
  adopt,
  call,
  deviceCookies,
  type Fixture,
  installTestLogin,
  loginStep,
  me,
  type Reply,
  refreshSession,
  resignAccessToken,
  runProbe,
  type SignedIn,
  signIn,
  TEST_USERNAME,
  unsignedAccessToken,
} from "./helpers";

setDefaultTimeout(120_000);

// Long enough for the env check (32+ characters), different from the real secrets.
const ROTATED_SECRET = "TEST-rotated-secret-0123456789-abcdefghijklmnop";

let fixture: Fixture | undefined;

beforeAll(async () => {
  fixture = await installTestLogin();
});

afterAll(async () => {
  await fixture?.restore();
});

describe("BR-REC-33 after Sign out all devices a copied access token works until it expires", () => {
  let device: SignedIn;
  let signOutAll: Reply;

  beforeAll(async () => {
    device = await signIn();
    signOutAll = await call("/api/auth/logout-all", {
      method: "POST",
      cookies: deviceCookies(device),
    });
  });

  test("BR-REC-33 Sign out all devices succeeds and ends this sign-in", () => {
    expect(signOutAll.status).toBe(200);
  });

  test("BR-REC-33 a copied access token is still accepted by /api/auth/me", async () => {
    const reply = await me(device.accessToken);
    expect(reply.status).toBe(200);
    expect(reply.body?.data?.username).toBe(TEST_USERNAME);
  });

  test("BR-REC-33 a copied access token still passes authentication on another endpoint (not 401)", async () => {
    const reply = await call("/api/settings", {
      cookies: { access_token: device.accessToken },
    });
    expect(reply.status).not.toBe(401);
  });

  test("BR-REC-33 the refresh token of the signed-out device fails at once with 401 SESSION_EXPIRED", async () => {
    const reply = await refreshSession(device.refreshToken);
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("SESSION_EXPIRED");
  });
});

describe("BR-REC-33 the access token is checked by signature only", () => {
  test("BR-REC-33 a validly signed token whose session is not in the database still authenticates (no database read)", async () => {
    const token = await signAccessToken({
      userId: crypto.randomUUID(),
      userName: TEST_USERNAME,
      permissions: [],
      sid: crypto.randomUUID(),
    });
    const reply = await call("/api/settings", {
      cookies: { access_token: token },
    });
    expect(reply.status).not.toBe(401);
  });

  test("BR-REC-33 the same token is also accepted as a Bearer header", async () => {
    const token = await signAccessToken({
      userId: crypto.randomUUID(),
      userName: TEST_USERNAME,
      permissions: [],
      sid: crypto.randomUUID(),
    });
    const reply = await call("/api/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reply.status).not.toBe(401);
  });

  test("BR-REC-33 a request with no access token is 401 UNAUTHORIZED", async () => {
    const reply = await call("/api/settings");
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("UNAUTHORIZED");
  });
});

describe("BR-REC-33 / BR-REC-30 a token that fails the signature check is refused", () => {
  let device: SignedIn;

  beforeAll(async () => {
    device = await signIn();
  });

  test("BR-REC-33 an expired access token is 401 UNAUTHORIZED", async () => {
    const expired = await resignAccessToken(device.accessToken, {
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });
    const reply = await me(expired);
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("UNAUTHORIZED");
  });

  test("BR-REC-33 the unchanged token is accepted (control for the refusals around it)", async () => {
    const reply = await me(device.accessToken);
    expect(reply.status).toBe(200);
  });

  test("BR-REC-33 a token signed with another secret is 401 UNAUTHORIZED", async () => {
    const forged = await resignAccessToken(device.accessToken, {
      secret: ROTATED_SECRET,
    });
    const reply = await me(forged);
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("UNAUTHORIZED");
  });

  for (const alg of ["HS384", "HS512"] as const) {
    test(`BR-REC-30 HS256 is pinned: a token signed with ${alg} and the right secret is 401`, async () => {
      const other = await resignAccessToken(device.accessToken, { alg });
      const reply = await me(other);
      expect(reply.status).toBe(401);
    });
  }

  test("BR-REC-30 HS256 is pinned: a token with alg none and no signature is 401", async () => {
    const reply = await me(unsignedAccessToken(device.accessToken));
    expect(reply.status).toBe(401);
  });

  test("BR-REC-33 a token with a changed payload and the old signature is 401", async () => {
    const [header, payload, signature] = device.accessToken.split(".");
    const claims = JSON.parse(
      Buffer.from(String(payload), "base64url").toString(),
    ) as Record<string, unknown>;
    claims.sid = crypto.randomUUID();
    const tampered = [
      header,
      Buffer.from(JSON.stringify(claims)).toString("base64url"),
      signature,
    ].join(".");
    const reply = await me(tampered);
    expect(reply.status).toBe(401);
  });
});

describe("BR-REC-44 changing the access secret is seamless", () => {
  test("BR-REC-44 a token signed with the previous access secret is 401, then a refresh gives a working token", async () => {
    const device = await signIn();
    const old = await resignAccessToken(device.accessToken, {
      secret: ROTATED_SECRET,
    });

    const refused = await me(old);
    const refreshed = await refreshSession(device.refreshToken);
    adopt(device, refreshed);
    const works = await me(device.accessToken);

    expect(refused.status).toBe(401);
    expect(refreshed.status).toBe(200);
    expect(works.status).toBe(200);
  });

  test("BR-REC-44 after ACCESS_TOKEN_SECRET is rotated (new server process): old access token 401, refresh succeeds, the new token works", async () => {
    const device = await signIn();

    const results = await runProbe(
      [
        { path: "/api/auth/me", cookies: { access_token: device.accessToken } },
        {
          method: "POST",
          path: "/api/auth/refresh",
          cookies: { refresh_token: device.refreshToken },
        },
        { path: "/api/auth/me", useJar: true },
      ],
      { ACCESS_TOKEN_SECRET: ROTATED_SECRET },
    );

    expect(results[0]?.status).toBe(401);
    expect(results[1]?.status).toBe(200);
    expect(results[2]?.status).toBe(200);
    expect(results[2]?.body?.data?.username).toBe(TEST_USERNAME);
  });
});

describe("BR-REC-44 changing the refresh secret signs every device out", () => {
  test("BR-REC-44 after REFRESH_TOKEN_SECRET is rotated (new server process): every device's refresh is 401 SESSION_EXPIRED", async () => {
    const phone = await signIn();
    const tablet = await signIn();

    const results = await runProbe(
      [
        {
          method: "POST",
          path: "/api/auth/refresh",
          cookies: { refresh_token: phone.refreshToken },
        },
        {
          method: "POST",
          path: "/api/auth/refresh",
          cookies: { refresh_token: tablet.refreshToken },
        },
      ],
      { REFRESH_TOKEN_SECRET: ROTATED_SECRET },
    );

    for (const result of results) {
      expect(result.status).toBe(401);
      expect(result.body?.code).toBe("SESSION_EXPIRED");
    }
  });

  test("BR-REC-44 after REFRESH_TOKEN_SECRET is rotated, signing in again with the password works", async () => {
    const results = await runProbe([loginStep()], {
      REFRESH_TOKEN_SECRET: ROTATED_SECRET,
    });
    expect(results[0]?.status).toBe(200);
  });
});
