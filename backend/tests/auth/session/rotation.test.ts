// BR-REC-32 — every refresh replaces the refresh token; the replaced one still works
// for 60 seconds (two tabs at once); using it later ends that device's sign-in (reason `reuse`).
// "Time passes" by moving `auth_sessions.rotated_at` back, which is when the replacement happened.
// Spec and contract: docs/specs/member-records/auth.md.
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

// ---------------------------------------------------------------------------
// Spec v2 (clarified during build, review R-1): "a replaced token inside the grace gets an
// access token only, no second rotation". The device already holds the newest refresh token
// from the first refresh; handing out another one would drop it and could sign the device out
// with a false `reuse` (two tabs, cookies applied in either order).
// ---------------------------------------------------------------------------

type SessionRow = Awaited<ReturnType<typeof sessionRow>>;

const refreshCookieOf = (reply: Reply) =>
  reply.setCookies.find((c) => c.name === "refresh_token");

describe("BR-REC-32 v2 a replaced token inside the 60 seconds gets an access token only", () => {
  let device: SignedIn;
  let replaced: string;
  let rowBefore: SessionRow;
  let inGrace: Reply;

  beforeAll(async () => {
    device = await signIn();
    replaced = device.refreshToken;
    adopt(device, await refreshSession(replaced));
    await patchSession(device.sid, { rotatedAt: ago(30 * SECOND) });
    rowBefore = await sessionRow(device.sid);
    inGrace = await refreshSession(replaced);
  });

  test("BR-REC-32 v2 the replaced token used 30 s after its replacement is answered 200", () => {
    expect(inGrace.status).toBe(200);
  });

  test("BR-REC-32 v2 the in-grace answer carries a new access_token for the same sign-in", async () => {
    const access = inGrace.setCookies.find((c) => c.name === "access_token");
    expect(access?.value).toBeTruthy();
    const claims = JSON.parse(
      Buffer.from(String(access?.value.split(".")[1]), "base64url").toString(),
    ) as { sid?: string };
    expect(claims.sid).toBe(device.sid);
    expect((await me(access?.value ?? "")).status).toBe(200);
  });

  test("BR-REC-32 v2 the in-grace answer sets no refresh_token cookie (the sign-in is not replaced again)", () => {
    expect(refreshCookieOf(inGrace)).toBeUndefined();
  });

  test("BR-REC-32 v2 the stored refresh token is not replaced again by the in-grace use", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.tokenHash).toBe(rowBefore?.tokenHash as string);
    expect(row?.prevTokenHash).toBe(rowBefore?.prevTokenHash ?? null);
  });

  test("BR-REC-32 v2 the in-grace use does not restart the 60 seconds (rotated_at is unchanged)", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.rotatedAt?.getTime()).toBe(rowBefore?.rotatedAt?.getTime());
  });

  test("BR-REC-32 v2 the in-grace use keeps the sign-in alive", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.revokedAt).toBeNull();
    expect(row?.revokeReason).toBeNull();
  });
});

describe("BR-REC-32 v2 the device's newest refresh token survives an in-grace use of the replaced one", () => {
  let device: SignedIn;
  let newest: string;
  let later: Reply;

  beforeAll(async () => {
    device = await signIn();
    const replaced = device.refreshToken;
    adopt(device, await refreshSession(replaced));
    newest = device.refreshToken;
    await patchSession(device.sid, { rotatedAt: ago(20 * SECOND) });
    // The other tab still holds the replaced token and refreshes inside the 60 seconds.
    const inGrace = await refreshSession(replaced);
    expect(inGrace.status).toBe(200);
    // More than 60 seconds after the first replacement, this tab refreshes with its token.
    await patchSession(device.sid, { rotatedAt: ago(120 * SECOND) });
    later = await refreshSession(newest);
  });

  test("BR-REC-32 v2 the newest token still refreshes after the grace ended (no false reuse)", () => {
    expect(later.status).toBe(200);
  });

  test("BR-REC-32 v2 the sign-in is not revoked after that refresh", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.revokedAt).toBeNull();
    expect(row?.revokeReason).toBeNull();
  });

  test("BR-REC-32 v2 that refresh is a normal rotation: a different refresh_token is set", () => {
    const next = refreshCookieOf(later);
    expect(next?.value).toBeTruthy();
    expect(next?.value).not.toBe(newest);
  });
});

describe("BR-REC-32 v2 an in-grace use does not stretch the 60 seconds", () => {
  let device: SignedIn;
  let replaced: string;
  let late: Reply;

  beforeAll(async () => {
    device = await signIn();
    replaced = device.refreshToken;
    adopt(device, await refreshSession(replaced));
    await patchSession(device.sid, { rotatedAt: ago(30 * SECOND) });
    const inGrace = await refreshSession(replaced);
    expect(inGrace.status).toBe(200);
    // 65 seconds after the replacement (35 s after the in-grace use).
    await patchSession(device.sid, { rotatedAt: ago(65 * SECOND) });
    late = await refreshSession(replaced);
  });

  test("BR-REC-32 v2 the replaced token used 65 s after its replacement is 401 SESSION_EXPIRED", () => {
    expect(late.status).toBe(401);
    expect(late.body?.code).toBe("SESSION_EXPIRED");
  });

  test("BR-REC-32 v2 that late use ends the sign-in with reason reuse", async () => {
    const row = await sessionRow(device.sid);
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.revokeReason).toBe("reuse");
  });
});

describe("BR-REC-32 v2 two tabs refreshing with the same token at once: the sign-in is replaced only once", () => {
  let device: SignedIn;
  let replaced: string;
  let replies: Reply[];
  let issued: string[];

  beforeAll(async () => {
    device = await signIn();
    replaced = device.refreshToken;
    replies = await Promise.all([
      call("/api/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: replaced },
        ip: freshIp(),
      }),
      call("/api/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: replaced },
        ip: freshIp(),
      }),
    ]);
    issued = replies
      .map((reply) => refreshCookieOf(reply)?.value)
      .filter((value): value is string => Boolean(value));
  });

  test("BR-REC-32 v2 both tabs are answered 200 and both get an access_token", () => {
    for (const reply of replies) {
      expect(reply.status).toBe(200);
      expect(reply.setCookies.some((c) => c.name === "access_token")).toBe(
        true,
      );
    }
  });

  test("BR-REC-32 v2 exactly one of the two answers sets a refresh_token (one rotation)", () => {
    expect(issued).toHaveLength(1);
    expect(issued[0]).not.toBe(replaced);
  });

  test("BR-REC-32 v2 the one refresh_token handed out is the device's token whichever cookie the browser applies last", async () => {
    await patchSession(device.sid, { rotatedAt: ago(120 * SECOND) });
    const next = await refreshSession(issued[0] ?? "");
    expect(next.status).toBe(200);
    expect((await sessionRow(device.sid))?.revokedAt).toBeNull();
  });
});
