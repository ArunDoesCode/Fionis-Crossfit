import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { db } from "../../src/db/client";
import { gymSettings } from "../../src/db/schemas";
import { forgedToken } from "../helpers/http";
import {
  api,
  auditRows,
  cleanupAudit,
  DEFAULT_SETTINGS,
  dbSettings,
  expectError,
  expectInvalid,
  expectOk,
  newActor,
  PATH,
  resetSettings,
  type SettingsOut,
  settingsOf,
  snapshotSingletons,
} from "./helpers";

// member-records/setup clarification C13 (BR-REC-60, BR-REC-168, BR-REC-158):
// E07 only reads. When the settings row does not exist yet, E07 answers the defaults
// (Fionis CrossFit, Asia/Kolkata, 7, 14) and writes nothing; the first E08 creates the row,
// with its change-log row. Every test starts with NO row in gym_settings; the row (and the
// login-lock row) the database had before the file ran are put back at the end.

let restoreSingletons: () => Promise<void>;

beforeAll(async () => {
  restoreSingletons = await snapshotSingletons();
});
beforeEach(async () => {
  await db.delete(gymSettings);
});
afterAll(async () => {
  await cleanupAudit();
  await restoreSingletons();
});

const etagOf = (headers: Headers) => headers.get("etag") ?? "";

describe("C13 E07 with no settings row yet", () => {
  test("BR-REC-60 / C13 E07 answers the defaults: Fionis CrossFit, Asia/Kolkata, 7 days, 14 days", async () => {
    expect(await dbSettings()).toHaveLength(0);
    const reply = await api.get(PATH.settings);
    expectOk(reply);
    expect(settingsOf(reply)).toEqual({
      gymName: "Fionis CrossFit",
      timezone: "Asia/Kolkata",
      upcomingLeadDays: 7,
      expiryLeadDays: 14,
    });
  });

  test("BR-REC-60 / C13 the default days are JSON numbers, not text", async () => {
    const data = settingsOf(await api.get(PATH.settings));
    expect(typeof data.upcomingLeadDays).toBe("number");
    expect(typeof data.expiryLeadDays).toBe("number");
  });

  test("BR-REC-168 / C13 E07 writes nothing: the settings table is still empty after several reads", async () => {
    await api.get(PATH.settings);
    await api.get(PATH.settings);
    await api.get(PATH.settings);
    expect(await dbSettings()).toHaveLength(0);
  });

  test("BR-REC-158 / C13 E07 leaves no change-log row", async () => {
    const actor = await newActor();
    expectOk(await api.get(PATH.settings, { token: actor.token }));
    expect(await auditRows(actor.sid)).toHaveLength(0);
  });

  test("BR-REC-159 / C13 E07 without a sign-in is 401 UNAUTHORIZED, not the defaults, and writes nothing", async () => {
    expectError(
      await api.get(PATH.settings, { token: null }),
      401,
      "UNAUTHORIZED",
    );
    expectError(
      await api.get(PATH.settings, { token: await forgedToken() }),
      401,
      "UNAUTHORIZED",
    );
    expect(await dbSettings()).toHaveLength(0);
  });

  test("BR-REC-160 / C13 the answer has an ETag, the same data gives the same tag, and a matching If-None-Match gets 304 with no body", async () => {
    const first = await api.get(PATH.settings);
    expect(etagOf(first.headers)).toMatch(/^(W\/)?"[^"]+"$/);
    const second = await api.get(PATH.settings);
    expect(etagOf(second.headers)).toBe(etagOf(first.headers));
    const cached = await api.get(PATH.settings, {
      headers: { "If-None-Match": etagOf(first.headers) },
    });
    expect(cached.status).toBe(304);
    expect(await cached.res.text()).toBe("");
    expect(await dbSettings()).toHaveLength(0);
  });

  test("BR-REC-72 / C13 after the first E08 changes a value, the tag from the empty state gets 200 with the new settings", async () => {
    const before = await api.get(PATH.settings);
    expectOk(await api.patch(PATH.settings, { body: { upcomingLeadDays: 9 } }));
    const after = await api.get(PATH.settings, {
      headers: { "If-None-Match": etagOf(before.headers) },
    });
    expect(after.status).toBe(200);
    expect(settingsOf(after)).toEqual({
      ...DEFAULT_SETTINGS,
      upcomingLeadDays: 9,
    });
    expect(etagOf(after.headers)).not.toBe(etagOf(before.headers));
  });

  test("C13 E07 on an existing row also only reads: the row is unchanged and no change-log row is written", async () => {
    await resetSettings();
    const rowsBefore = await dbSettings();
    const actor = await newActor();
    expectOk(await api.get(PATH.settings, { token: actor.token }));
    expect(await dbSettings()).toEqual(rowsBefore);
    expect(await auditRows(actor.sid)).toHaveLength(0);
  });
});

