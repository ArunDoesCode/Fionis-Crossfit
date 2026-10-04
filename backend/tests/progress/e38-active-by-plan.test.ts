import { describe, expect, test } from "bun:test";

import { call } from "../helpers/http";
import { dataOf, startFor, useProgressSuite } from "./support/suite";

// E38 GET /api/reports/active-by-plan: BR-REC-116 (members whose membership is Active or Ends soon,
// by the plan of their latest period, plus a total), P7 (non-archived members only; a latest period
// that has not started yet counts as Active) and BR-REC-110 (always computed live).
// The count covers every member in the database, so each test measures the CHANGE its own members
// make against the answer taken just before they were created.

type Plans = {
  monthly: number;
  quarterly: number;
  halfAnnual: number;
  annual: number;
  total: number;
};

const s = useProgressSuite();

async function counts(): Promise<Plans> {
  return dataOf<Plans>(await s.activeByPlan());
}

function change(after: Plans, before: Plans): Plans {
  return {
    monthly: after.monthly - before.monthly,
    quarterly: after.quarterly - before.quarterly,
    halfAnnual: after.halfAnnual - before.halfAnnual,
    annual: after.annual - before.annual,
    total: after.total - before.total,
  };
}

describe("BR-REC-116 active members by plan", () => {
  test("BR-REC-116 spec example: 40 Monthly, 22 Quarterly, 9 Half-annual, 31 Annual -> total 102", async () => {
    const before = await counts();
    const start = s.day(-5);
    await s.makeBulkMembers(40, "Monthly", { plan: "monthly", startOn: start });
    await s.makeBulkMembers(22, "Quarterly", {
      plan: "quarterly",
      startOn: start,
    });
    await s.makeBulkMembers(9, "Half", { plan: "half_annual", startOn: start });
    await s.makeBulkMembers(31, "Annual", { plan: "annual", startOn: start });
    expect(change(await counts(), before)).toEqual({
      monthly: 40,
      quarterly: 22,
      halfAnnual: 9,
      annual: 31,
      total: 102,
    });
  });

  test("BR-REC-116 'Ends soon' counts as active; ended memberships do not", async () => {
    const before = await counts();
    // a monthly membership that ends in 7 days (Ends soon) and one that ends today (Ends soon)
    await s.makeMember({
      name: "Ends In Seven",
      periods: [{ plan: "monthly", startOn: startFor("monthly", s.day(7)) }],
    });
    await s.makeMember({
      name: "Ends Today",
      periods: [{ plan: "monthly", startOn: startFor("monthly", s.day(0)) }],
    });
    // an annual membership that ended yesterday
    await s.makeMember({
      name: "Ended Yesterday",
      periods: [{ plan: "annual", startOn: startFor("annual", s.day(-1)) }],
    });
    expect(change(await counts(), before)).toEqual({
      monthly: 2,
      quarterly: 0,
      halfAnnual: 0,
      annual: 0,
      total: 2,
    });
  });

  test("BR-REC-52 / 116 the boundary of Ends soon: 14 days left and 15 days left both count; ended yesterday does not", async () => {
    const before = await counts();
    await s.makeMember({
      name: "Fourteen Left",
      periods: [
        { plan: "quarterly", startOn: startFor("quarterly", s.day(14)) },
      ],
    });
    await s.makeMember({
      name: "Fifteen Left",
      periods: [
        { plan: "quarterly", startOn: startFor("quarterly", s.day(15)) },
      ],
    });
    await s.makeMember({
      name: "Just Ended",
      periods: [
        { plan: "quarterly", startOn: startFor("quarterly", s.day(-1)) },
      ],
    });
    expect(change(await counts(), before)).toEqual({
      monthly: 0,
      quarterly: 2,
      halfAnnual: 0,
      annual: 0,
      total: 2,
    });
  });

  test("BR-REC-116 a member is counted under the plan of the LATEST period, not an earlier one", async () => {
    const before = await counts();
    await s.makeMember({
      name: "Switched Plan",
      periods: [
        { plan: "annual", startOn: startFor("annual", s.day(-31)) },
        { plan: "half_annual", startOn: s.day(-30) },
      ],
    });
    expect(change(await counts(), before)).toEqual({
      monthly: 0,
      quarterly: 0,
      halfAnnual: 1,
      annual: 0,
      total: 1,
    });
  });

  test("BR-REC-116 a member who renewed after their membership ended is counted by the new plan", async () => {
    const before = await counts();
    await s.makeMember({
      name: "Came Back",
      periods: [
        { plan: "annual", startOn: startFor("annual", s.day(-90)) },
        { plan: "monthly", startOn: s.day(0) },
      ],
    });
    expect(change(await counts(), before)).toEqual({
      monthly: 1,
      quarterly: 0,
      halfAnnual: 0,
      annual: 0,
      total: 1,
    });
  });

  test("P7 a latest period that has not started yet counts as Active, under its own plan", async () => {
    const before = await counts();
    await s.makeMember({
      name: "Early Renewal",
      periods: [
        { plan: "monthly", startOn: startFor("monthly", s.day(3)) },
        { plan: "annual", startOn: s.day(4) },
      ],
    });
    // renewed early after the old period already ended: still Active because the new one is coming
    await s.makeMember({
      name: "Renewal After End",
      periods: [
        { plan: "quarterly", startOn: startFor("quarterly", s.day(-20)) },
        { plan: "quarterly", startOn: s.day(2) },
      ],
    });
    expect(change(await counts(), before)).toEqual({
      monthly: 0,
      quarterly: 1,
      halfAnnual: 0,
      annual: 1,
      total: 2,
    });
  });

  test("P7 archived members are not counted", async () => {
    const before = await counts();
    await s.makeMember({
      name: "Archived Active",
      archived: true,
      periods: [{ plan: "annual", startOn: s.day(-5) }],
    });
    await s.makeMember({
      name: "Visible Active",
      periods: [{ plan: "annual", startOn: s.day(-5) }],
    });
    expect(change(await counts(), before)).toEqual({
      monthly: 0,
      quarterly: 0,
      halfAnnual: 0,
      annual: 1,
      total: 1,
    });
  });

  test("BR-REC-116 the total is the sum of the four plans", async () => {
    await s.makeMember({
      name: "Sum Monthly",
      periods: [{ plan: "monthly", startOn: s.day(-3) }],
    });
    await s.makeMember({
      name: "Sum Annual",
      periods: [{ plan: "annual", startOn: s.day(-3) }],
    });
    const c = await counts();
    expect(c.total).toBe(c.monthly + c.quarterly + c.halfAnnual + c.annual);
  });

  test("BR-REC-116 the answer has exactly the contract's fields", async () => {
    const c = await counts();
    expect(Object.keys(c).sort()).toEqual([
      "annual",
      "halfAnnual",
      "monthly",
      "quarterly",
      "total",
    ]);
    for (const value of Object.values(c)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  test("BR-REC-110 a new member is counted at once; archiving takes them out at once; restoring brings them back", async () => {
    const before = await counts();
    const member = await s.makeMember({
      name: "Fresh Count",
      periods: [{ plan: "quarterly", startOn: s.day(-3) }],
    });
    expect(change(await counts(), before).quarterly).toBe(1);

    const archived = await call(
      s.app,
      "POST",
      `/api/members/${member.id}/archive`,
      { token: s.token },
    );
    expect(archived.status).toBe(200);
    expect(change(await counts(), before)).toEqual({
      monthly: 0,
      quarterly: 0,
      halfAnnual: 0,
      annual: 0,
      total: 0,
    });

    const restored = await call(
      s.app,
      "POST",
      `/api/members/${member.id}/restore`,
      { token: s.token },
    );
    expect(restored.status).toBe(200);
    expect(change(await counts(), before).quarterly).toBe(1);
  });
});
