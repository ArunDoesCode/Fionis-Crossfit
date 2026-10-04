import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { seed } from "../../scripts/seed";
import { db } from "../../src/db/client";
import { gymSettings, loginAttempts } from "../../src/db/schemas";
import { forgedToken } from "../helpers/http";
import {
  api,
  assertCatalogOnlyOurs,
  cleanupAll,
  DEFAULT_SETTINGS,
  dbSettings,
  expectError,
  expectInvalid,
  expectOk,
  PATH,
  resetSettings,
  SETTINGS_KEYS,
  type SettingsOut,
  settingsOf,
  snapshotSingletons,
  wipeCatalog,
} from "./helpers";

// member-records/setup E07 (read settings) and E08 (change settings):
// BR-REC-60 (gym name, time zone, "Due soon" 0-30 days, "Ends soon" 0-60 days),
// BR-REC-72 + BR-REC-160 (ETag / 304), BR-REC-153 (JSON numbers), BR-REC-154 (envelope),
// BR-REC-157 (update bodies reject unknown fields and need one field), BR-REC-159, 161.

let restoreSingletons: () => Promise<void>;

beforeAll(async () => {
  restoreSingletons = await snapshotSingletons();
  await assertCatalogOnlyOurs();
});
beforeEach(resetSettings);
afterEach(wipeCatalog);
afterAll(async () => {
  await cleanupAll();
  await restoreSingletons();
});

const longName = (length: number) => "G".repeat(length);

describe("E07 read the settings", () => {
  test("BR-REC-60 a fresh database (after the seed) answers Fionis CrossFit, Asia/Kolkata, 7 days, 14 days", async () => {
    await wipeCatalog();
    await db.delete(gymSettings);
    await db.delete(loginAttempts);
    await seed();

    const reply = await api.get(PATH.settings);
    expectOk(reply);
    expect(settingsOf(reply)).toEqual({
      gymName: "Fionis CrossFit",
      timezone: "Asia/Kolkata",
      upcomingLeadDays: 7,
      expiryLeadDays: 14,
    });
  });

  test("BR-REC-153 E07 answers { success: true, data } with exactly the four settings, the days as JSON numbers", async () => {
    const reply = await api.get(PATH.settings);
    expectOk(reply);
    const data = settingsOf(reply);
    expect(Object.keys(data).sort()).toEqual(SETTINGS_KEYS);
    expect(typeof data.upcomingLeadDays).toBe("number");
    expect(typeof data.expiryLeadDays).toBe("number");
    expect(typeof data.gymName).toBe("string");
    expect(typeof data.timezone).toBe("string");
  });

  test("BR-REC-60 E07 shows what is stored in the database", async () => {
    await db.update(gymSettings).set({
      gymName: "TEST_setup stored name",
      timezone: "Europe/London",
      upcomingLeadDays: 3,
      expiryLeadDays: 21,
    });
    const reply = await api.get(PATH.settings);
    expect(settingsOf(reply)).toEqual({
      gymName: "TEST_setup stored name",
      timezone: "Europe/London",
      upcomingLeadDays: 3,
      expiryLeadDays: 21,
    });
  });

  test("BR-REC-159 E07 without a sign-in is 401 UNAUTHORIZED", async () => {
    expectError(
      await api.get(PATH.settings, { token: null }),
      401,
      "UNAUTHORIZED",
    );
  });

  test("BR-REC-159 E07 with a forged token is 401 UNAUTHORIZED", async () => {
    expectError(
      await api.get(PATH.settings, { token: await forgedToken() }),
      401,
      "UNAUTHORIZED",
    );
  });

  test("BR-REC-161 E07 is not cached by the browser or a proxy and carries Server-Timing", async () => {
    const reply = await api.get(PATH.settings);
    const cacheControl = reply.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-store");
    const timing = reply.headers.get("server-timing") ?? "";
    expect(timing).toContain("db");
    expect(timing).toContain("total");
  });
});