describe("C13 the first E08 creates the settings row", () => {
  const changes: [label: string, change: Partial<SettingsOut>][] = [
    ["gymName", { gymName: "TEST_setup First Gym" }],
    ["timezone", { timezone: "Europe/London" }],
    ["upcomingLeadDays", { upcomingLeadDays: 10 }],
    ["expiryLeadDays", { expiryLeadDays: 30 }],
  ];
  for (const [label, change] of changes) {
    test(`BR-REC-60 / C13 first E08 with only ${label} creates the row: that field as sent, the other three the defaults`, async () => {
      const reply = await api.patch(PATH.settings, { body: change });
      expectOk(reply);
      const expected = { ...DEFAULT_SETTINGS, ...change };
      expect(settingsOf(reply)).toEqual(expected);
      const rows = await dbSettings();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject(expected);
      expect(settingsOf(await api.get(PATH.settings))).toEqual(expected);
    });
  }

  test("BR-REC-60 / C13 first E08 with all four settings creates the row with exactly those", async () => {
    const change: SettingsOut = {
      gymName: "TEST_setup All Four",
      timezone: "America/New_York",
      upcomingLeadDays: 0,
      expiryLeadDays: 60,
    };
    const reply = await api.patch(PATH.settings, { body: change });
    expectOk(reply);
    expect(settingsOf(reply)).toEqual(change);
    const rows = await dbSettings();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(change);
  });

  test("BR-REC-60 / C1 / C13 the gym name is trimmed when the first E08 creates the row", async () => {
    const reply = await api.patch(PATH.settings, {
      body: { gymName: "  Fionis  " },
    });
    expectOk(reply);
    expect(settingsOf(reply).gymName).toBe("Fionis");
    expect((await dbSettings())[0]?.gymName).toBe("Fionis");
  });

  test("BR-REC-168 / C13 a first E08 that sends only the default values still creates exactly one row", async () => {
    const reply = await api.patch(PATH.settings, {
      body: { upcomingLeadDays: 7 },
    });
    expectOk(reply);
    expect(settingsOf(reply)).toEqual(DEFAULT_SETTINGS);
    const rows = await dbSettings();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(DEFAULT_SETTINGS);
  });

  for (const [field, good] of [
    ["upcomingLeadDays", [0, 30]],
    ["expiryLeadDays", [0, 60]],
  ] as const) {
    for (const days of good) {
      test(`BR-REC-60 / C13 first E08 with ${field} ${days} (an edge of the range) creates the row`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { [field]: days },
        });
        expectOk(reply);
        expect(settingsOf(reply)[field]).toBe(days);
        const rows = await dbSettings();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.[field]).toBe(days);
      });
    }
  }

  test("BR-REC-168 / C13 a second E08 changes the same row: still exactly one row, the first change kept", async () => {
    await api.patch(PATH.settings, { body: { gymName: "TEST_setup First" } });
    const reply = await api.patch(PATH.settings, {
      body: { expiryLeadDays: 40 },
    });
    expectOk(reply);
    expect(settingsOf(reply)).toEqual({
      ...DEFAULT_SETTINGS,
      gymName: "TEST_setup First",
      expiryLeadDays: 40,
    });
    const rows = await dbSettings();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gymName: "TEST_setup First",
      expiryLeadDays: 40,
    });
  });
});

describe("BR-REC-158 / C13 the first E08 writes its change-log row", () => {
  test("the first E08 leaves exactly one settings.update row for the signed-in session, with the new value in after", async () => {
    const actor = await newActor();
    const reply = await api.patch(PATH.settings, {
      token: actor.token,
      body: { gymName: "TEST_setup Logged First" },
    });
    expectOk(reply);
    const rows = await auditRows(actor.sid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "settings.update",
      after: { gymName: "TEST_setup Logged First" },
    });
  });

  test("a first E08 that sends only the default values still leaves one settings.update row", async () => {
    const actor = await newActor();
    expectOk(
      await api.patch(PATH.settings, {
        token: actor.token,
        body: { expiryLeadDays: 14 },
      }),
    );
    const rows = await auditRows(actor.sid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "settings.update",
    });
  });

  test("the second E08 leaves its own row: before holds what the first E08 saved, after the new value", async () => {
    const actor = await newActor();
    await api.patch(PATH.settings, {
      token: actor.token,
      body: { gymName: "TEST_setup Name A" },
    });
    expectOk(
      await api.patch(PATH.settings, {
        token: actor.token,
        body: { gymName: "TEST_setup Name B" },
      }),
    );
    const rows = await auditRows(actor.sid);
    expect(rows.map((row) => row.action)).toEqual([
      "settings.update",
      "settings.update",
    ]);
    expect(rows[1]).toMatchObject({
      before: { gymName: "TEST_setup Name A" },
      after: { gymName: "TEST_setup Name B" },
    });
  });
});

