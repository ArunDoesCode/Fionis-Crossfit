import { beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  bare,
  dataOf,
  daysBetween,
  type EndingItem,
  type ListItem,
  type MemberView,
  mine,
  type Seeded,
  statusOracle,
  todayIn,
  useMembersSuite,
} from "./support/suite";

// BR-REC-08 / 52: the membership status comes from the member's latest period and the
// dates, never from a stored value. The same cases must give the same answer in every
// place the API shows it: the member (E18), the list item (E16), the status chip
// filter (E16 `status`) and the Home lists (E24). Expected values come from the rule
// written in the spec (members.md, BR-REC-52 and the "Membership maths" table), not from the code.

const s = useMembersSuite();
const LEAD = 14;

// [label, start offset in days from today, end offset in days from today, wanted status]
const CASES: [string, number, number, "active" | "expiring" | "expired"][] = [
  ["Running long", -100, 264, "active"],
  ["Ends in 89 days", -276, 89, "active"],
  ["Ends in 15 days", -349, 15, "active"],
  ["Ends in 14 days", -350, 14, "expiring"],
  ["Ends in 7 days", -357, 7, "expiring"],
  ["Ends tomorrow", -363, 1, "expiring"],
  ["Ends today", -364, 0, "expiring"],
  ["Ended yesterday", -365, -1, "expired"],
  ["Ended 30 days ago", -394, -30, "expired"],
  ["Ended 31 days ago", -395, -31, "expired"],
  ["Ended 400 days ago", -764, -400, "expired"],
  ["Starts tomorrow", 1, 365, "active"],
  ["Starts in 17 days", 17, 381, "active"],
  ["Starts tomorrow, ends within the lead", 1, 10, "active"],
  ["Starts today, ends within the lead", 0, 10, "expiring"],
  ["Starts today, ends in a month", 0, 30, "active"],
];

const LABELS = new Set(CASES.map(([label]) => label));
const seeded = new Map<string, Seeded>();

beforeAll(async () => {
  for (const [label, start, end] of CASES) {
    const m = await s.seedMember({
      name: `Zmat ${label}`,
      periods: [{ plan: "annual", startOn: s.day(start), endOn: s.day(end) }],
    });
    seeded.set(label, m);
  }
});

describe("membership status: the spec rule, case by case (BR-REC-52)", () => {
  for (const [label, start, end, wanted] of CASES) {
    test(`BR-REC-52 ${label}: ${wanted}`, async () => {
      const m = seeded.get(label) as Seeded;
      const period = { startOn: s.day(start), endOn: s.day(end) };
      const expected = statusOracle(period, s.today(), LEAD);
      // the table in this file and the rule agree (guards the test data itself)
      expect(expected.status).toBe(wanted);

      const member = dataOf<MemberView>(await s.getMember(m.id));
      expect(member.membership.status).toBe(wanted);
      expect(member.membership.daysLeft).toBe(expected.daysLeft);
      expect(member.membership.startOn).toBe(period.startOn);
      expect(member.membership.endOn).toBe(period.endOn);
    });
  }
});

