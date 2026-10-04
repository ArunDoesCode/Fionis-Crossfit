import { beforeAll, describe, expect, test } from "bun:test";

import {
  bare,
  dataOf,
  type EndingItem,
  expectError,
  MARK,
  mine,
  type SeedPeriod,
  useMembersSuite,
} from "./support/suite";

// E24 GET /api/memberships/ending: the two Home lists, "Memberships ending" (Ends soon,
// soonest first) and "Recently ended" (ended in the last 30 days, most recent first).
// BR-REC-53, 52 (status from the latest period), 06 (archived are never listed),
// 155 (paging), 154 (envelope).

const s = useMembersSuite();

/** A period that ends `n` days from today (negative: ended). */
const endsIn = (n: number): SeedPeriod[] => [
  { plan: "annual", startOn: s.day(n - 364), endOn: s.day(n) },
];

const token = "Zend";
const label = (item: { fullName: string }) =>
  bare(item.fullName).replace(`${token} `, "");

const listed = async (status: "expiring" | "expired") =>
  mine(await s.endingAll(status));

beforeAll(async () => {
  const seed = (name: string, periods: SeedPeriod[], archived = false) =>
    s.seedMember({ name: `${token} ${name}`, periods, archived });

  // ends soon (lead 14)
  await seed("Today", endsIn(0));
  await seed("Three", endsIn(3));
  await seed("SevenB", endsIn(7));
  await seed("SevenA", endsIn(7));
  await seed("TwinTen", endsIn(10));
  await seed("TwinTen", endsIn(10));
  await seed("Fourteen", endsIn(14));
  await seed("Fifteen", endsIn(15)); // Active: not listed
  // ended
  await seed("Gone1", endsIn(-1));
  await seed("Gone30", endsIn(-30)); // ended exactly 30 days ago: listed
  await seed("Gone31", endsIn(-31)); // 31 days ago: not listed
  await seed("Gone100", endsIn(-100));
  await seed("GoneB5", endsIn(-5));
  await seed("GoneA5", endsIn(-5));
  // never listed
  await seed("ArchivedSoon", endsIn(5), true);
  await seed("ArchivedGone", endsIn(-5), true);
  await seed("Running", endsIn(200));
  await seed("RenewedEarly", [
    { plan: "monthly", startOn: s.day(-25), endOn: s.day(4) },
    { plan: "annual", startOn: s.day(5), endOn: s.day(369) },
  ]);
  await seed("RenewedRunning", [
    { plan: "monthly", startOn: s.day(-70), endOn: s.day(-41) },
    { plan: "annual", startOn: s.day(-40), endOn: s.day(324) },
  ]);
  await seed("EndedThenFuture", [
    { plan: "monthly", startOn: s.day(-40), endOn: s.day(-10) },
    { plan: "annual", startOn: s.day(20), endOn: s.day(384) },
  ]);
  // two periods, the latest is the one that ends soon: listed once, with the latest period's data
  await seed("TwoPeriods", [
    { plan: "annual", startOn: s.day(-600), endOn: s.day(-236) },
    { plan: "quarterly", startOn: s.day(-85), endOn: s.day(6) },
  ]);
});

describe("E24 Memberships ending (BR-REC-53, 52)", () => {
  test("BR-REC-53 lists the members that end soon, soonest first, then by name, then id", async () => {
    const items = await listed("expiring");
    expect(items.map(label)).toEqual([
      "Today",
      "Three",
      "TwoPeriods",
      "SevenA",
      "SevenB",
      "TwinTen",
      "TwinTen",
      "Fourteen",
    ]);
  });

  test("BR-REC-53 members with the same end date and the same name come in id order", async () => {
    const twins = (await listed("expiring")).filter(
      (i) => label(i) === "TwinTen",
    );
    expect(twins).toHaveLength(2);
    const ids = twins.map((i) => i.memberId);
    expect(ids).toEqual([...ids].sort());
  });

  test("BR-REC-52 ending today counts, and so does 14 days left (lead 14); 15 days left is not Ends soon", async () => {
    const labels = (await listed("expiring")).map(label);
    expect(labels).toContain("Today");
    expect(labels).toContain("Fourteen");
    expect(labels).not.toContain("Fifteen");
  });

  test("BR-REC-52 renewed early (a later period exists that has not started) is not listed", async () => {
    const labels = (await listed("expiring")).map(label);
    expect(labels).not.toContain("RenewedEarly");
  });

  test("BR-REC-53 a member whose latest period is running is in neither list, even with an ended period before it", async () => {
    const soon = (await listed("expiring")).map(label);
    const ended = (await listed("expired")).map(label);
    for (const name of ["Running", "RenewedRunning", "RenewedEarly"]) {
      expect(soon).not.toContain(name);
      expect(ended).not.toContain(name);
    }
  });

  test("BR-REC-53 a member with a newer period that has not ended is in neither list, even when the older period ended recently", async () => {
    const soon = (await listed("expiring")).map(label);
    const ended = (await listed("expired")).map(label);
    expect(soon).not.toContain("EndedThenFuture");
    expect(ended).not.toContain("EndedThenFuture");
  });

  test("BR-REC-53 one row per member, from the member's latest period by start", async () => {
    const items = (await listed("expiring")).filter(
      (i) => label(i) === "TwoPeriods",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      plan: "quarterly",
      endOn: s.day(6),
      daysLeft: 6,
    });
  });

  test("BR-REC-06 / 53 archived members are never listed", async () => {
    const soon = (await listed("expiring")).map(label);
    const ended = (await listed("expired")).map(label);
    expect(soon).not.toContain("ArchivedSoon");
    expect(ended).not.toContain("ArchivedGone");
  });

  test("BR-REC-53 each row has memberId, fullName, phone, plan, endOn and daysLeft", async () => {
    const item = (await listed("expiring")).find((i) => label(i) === "SevenA");
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "daysLeft",
      "endOn",
      "fullName",
      "memberId",
      "phone",
      "plan",
    ]);
    expect(item).toMatchObject({
      fullName: `${token} SevenA ${MARK}`,
      plan: "annual",
      endOn: s.day(7),
      daysLeft: 7,
    });
    expect(item?.phone).toMatch(/^\d{10}$/);
    expect(item?.memberId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("BR-REC-53 daysLeft: 0 for ending today, counting down to the end date", async () => {
    const byLabel = new Map(
      (await listed("expiring")).map((i) => [label(i), i.daysLeft]),
    );
    expect(byLabel.get("Today")).toBe(0);
    expect(byLabel.get("Three")).toBe(3);
    expect(byLabel.get("Fourteen")).toBe(14);
  });

  test("BR-REC-08 the lead days come from the settings: with 3 lead days only the members ending within 3 days are listed", async () => {
    try {
      await s.setSettings({ expiryLeadDays: 3 });
      const labels = (await listed("expiring")).map(label);
      expect(labels).toEqual(["Today", "Three"]);
    } finally {
      await s.setSettings({ expiryLeadDays: 14 });
    }
  });
});