describe("BR-REC-158 / BR-REC-168 / C13 a refused first E08 creates no row and no change-log row", () => {
  type Refused = {
    label: string;
    status: number;
    code: string;
    send: (token: string) => ReturnType<typeof api.patch>;
  };

  const refused: Refused[] = [
    {
      label: "upcomingLeadDays 31 (over the range)",
      status: 400,
      code: "VALIDATION_ERROR",
      send: (token) =>
        api.patch(PATH.settings, { token, body: { upcomingLeadDays: 31 } }),
    },
    {
      label: "expiryLeadDays 61 (over the range)",
      status: 400,
      code: "VALIDATION_ERROR",
      send: (token) =>
        api.patch(PATH.settings, { token, body: { expiryLeadDays: 61 } }),
    },
    {
      label: "a valid name sent together with a bad window",
      status: 400,
      code: "VALIDATION_ERROR",
      send: (token) =>
        api.patch(PATH.settings, {
          token,
          body: { gymName: "TEST_setup Valid", upcomingLeadDays: 99 },
        }),
    },
    {
      label: "an unknown time zone",
      status: 400,
      code: "VALIDATION_ERROR",
      send: (token) =>
        api.patch(PATH.settings, { token, body: { timezone: "Mars/Olympus" } }),
    },
    {
      label: "an unknown field",
      status: 400,
      code: "VALIDATION_ERROR",
      send: (token) =>
        api.patch(PATH.settings, {
          token,
          body: { gymName: "TEST_setup Valid", favouriteColour: "red" },
        }),
    },
    {
      label: "an empty body",
      status: 400,
      code: "VALIDATION_ERROR",
      send: (token) => api.patch(PATH.settings, { token, body: {} }),
    },
  ];

  for (const { label, status, code, send } of refused) {
    test(`${label} is ${status} ${code}; the table stays empty and nothing is logged`, async () => {
      const actor = await newActor();
      const reply = await send(actor.token);
      expect(reply.status, JSON.stringify(reply.body)).toBe(status);
      expect(reply.body?.code).toBe(code);
      expect(await dbSettings()).toHaveLength(0);
      expect(await auditRows(actor.sid)).toHaveLength(0);
      // and E07 still answers the defaults
      expect(settingsOf(await api.get(PATH.settings))).toEqual(
        DEFAULT_SETTINGS,
      );
      expect(await dbSettings()).toHaveLength(0);
    });
  }

  test("a bad window is reported on its own field with the range message", async () => {
    expectInvalid(
      await api.patch(PATH.settings, { body: { upcomingLeadDays: 45 } }),
      "upcomingLeadDays",
      "Use 0 to 30 days",
    );
    expect(await dbSettings()).toHaveLength(0);
  });

  test("E08 without a sign-in is 401 UNAUTHORIZED and creates no row", async () => {
    expectError(
      await api.patch(PATH.settings, {
        token: null,
        body: { gymName: "TEST_setup Anonymous" },
      }),
      401,
      "UNAUTHORIZED",
    );
    expect(await dbSettings()).toHaveLength(0);
  });

  test("BR-REC-37 E08 from another Origin is 403 CSRF_ORIGIN and creates no row", async () => {
    const actor = await newActor();
    expectError(
      await api.patch(PATH.settings, {
        token: actor.token,
        origin: "https://evil.example",
        body: { gymName: "TEST_setup Foreign" },
      }),
      403,
      "CSRF_ORIGIN",
    );
    expect(await dbSettings()).toHaveLength(0);
    expect(await auditRows(actor.sid)).toHaveLength(0);
  });
});

describe("BR-REC-168 / C13 two first E08s at the same moment", () => {
  test("never a server error: exactly one row is left, and every success is in it and in the change log", async () => {
    const one = await newActor();
    const two = await newActor();
    const [a, b] = await Promise.all([
      api.patch(PATH.settings, {
        token: one.token,
        body: { gymName: "TEST_setup Race" },
      }),
      api.patch(PATH.settings, {
        token: two.token,
        body: { expiryLeadDays: 33 },
      }),
    ]);
    expect(a.status, JSON.stringify(a.body)).toBeLessThan(500);
    expect(b.status, JSON.stringify(b.body)).toBeLessThan(500);

    const rows = await dbSettings();
    expect(rows).toHaveLength(1);

    // each request that said 200 was applied and logged once
    if (a.status === 200) {
      expect(rows[0]?.gymName).toBe("TEST_setup Race");
      expect(await auditRows(one.sid)).toHaveLength(1);
    } else {
      expect(await auditRows(one.sid)).toHaveLength(0);
    }
    if (b.status === 200) {
      expect(rows[0]?.expiryLeadDays).toBe(33);
      expect(await auditRows(two.sid)).toHaveLength(1);
    } else {
      expect(await auditRows(two.sid)).toHaveLength(0);
    }
    // at least one of them succeeded: the settings are not left empty
    expect([a.status, b.status]).toContain(200);
  });
});
