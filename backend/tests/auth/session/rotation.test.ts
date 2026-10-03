// BR-REC-32 — every refresh replaces the refresh token; the replaced one still works
// for 60 seconds (two tabs at once); using it later ends that device's sign-in (reason `reuse`).
// "Time passes" by moving `auth_sessions.rotated_at` back, which is when the replacement happened.
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
  call,
  type Fixture,
  freshIp,
  installTestLogin,
  me,
  patchSession,
  type Reply,
  refreshSession,
  SECOND,
  type SignedIn,
  sessionRow,
  sessionRowsOf,
  signIn,
} from "./helpers";

setDefaultTimeout(120_000);

let fixture: Fixture | undefined;

beforeAll(async () => {
  fixture = await installTestLogin();
});

afterAll(async () => {
  await fixture?.restore();
});

describe("BR-REC-32 each refresh replaces the refresh token", () => {
  let device: SignedIn;
  let oldRefreshToken: string;
  let oldTokenHash: string | undefined;
  let rowsBefore: number;
  let first: Reply;

  beforeAll(async () => {
    device = await signIn();
    oldRefreshToken = device.refreshToken;
    oldTokenHash = (await sessionRow(device.sid))?.tokenHash;
    rowsBefore = (await sessionRowsOf(fixture?.accountId ?? "")).length;
    first = await refreshSession(oldRefreshToken);
  });

  test("BR-REC-32 a refresh answers 200 and sets a different refresh_token", () => {
    expect(first.status).toBe(200);
    const next = first.setCookies.find((c) => c.name === "refresh_token");
    expect(next?.value).toBeTruthy();
    expect(next?.value).not.toBe(oldRefreshToken);
  });

  test("BR-REC-32 the stored token hash is replaced and the old one is kept as the previous token", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.tokenHash).not.toBe(oldTokenHash);
    expect(row?.prevTokenHash).toBe(oldTokenHash ?? null);
  });

  test("BR-REC-32 a refresh keeps the same sign-in: same sid and no new session row", async () => {
    const access = first.setCookies.find((c) => c.name === "access_token");
    const claims = JSON.parse(
      Buffer.from(String(access?.value.split(".")[1]), "base64url").toString(),
    ) as { sid?: string };
    expect(claims.sid).toBe(device.sid);
    expect((await sessionRowsOf(fixture?.accountId ?? "")).length).toBe(
      rowsBefore,
    );
  });

  test("BR-REC-32 the new access_token is accepted", async () => {
    const access = first.setCookies.find((c) => c.name === "access_token");
    const reply = await me(access?.value ?? "");
    expect(reply.status).toBe(200);
  });

  test("BR-REC-32 the new refresh token works for the next refresh", async () => {
    adopt(device, first);
    const second = await refreshSession(device.refreshToken);
    expect(second.status).toBe(200);
  });
});

describe("BR-REC-32 the replaced token still works within 60 seconds", () => {
  for (const secondsSinceReplacement of [30, 55]) {
    test(`BR-REC-32 the replaced token works ${secondsSinceReplacement} s after its replacement`, async () => {
      const device = await signIn();
      const replaced = device.refreshToken;
      adopt(device, await refreshSession(replaced));
      await patchSession(device.sid, {
        rotatedAt: ago(secondsSinceReplacement * SECOND),
      });

      const again = await refreshSession(replaced);

      expect(again.status).toBe(200);
      expect((await sessionRow(device.sid))?.revokedAt).toBeNull();
    });
  }

  test("BR-REC-32 two tabs refreshing with the same token at the same time both succeed", async () => {
    const device = await signIn();
    const [tabA, tabB] = await Promise.all([
      call("/api/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: device.refreshToken },
        ip: freshIp(),
      }),
      call("/api/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: device.refreshToken },
        ip: freshIp(),
      }),
    ]);

    expect(tabA.status).toBe(200);
    expect(tabB.status).toBe(200);
    expect((await sessionRow(device.sid))?.revokedAt).toBeNull();
  });
});

describe("BR-REC-32 a replaced token used after its 60 seconds is a stolen-token signal", () => {
  for (const secondsSinceReplacement of [65, 120]) {
    describe(`used ${secondsSinceReplacement} s after its replacement`, () => {
      let device: SignedIn;
      let late: Reply;

      beforeAll(async () => {
        device = await signIn();
        const replaced = device.refreshToken;
        adopt(device, await refreshSession(replaced));
        await patchSession(device.sid, {
          rotatedAt: ago(secondsSinceReplacement * SECOND),
        });
        late = await refreshSession(replaced);
      });

      test(`BR-REC-32 a token replaced ${secondsSinceReplacement} s ago is refused with 401 SESSION_EXPIRED`, () => {
        expect(late.status).toBe(401);
        expect(late.body?.code).toBe("SESSION_EXPIRED");
      });

      test(`BR-REC-32 a token replaced ${secondsSinceReplacement} s ago ends the sign-in with reason reuse`, async () => {
        const row = await sessionRow(device.sid);
        expect(row?.revokedAt).not.toBeNull();
        expect(row?.revokeReason).toBe("reuse");
      });

      test(`BR-REC-32 after reuse (${secondsSinceReplacement} s) the newest refresh token stops working too`, async () => {
        const newest = await refreshSession(device.refreshToken);
        expect(newest.status).toBe(401);
        expect(newest.body?.code).toBe("SESSION_EXPIRED");
      });
    });
  }

  test("BR-REC-32 reuse ends only that device's sign-in, other devices keep refreshing", async () => {
    const stolenFrom = await signIn();
    const other = await signIn();
    const replaced = stolenFrom.refreshToken;
    adopt(stolenFrom, await refreshSession(replaced));
    await patchSession(stolenFrom.sid, { rotatedAt: ago(120 * SECOND) });

    const reuse = await refreshSession(replaced);
    const otherRefresh = await refreshSession(other.refreshToken);

    expect(reuse.status).toBe(401);
    expect(otherRefresh.status).toBe(200);
    expect((await sessionRow(other.sid))?.revokedAt).toBeNull();
  });
});

describe("BR-REC-32 refresh needs a known, current sign-in", () => {
  test("BR-REC-32 refresh without a refresh_token cookie is 401 SESSION_EXPIRED", async () => {
    const reply = await call("/api/auth/refresh", {
      method: "POST",
      ip: freshIp(),
    });
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("SESSION_EXPIRED");
  });

  test("BR-REC-32 refresh with an unknown token is 401 SESSION_EXPIRED", async () => {
    const unknown = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url");
    const reply = await refreshSession(unknown);
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("SESSION_EXPIRED");
  });
});