describe("E08 change the settings", () => {
  test("BR-REC-60 E08 changes only the fields sent and answers all four settings after the change", async () => {
    const reply = await api.patch(PATH.settings, {
      body: { gymName: "TEST_setup Gym" },
    });
    expectOk(reply);
    expect(settingsOf(reply)).toEqual({
      ...DEFAULT_SETTINGS,
      gymName: "TEST_setup Gym",
    });
  });

  test("BR-REC-60 each setting can be changed on its own", async () => {
    const changes: Partial<SettingsOut>[] = [
      { gymName: "TEST_setup Own Gym" },
      { timezone: "Europe/London" },
      { upcomingLeadDays: 10 },
      { expiryLeadDays: 30 },
    ];
    for (const change of changes) {
      await resetSettings();
      const reply = await api.patch(PATH.settings, { body: change });
      expectOk(reply);
      expect(settingsOf(reply)).toEqual({ ...DEFAULT_SETTINGS, ...change });
    }
  });

  test("BR-REC-60 all four settings can be changed in one request", async () => {
    const change: SettingsOut = {
      gymName: "TEST_setup All Four",
      timezone: "America/New_York",
      upcomingLeadDays: 0,
      expiryLeadDays: 60,
    };
    const reply = await api.patch(PATH.settings, { body: change });
    expectOk(reply);
    expect(settingsOf(reply)).toEqual(change);
  });

  test("BR-REC-60 a following E07 and the database show the same as the E08 answer", async () => {
    const change = { gymName: "TEST_setup Saved", expiryLeadDays: 20 };
    const patched = await api.patch(PATH.settings, { body: change });
    expectOk(patched);
    const read = await api.get(PATH.settings);
    expect(settingsOf(read)).toEqual(settingsOf(patched));
    const rows = await dbSettings();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gymName: "TEST_setup Saved",
      timezone: "Asia/Kolkata",
      upcomingLeadDays: 7,
      expiryLeadDays: 20,
    });
  });

  test("BR-REC-153 E08 answers the days as JSON numbers", async () => {
    const reply = await api.patch(PATH.settings, {
      body: { upcomingLeadDays: 12 },
    });
    expect(typeof settingsOf(reply).upcomingLeadDays).toBe("number");
    expect(typeof settingsOf(reply).expiryLeadDays).toBe("number");
  });

  test("BR-REC-60 / C1 the gym name is trimmed before it is saved and returned", async () => {
    const reply = await api.patch(PATH.settings, {
      body: { gymName: "  Fionis  " },
    });
    expectOk(reply);
    expect(settingsOf(reply).gymName).toBe("Fionis");
    expect(settingsOf(await api.get(PATH.settings)).gymName).toBe("Fionis");
    expect((await dbSettings())[0]?.gymName).toBe("Fionis");
  });

  describe('BR-REC-60 "Due soon" window is a whole number from 0 to 30 days', () => {
    for (const days of [0, 1, 7, 15, 30]) {
      test(`BR-REC-60 upcomingLeadDays ${days} is saved`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { upcomingLeadDays: days },
        });
        expectOk(reply);
        expect(settingsOf(reply).upcomingLeadDays).toBe(days);
      });
    }

    for (const days of [-1, 31, 45, 1000, 7.5]) {
      test(`BR-REC-60 upcomingLeadDays ${days} is 400 VALIDATION_ERROR on upcomingLeadDays and changes nothing`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { upcomingLeadDays: days },
        });
        expectInvalid(reply, "upcomingLeadDays");
        expect(settingsOf(await api.get(PATH.settings))).toEqual(
          DEFAULT_SETTINGS,
        );
      });
    }

    test('BR-REC-60 window 45 says "Use 0 to 30 days"', async () => {
      const reply = await api.patch(PATH.settings, {
        body: { upcomingLeadDays: 45 },
      });
      expectInvalid(reply, "upcomingLeadDays", "Use 0 to 30 days");
    });

    test("BR-REC-60 null or text for upcomingLeadDays is 400", async () => {
      expectInvalid(
        await api.patch(PATH.settings, { body: { upcomingLeadDays: null } }),
        "upcomingLeadDays",
      );
      expectInvalid(
        await api.patch(PATH.settings, { body: { upcomingLeadDays: "7" } }),
        "upcomingLeadDays",
      );
    });
  });

  describe('BR-REC-60 "Ends soon" window is a whole number from 0 to 60 days', () => {
    for (const days of [0, 1, 14, 45, 60]) {
      test(`BR-REC-60 expiryLeadDays ${days} is saved`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { expiryLeadDays: days },
        });
        expectOk(reply);
        expect(settingsOf(reply).expiryLeadDays).toBe(days);
      });
    }

    for (const days of [-1, 61, 100, 14.5]) {
      test(`BR-REC-60 expiryLeadDays ${days} is 400 VALIDATION_ERROR on expiryLeadDays and changes nothing`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { expiryLeadDays: days },
        });
        expectInvalid(reply, "expiryLeadDays");
        expect(settingsOf(await api.get(PATH.settings))).toEqual(
          DEFAULT_SETTINGS,
        );
      });
    }

    test('BR-REC-60 window 61 says "Use 0 to 60 days"', async () => {
      const reply = await api.patch(PATH.settings, {
        body: { expiryLeadDays: 61 },
      });
      expectInvalid(reply, "expiryLeadDays", "Use 0 to 60 days");
    });

    test("BR-REC-60 null for expiryLeadDays is 400", async () => {
      expectInvalid(
        await api.patch(PATH.settings, { body: { expiryLeadDays: null } }),
        "expiryLeadDays",
      );
    });
  });

  describe("BR-REC-60 / C1 the gym name is 2 to 60 characters after trimming", () => {
    const good: [label: string, sent: string, saved: string][] = [
      ["2 characters", "AB", "AB"],
      ["a normal name", "Fionis CrossFit", "Fionis CrossFit"],
      ["60 characters", longName(60), longName(60)],
      ["2 characters padded with spaces", "  AB  ", "AB"],
    ];
    for (const [label, sent, saved] of good) {
      test(`C1 gym name with ${label} is saved as "${saved.slice(0, 12)}..."`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { gymName: sent },
        });
        expectOk(reply);
        expect(settingsOf(reply).gymName).toBe(saved);
      });
    }

    const bad: [label: string, sent: unknown][] = [
      ["empty", ""],
      ["1 character", "A"],
      ["only spaces", "     "],
      ["1 character between spaces", "  A  "],
      ["61 characters", longName(61)],
      ["a number", 123],
      ["null", null],
    ];
    for (const [label, sent] of bad) {
      test(`C1 gym name ${label} is 400 VALIDATION_ERROR on gymName`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { gymName: sent },
        });
        expectInvalid(reply, "gymName");
        expect(settingsOf(await api.get(PATH.settings))).toEqual(
          DEFAULT_SETTINGS,
        );
      });
    }

    test('C1 the gym name message is "Use 2 to 60 characters"', async () => {
      expectInvalid(
        await api.patch(PATH.settings, { body: { gymName: "A" } }),
        "gymName",
        "Use 2 to 60 characters",
      );
    });
  });

  describe("BR-REC-60 / C1 the time zone is an IANA name the server knows", () => {
    for (const zone of [
      "Asia/Kolkata",
      "Europe/London",
      "UTC",
      "America/New_York",
    ]) {
      test(`C1 time zone ${zone} is saved`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { timezone: zone },
        });
        expectOk(reply);
        expect(settingsOf(reply).timezone).toBe(zone);
      });
    }

    const bad: [label: string, sent: unknown][] = [
      ["an unknown name", "Mars/Olympus"],
      ["empty", ""],
      ["a name with a leading space", " Asia/Kolkata"],
      ["an offset", "+05:30"],
      ["null", null],
      ["a number", 5],
    ];
    for (const [label, sent] of bad) {
      test(`C1 time zone ${label} is 400 VALIDATION_ERROR on timezone`, async () => {
        const reply = await api.patch(PATH.settings, {
          body: { timezone: sent },
        });
        expectInvalid(reply, "timezone");
        expect(settingsOf(await api.get(PATH.settings))).toEqual(
          DEFAULT_SETTINGS,
        );
      });
    }
  });

  test("BR-REC-60 a refused E08 changes nothing, not even the valid fields sent with the bad one", async () => {
    const reply = await api.patch(PATH.settings, {
      body: { gymName: "TEST_setup Valid Name", upcomingLeadDays: 99 },
    });
    expectInvalid(reply, "upcomingLeadDays");
    expect(settingsOf(await api.get(PATH.settings))).toEqual(DEFAULT_SETTINGS);
    expect((await dbSettings())[0]?.gymName).toBe("Fionis CrossFit");
  });

  test("BR-REC-157 an unknown field is 400 VALIDATION_ERROR and changes nothing", async () => {
    const reply = await api.patch(PATH.settings, {
      body: { gymName: "TEST_setup Valid Name", favouriteColour: "red" },
    });
    expectInvalid(reply);
    expect(settingsOf(await api.get(PATH.settings))).toEqual(DEFAULT_SETTINGS);
  });

  test("BR-REC-157 an empty body is 400 VALIDATION_ERROR (at least one field)", async () => {
    expectInvalid(await api.patch(PATH.settings, { body: {} }));
  });

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    expectError(
      await api.patch(PATH.settings, { rawBody: "{not json" }),
      400,
      "INVALID_JSON",
    );
  });

  test("BR-REC-159 E08 without a sign-in is 401 UNAUTHORIZED and changes nothing", async () => {
    const reply = await api.patch(PATH.settings, {
      token: null,
      body: { gymName: "TEST_setup Anonymous" },
    });
    expectError(reply, 401, "UNAUTHORIZED");
    expect(settingsOf(await api.get(PATH.settings))).toEqual(DEFAULT_SETTINGS);
  });

  test("BR-REC-37 E08 with no Origin is 403 CSRF_ORIGIN and changes nothing", async () => {
    const reply = await api.patch(PATH.settings, {
      origin: null,
      body: { gymName: "TEST_setup No Origin" },
    });
    expectError(reply, 403, "CSRF_ORIGIN");
    expect(settingsOf(await api.get(PATH.settings))).toEqual(DEFAULT_SETTINGS);
  });

  test("BR-REC-37 E08 from another Origin is 403 CSRF_ORIGIN and changes nothing", async () => {
    const reply = await api.patch(PATH.settings, {
      origin: "https://evil.example",
      body: { gymName: "TEST_setup Foreign" },
    });
    expectError(reply, 403, "CSRF_ORIGIN");
    expect(settingsOf(await api.get(PATH.settings))).toEqual(DEFAULT_SETTINGS);
  });
});