describe("E24 Recently ended (BR-REC-53)", () => {
  test("BR-REC-53 lists memberships that ended in the last 30 days, most recent first, then by name", async () => {
    const items = await listed("expired");
    expect(items.map(label)).toEqual(["Gone1", "GoneA5", "GoneB5", "Gone30"]);
  });

  test("BR-REC-53 ended exactly 30 days ago is listed; ended 31 days ago is not", async () => {
    const labels = (await listed("expired")).map(label);
    expect(labels).toContain("Gone30");
    expect(labels).not.toContain("Gone31");
    expect(labels).not.toContain("Gone100");
  });

  test("BR-REC-53 daysLeft is negative: -1 ended yesterday, -30 ended 30 days ago", async () => {
    const byLabel = new Map(
      (await listed("expired")).map((i) => [label(i), i.daysLeft]),
    );
    expect(byLabel.get("Gone1")).toBe(-1);
    expect(byLabel.get("Gone30")).toBe(-30);
    expect(byLabel.get("GoneA5")).toBe(-5);
  });

  test("BR-REC-53 a membership that ends today is still Ends soon, not Recently ended", async () => {
    const labels = (await listed("expired")).map(label);
    expect(labels).not.toContain("Today");
  });

  test("BR-REC-53 the rows carry the plan and end date of the ended membership", async () => {
    const item = (await listed("expired")).find((i) => label(i) === "Gone1");
    expect(item).toMatchObject({
      plan: "annual",
      endOn: s.day(-1),
      daysLeft: -1,
    });
  });
});

describe("E24 paging and request rules (BR-REC-155, 154)", () => {
  for (const status of ["expiring", "expired"] as const) {
    test(`BR-REC-155 ${status}: walking pages of 2 gives the same rows as one big page, with consistent meta`, async () => {
      const all = await s.endingAll(status);
      const seen: EndingItem[] = [];
      let total = -1;
      for (let page = 1; ; page++) {
        const reply = await s.ending({ status, page, pageSize: 2 });
        const body = reply.body as unknown as {
          data: EndingItem[];
          meta: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
          };
        };
        expect(reply.status).toBe(200);
        expect(body.meta.page).toBe(page);
        expect(body.meta.pageSize).toBe(2);
        total = body.meta.total;
        expect(body.meta.totalPages).toBe(Math.max(1, Math.ceil(total / 2)));
        seen.push(...body.data);
        if (page >= body.meta.totalPages) break;
      }
      expect(total).toBe(all.length);
      expect(seen.map((i) => i.memberId)).toEqual(all.map((i) => i.memberId));
    });

    test(`BR-REC-155 ${status}: a page past the end is empty data`, async () => {
      const first = await s.ending({ status, pageSize: 100 });
      const meta = (first.body as unknown as { meta: Record<string, number> })
        .meta;
      const reply = await s.ending({
        status,
        page: (meta.totalPages ?? 1) + 1,
        pageSize: 100,
      });
      expect(dataOf<EndingItem[]>(reply)).toEqual([]);
    });
  }

  test("BR-REC-155 the default page size is 10 and page 1", async () => {
    const reply = await s.ending({ status: "expiring" });
    const meta = (reply.body as unknown as { meta: Record<string, number> })
      .meta;
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(10);
    expect(dataOf<EndingItem[]>(reply).length).toBeLessThanOrEqual(10);
  });

  test("BR-REC-155 25 per page (the Home sections ask for 5, the full list for 25) is accepted", async () => {
    for (const pageSize of [5, 25]) {
      const reply = await s.ending({ status: "expired", pageSize });
      expect(reply.status).toBe(200);
      expect(dataOf<EndingItem[]>(reply).length).toBeLessThanOrEqual(pageSize);
    }
  });

  test("BR-REC-154 status is required: without it 400 VALIDATION_ERROR", async () => {
    expectError(await s.ending({}), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-154 a status outside expiring and expired is 400 VALIDATION_ERROR", async () => {
    for (const status of ["any", "active", "archived", ""]) {
      expectError(await s.ending({ status }), 400, "VALIDATION_ERROR");
    }
  });

  test("BR-REC-154 success is { success: true, data, meta }", async () => {
    const reply = await s.ending({ status: "expiring" });
    expect(reply.body?.success).toBe(true);
    expect(Array.isArray(reply.body?.data)).toBe(true);
    expect(reply.body?.meta).toBeDefined();
  });
});
