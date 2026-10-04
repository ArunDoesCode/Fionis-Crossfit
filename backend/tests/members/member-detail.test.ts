import { describe, expect, test } from "bun:test";
import { UNKNOWN_ID } from "../helpers/http";
import {
  ageOnDay,
  birthdayOffset,
  dataOf,
  expectError,
  expectMemberShape,
  type MemberView,
  startFor,
  statusOracle,
  useMembersSuite,
} from "./support/suite";

// E18 GET /api/members/:memberId: one member with membership and periods.
// BR-REC-03 (age from the date of birth), BR-REC-52 (status from the latest period),
// BR-REC-59 (what the member page shows), BR-REC-172 (archivedAt + membership.endOn
// carry the banner), BR-REC-58 (an archived member is returned like any other).

const s = useMembersSuite();

const ISO_MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe("E18 what the member page needs (BR-REC-59)", () => {
  test("BR-REC-59 name, age, sex, phone, join date and the membership (plan, status, days left, end date) are there", async () => {
    const today = s.today();
    const startOn = s.day(-100);
    const endOn = s.day(141);
    const seeded = await s.seedMember({
      name: "Surya Pratap",
      phone: "+919845012345",
      email: "surya@example.com",
      dateOfBirth: "1982-05-10",
      sex: "male",
      joinedOn: s.day(-120),
      objective: "strength",
      notes: "Left shoulder",
      periods: [{ plan: "annual", startOn, endOn }],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member).toMatchObject({
      id: seeded.id,
      fullName: seeded.fullName,
      phone: "+919845012345",
      email: "surya@example.com",
      dateOfBirth: "1982-05-10",
      age: ageOnDay("1982-05-10", today),
      sex: "male",
      joinedOn: s.day(-120),
      objective: "strength",
      notes: "Left shoulder",
      archivedAt: null,
      membership: {
        status: "active",
        plan: "annual",
        startOn,
        endOn,
        daysLeft: 141,
      },
    });
  });

  test("BR-REC-59 the answer has exactly the E18 fields", async () => {
    const m = await s.seedMember({ name: "Shape Detail" });
    expectMemberShape(dataOf<MemberView>(await s.getMember(m.id)));
  });

  test("BR-REC-03 optional email, objective and notes that were never given come back as null", async () => {
    const seeded = await s.seedMember({ name: "No Extras" });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.email).toBeNull();
    expect(member.objective).toBeNull();
    expect(member.notes).toBeNull();
  });

  test("BR-REC-59 the periods list holds every period, each with id, plan, start and end", async () => {
    const first = {
      plan: "annual" as const,
      startOn: s.day(-500),
      endOn: s.day(-136),
    };
    const second = {
      plan: "monthly" as const,
      startOn: s.day(-135),
      endOn: s.day(-106),
    };
    const seeded = await s.seedMember({
      name: "Two Periods",
      periods: [first, second],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.periods).toHaveLength(2);
    for (const period of member.periods) {
      expect(Object.keys(period).sort()).toEqual([
        "endOn",
        "id",
        "plan",
        "startOn",
      ]);
    }
    expect(member.periods.map((p) => p.id).sort()).toEqual(
      [...seeded.periodIds].sort(),
    );
  });

  test("BR-REC-59 periods are listed newest first (start date descending)", async () => {
    const seeded = await s.seedMember({
      name: "Ordered Periods",
      periods: [
        { plan: "monthly", startOn: s.day(-300), endOn: s.day(-271) },
        { plan: "monthly", startOn: s.day(-100), endOn: s.day(-71) },
        { plan: "monthly", startOn: s.day(-200), endOn: s.day(-171) },
      ],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.periods.map((p) => p.startOn)).toEqual([
      s.day(-100),
      s.day(-200),
      s.day(-300),
    ]);
  });

  test("BR-REC-52 the membership comes from the latest period by start, whatever the order they were stored in", async () => {
    const seeded = await s.seedMember({
      name: "Latest By Start",
      // the latest period is stored first, the oldest last
      periods: [
        { plan: "quarterly", startOn: s.day(-20), endOn: s.day(70) },
        { plan: "annual", startOn: s.day(-400), endOn: s.day(-36) },
        { plan: "monthly", startOn: s.day(-35), endOn: s.day(-21) },
      ],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.membership).toMatchObject({
      plan: "quarterly",
      startOn: s.day(-20),
      endOn: s.day(70),
      status: "active",
      daysLeft: 70,
    });
  });

  test("BR-REC-52 when every period has ended, the status is Ended with the days since the newest period ended", async () => {
    const seeded = await s.seedMember({
      name: "All Ended",
      periods: [
        { plan: "monthly", startOn: s.day(-60), endOn: s.day(-31) },
        { plan: "monthly", startOn: s.day(-30), endOn: s.day(-1) },
      ],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.membership).toMatchObject({
      status: "expired",
      endOn: s.day(-1),
      daysLeft: -1,
    });
  });

  test("BR-REC-52 renewed early: the next period exists and has not started, so the member is Active, not Ends soon", async () => {
    const seeded = await s.seedMember({
      name: "Renewed Early",
      periods: [
        { plan: "monthly", startOn: s.day(-25), endOn: s.day(4) },
        { plan: "annual", startOn: s.day(5), endOn: s.day(369) },
      ],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.membership).toMatchObject({
      status: "active",
      plan: "annual",
      startOn: s.day(5),
      endOn: s.day(369),
      daysLeft: 369,
    });
  });

  test("BR-REC-52 a membership that ended yesterday shows daysLeft -1 and Ended", async () => {
    const endOn = s.day(-1);
    const startOn = startFor("annual", endOn);
    const seeded = await s.seedMember({
      name: "Ended Yesterday",
      periods: [{ plan: "annual", startOn, endOn }],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.membership).toMatchObject({
      status: "expired",
      daysLeft: -1,
      endOn,
    });
  });

  test("BR-REC-52 the summary equals the rule applied to the latest period (lead 14)", async () => {
    const today = s.today();
    const period = { startOn: s.day(-355), endOn: s.day(10) };
    const seeded = await s.seedMember({
      name: "Rule Check",
      periods: [{ plan: "annual", ...period }],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    const expected = statusOracle(period, today, 14);
    expect(member.membership.status).toBe(expected.status);
    expect(member.membership.daysLeft).toBe(expected.daysLeft);
  });
});

describe("E18 age is computed from the date of birth (BR-REC-03)", () => {
  const CASES: [string, number, number, number][] = [
    // [label, years ago, shift in days, expected age]
    ["the 30th birthday is today", 30, 0, 30],
    ["the 30th birthday was yesterday", 30, -1, 30],
    ["the 30th birthday is tomorrow", 30, 1, 29],
    ["born exactly 44 years ago today", 44, 0, 44],
    ["a baby born a few days ago", 0, -3, 0],
  ];
  for (const [label, years, shift, age] of CASES) {
    test(`BR-REC-03 ${label}: age ${age}`, async () => {
      const today = s.today();
      const dateOfBirth = birthdayOffset(today, years, shift);
      const seeded = await s.seedMember({
        name: `Age ${years} ${shift}`,
        dateOfBirth,
      });
      const member = dataOf<MemberView>(await s.getMember(seeded.id));
      expect(member.age).toBe(age);
      expect(member.age).toBe(ageOnDay(dateOfBirth, today));
    });
  }

  test("BR-REC-03 DOB 1982-05-10 is age 44 from 10 May 2026 to 9 May 2027 (the spec example)", async () => {
    const today = s.today();
    const seeded = await s.seedMember({
      name: "Spec Example",
      dateOfBirth: "1982-05-10",
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    if (today >= "2026-05-10" && today <= "2027-05-09") {
      expect(member.age).toBe(44);
    } else {
      expect(member.age).toBe(ageOnDay("1982-05-10", today));
    }
  });
});

describe("E18 archived members and the banner data (BR-REC-58, 172)", () => {
  test("BR-REC-58 an archived member is returned like any other, with archivedAt as an ISO UTC moment", async () => {
    const archivedAt = new Date(Date.now() - 2 * 86_400_000);
    const seeded = await s.seedMember({
      name: "Archived Surya",
      archived: archivedAt,
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.id).toBe(seeded.id);
    expect(member.archivedAt).toMatch(ISO_MOMENT);
    expect(new Date(member.archivedAt as string).getTime()).toBe(
      archivedAt.getTime(),
    );
  });

  test("BR-REC-172 ended and not archived: archivedAt is null and the membership shows it ended with its end date", async () => {
    const endOn = s.day(-40);
    const seeded = await s.seedMember({
      name: "Ended Not Archived",
      periods: [{ plan: "annual", startOn: s.day(-404), endOn }],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.archivedAt).toBeNull();
    expect(member.membership.status).toBe("expired");
    expect(member.membership.endOn).toBe(endOn);
  });

  test("BR-REC-172 archived while running: archivedAt is set and the membership is still running with its end date", async () => {
    const endOn = s.day(200);
    const seeded = await s.seedMember({
      name: "Archived Running",
      archived: true,
      periods: [{ plan: "annual", startOn: s.day(-165), endOn }],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.archivedAt).toMatch(ISO_MOMENT);
    expect(member.membership.status).toBe("active");
    expect(member.membership.endOn).toBe(endOn);
  });

  test("BR-REC-172 archived and ended: both archivedAt and the ended membership are there", async () => {
    const endOn = s.day(-130);
    const seeded = await s.seedMember({
      name: "Archived Ended",
      archived: true,
      periods: [{ plan: "annual", startOn: s.day(-494), endOn }],
    });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    expect(member.archivedAt).toMatch(ISO_MOMENT);
    expect(member.membership.status).toBe("expired");
    expect(member.membership.endOn).toBe(endOn);
  });
});

describe("E18 errors and envelope (BR-REC-154)", () => {
  test("BR-REC-154 an id that exists nowhere is 404 NOT_FOUND", async () => {
    expectError(await s.getMember(UNKNOWN_ID), 404, "NOT_FOUND");
  });

  test("BR-REC-154 a malformed id is 400 VALIDATION_ERROR, not 404", async () => {
    expectError(await s.get("/api/members/not-an-id"), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-154 success is { success: true, data } and answers 200", async () => {
    const seeded = await s.seedMember({ name: "Envelope" });
    const reply = await s.getMember(seeded.id);
    expect(reply.status).toBe(200);
    expect(reply.body?.success).toBe(true);
    expect(reply.body?.data).toBeDefined();
  });

  test("BR-REC-153 days are YYYY-MM-DD and no calendar field is a moment", async () => {
    const seeded = await s.seedMember({ name: "Formats" });
    const member = dataOf<MemberView>(await s.getMember(seeded.id));
    const day = /^\d{4}-\d{2}-\d{2}$/;
    expect(member.dateOfBirth).toMatch(day);
    expect(member.joinedOn).toMatch(day);
    expect(member.membership.startOn).toMatch(day);
    expect(member.membership.endOn).toMatch(day);
    for (const period of member.periods) {
      expect(period.startOn).toMatch(day);
      expect(period.endOn).toMatch(day);
    }
  });
});