describe("membership status: the same answer everywhere (BR-REC-52: SQL filter uses the same cases)", () => {
  test("E16 items show the same status and days left as E18", async () => {
    const items = mine(
      dataOf<ListItem[]>(await s.list({ q: "Zmat", pageSize: 100 })),
    );
    for (const [label, start, end, wanted] of CASES) {
      const item = items.find((i) => bare(i.fullName) === `Zmat ${label}`);
      expect(item?.membership.status, label).toBe(wanted);
      expect(item?.membership.daysLeft, label).toBe(
        statusOracle(
          { startOn: s.day(start), endOn: s.day(end) },
          s.today(),
          LEAD,
        ).daysLeft,
      );
    }
  });

  for (const status of ["active", "expiring", "expired"] as const) {
    test(`E16 status=${status} holds exactly the cases that are ${status}`, async () => {
      const items = mine(
        dataOf<ListItem[]>(await s.list({ q: "Zmat", status, pageSize: 100 })),
      );
      const got = items
        .map((i) => bare(i.fullName).replace("Zmat ", ""))
        .sort();
      const want = CASES.filter(([, , , w]) => w === status)
        .map(([label]) => label)
        .sort();
      expect(got).toEqual(want);
    });
  }

  test("E24 Memberships ending lists exactly the Ends soon cases", async () => {
    const got = mine(await s.endingAll("expiring"))
      .filter((i: EndingItem) => i.fullName.startsWith("Zmat "))
      .map((i) => bare(i.fullName).replace("Zmat ", ""))
      .filter((n) => LABELS.has(n))
      .sort();
    const want = CASES.filter(([, , , w]) => w === "expiring")
      .map(([label]) => label)
      .sort();
    expect(got).toEqual(want);
  });

  test("E24 Recently ended lists the Ended cases that ended 30 days ago or less", async () => {
    const got = mine(await s.endingAll("expired"))
      .filter((i: EndingItem) => i.fullName.startsWith("Zmat "))
      .map((i) => bare(i.fullName).replace("Zmat ", ""))
      .filter((n) => LABELS.has(n))
      .sort();
    const want = CASES.filter(([, , end, w]) => w === "expired" && end >= -30)
      .map(([label]) => label)
      .sort();
    expect(got).toEqual(want);
  });
});

describe("membership status uses the gym's today (BR-REC-52, contract: days from gym today)", () => {
  test("BR-REC-52 the same end date is 0 days left in a zone where it is today and more days left in a zone that is behind", async () => {
    // Pacific/Kiritimati (UTC+14) is always at least a day ahead of Pacific/Pago_Pago (UTC-11)
    const ahead = todayIn("Pacific/Kiritimati");
    const behind = todayIn("Pacific/Pago_Pago");
    const gap = daysBetween(behind, ahead);
    expect(gap).toBeGreaterThanOrEqual(1);
    const m = await s.seedMember({
      name: "Zmat Zone",
      periods: [
        { plan: "annual", startOn: addDays(ahead, -364), endOn: ahead },
      ],
    });
    try {
      await s.setSettings({ timezone: "Pacific/Kiritimati" });
      const here = dataOf<MemberView>(await s.getMember(m.id));
      expect(here.membership.daysLeft).toBe(0);
      expect(here.membership.status).toBe("expiring");

      await s.setSettings({ timezone: "Pacific/Pago_Pago" });
      const there = dataOf<MemberView>(await s.getMember(m.id));
      expect(there.membership.daysLeft).toBe(gap);
    } finally {
      await s.setSettings({ timezone: "Asia/Kolkata" });
    }
  });
});

describe("membership status changes with the dates, never with a stored value (BR-REC-08)", () => {
  test("BR-REC-08 renewing an ended member makes them Active again, without any status being typed", async () => {
    const m = await s.seedMember({
      name: "Zmat Renew Flow",
      periods: [{ plan: "annual", startOn: s.day(-400), endOn: s.day(-36) }],
    });
    expect(dataOf<MemberView>(await s.getMember(m.id)).membership.status).toBe(
      "expired",
    );
    const renewed = await s.addPeriod(m.id, {
      plan: "annual",
      startOn: s.day(-35),
    });
    expect(renewed.status).toBe(201);
    const member = dataOf<MemberView>(await s.getMember(m.id));
    expect(member.membership.status).toBe("active");
    expect(member.membership.startOn).toBe(s.day(-35));
  });

  test("BR-REC-08 editing the plan of the latest period moves the end and the status with it", async () => {
    // annual from 100 days ago is Active; as a monthly it ended long ago
    const m = await s.seedMember({
      name: "Zmat Plan Flow",
      periods: [{ plan: "annual", startOn: s.day(-100) }],
    });
    expect(dataOf<MemberView>(await s.getMember(m.id)).membership.status).toBe(
      "active",
    );
    const edit = await s.editPeriod(m.id, m.periodIds[0] as string, {
      plan: "monthly",
    });
    expect(edit.status).toBe(200);
    const member = dataOf<MemberView>(await s.getMember(m.id));
    expect(member.membership.status).toBe("expired");
    expect(member.membership.plan).toBe("monthly");
  });
});