describe("E07 ETag (BR-REC-72, BR-REC-160)", () => {
  const etagOf = (headers: Headers) => headers.get("etag") ?? "";

  test("BR-REC-160 E07 sends a quoted ETag", async () => {
    const reply = await api.get(PATH.settings);
    expect(etagOf(reply.headers)).toMatch(/^(W\/)?"[^"]+"$/);
  });

  test("BR-REC-160 the same data gives the same ETag", async () => {
    const first = await api.get(PATH.settings);
    const second = await api.get(PATH.settings);
    expect(etagOf(first.headers)).not.toBe("");
    expect(etagOf(second.headers)).toBe(etagOf(first.headers));
  });

  test("BR-REC-160 a matching If-None-Match gets 304 and no body", async () => {
    const first = await api.get(PATH.settings);
    const second = await api.get(PATH.settings, {
      headers: { "If-None-Match": etagOf(first.headers) },
    });
    expect(second.status).toBe(304);
    expect(await second.res.text()).toBe("");
  });

  test("BR-REC-72 after E08 changes a value the old tag gets 200 with the new settings and a new ETag", async () => {
    const first = await api.get(PATH.settings);
    const patched = await api.patch(PATH.settings, {
      body: { upcomingLeadDays: 9 },
    });
    expectOk(patched);
    const second = await api.get(PATH.settings, {
      headers: { "If-None-Match": etagOf(first.headers) },
    });
    expect(second.status).toBe(200);
    expect(settingsOf(second).upcomingLeadDays).toBe(9);
    expect(etagOf(second.headers)).not.toBe(etagOf(first.headers));

    const third = await api.get(PATH.settings, {
      headers: { "If-None-Match": etagOf(second.headers) },
    });
    expect(third.status).toBe(304);
  });

  test("BR-REC-160 a tag that does not match gets the full answer", async () => {
    const reply = await api.get(PATH.settings, {
      headers: { "If-None-Match": '"something-else"' },
    });
    expect(reply.status).toBe(200);
    expect(settingsOf(reply)).toEqual(DEFAULT_SETTINGS);
  });
});
