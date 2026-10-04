import { describe, expect, test } from "bun:test";

import {
  addDays,
  type DueRow,
  daysBetween,
  type MemberDueRow,
  type TestMember,
  type TestType,
  todayIn,
  useDueSuite,
} from "./support";

// "Today" and "Due soon days" come from Setup, read per request (BR-REC-93, 96; contract "All four
// endpoints"): the gym's time zone decides today, `upcomingLeadDays` the window, and with no
// settings row the Setup defaults (Asia/Kolkata, 7 days) apply.

const s = useDueSuite();

const KIRITIMATI = "Pacific/Kiritimati"; // UTC+14: its date is 1-2 days ahead of Pago Pago
const PAGO_PAGO = "Pacific/Pago_Pago"; // UTC-11

/** A member with a Weight due `offset` days from the gym's today (as `s.today()` sees it now). */
async function dueIn(type: TestType, offset: number): Promise<TestMember> {
  const member = await s.makeMember({ joinedOn: addDays(s.today(), -400) });
  await s.setDueDates(member, type, { Weight: addDays(s.today(), offset) });
  return member;
}

const idsOf = (rows: DueRow[]) => rows.map((r) => r.memberId);

describe("BR-REC-96 Due soon days (Setup `upcomingLeadDays`)", () => {
  const windows: [number, number[], number[]][] = [
    // lead days, offsets inside the window, offsets outside
    [0, [0], [1, 2, 7]],
    [1, [0, 1], [2, 3]],
    [3, [0, 3], [4, 8]],
    [14, [0, 7, 14], [15, 16]],
    [30, [0, 15, 30], [31, 32]],
  ];
  for (const [lead, inside, outside] of windows) {
    test(`BR-REC-96 Due soon ${lead} day${lead === 1 ? "" : "s"}: due in ${inside.join(", ")} listed; in ${outside.join(", ")} not`, async () => {
      await s.setSettings({ upcomingLeadDays: lead });
      const type = await s.makeWeeklyType(["Weight"]);
      const listed: [number, TestMember][] = [];
      for (const offset of inside)
        listed.push([offset, await dueIn(type, offset)]);
      const left: TestMember[] = [];
      for (const offset of outside) left.push(await dueIn(type, offset));

      const rows = await s.listAll("upcoming", { typeId: type.id });
      expect(idsOf(rows).sort()).toEqual(listed.map(([, m]) => m.id).sort());
      for (const [offset, member] of listed) {
        expect(rows.find((r) => r.memberId === member.id)?.daysOverdue).toBe(
          0 - offset,
        );
      }
      for (const member of left) expect(idsOf(rows)).not.toContain(member.id);
      // a window never makes anything overdue
      expect(await s.listAll("overdue", { typeId: type.id })).toEqual([]);
    });
  }

  test("BR-REC-96 the window is read at every request: a changed setting applies at once", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await dueIn(type, 10);
    expect(await s.listAll("upcoming", { typeId: type.id })).toEqual([]);
    await s.setSettings({ upcomingLeadDays: 12 });
    expect(idsOf(await s.listAll("upcoming", { typeId: type.id }))).toEqual([
      member.id,
    ]);
    await s.setSettings({ upcomingLeadDays: 9 });
    expect(await s.listAll("upcoming", { typeId: type.id })).toEqual([]);
  });

  test("BR-REC-96 the window also decides which measurements are chips of a row", async () => {
    await s.setSettings({ upcomingLeadDays: 3 });
    const type = await s.makeWeeklyType(["Weight", "Body fat", "Muscle mass"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, {
      Weight: s.day(-1),
      "Body fat": s.day(3),
      "Muscle mass": s.day(4),
    });
    const [row] = await s.listAll("overdue", { typeId: type.id });
    expect(row?.items.map((i) => i.name)).toEqual(["Weight", "Body fat"]);
  });

  test("BR-REC-96 / BR-REC-103 the member page uses the same window for `upcoming` and `ok`", async () => {
    await s.setSettings({ upcomingLeadDays: 2 });
    const type = await s.makeWeeklyType(["Weight"]);
    const inside = await dueIn(type, 2);
    const outside = await dueIn(type, 3);
    expect((await s.memberLine(inside.id, type.id)).state).toBe("upcoming");
    expect((await s.memberLine(outside.id, type.id)).state).toBe("ok");
  });
});

describe("BR-REC-93 today is the calendar date in the gym's time zone", () => {
  test("BR-REC-93 with Pacific/Kiritimati: a row due on that zone's today is 'due today' (0 days)", async () => {
    await s.setSettings({ timezone: KIRITIMATI });
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await dueIn(type, 0);
    expect(s.today()).toBe(todayIn(KIRITIMATI));
    const rows = await s.listAll("upcoming", { typeId: type.id });
    const row = rows.find((r) => r.memberId === member.id);
    expect(row?.dueOn).toBe(todayIn(KIRITIMATI));
    expect(row?.daysOverdue).toBe(0);
  });

  test("BR-REC-93 the same data read in another zone gives another daysOverdue (the date there differs)", async () => {
    await s.setSettings({ timezone: KIRITIMATI });
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await dueIn(type, 0);
    const dueOn = todayIn(KIRITIMATI);

    await s.setSettings({ timezone: PAGO_PAGO });
    const there = todayIn(PAGO_PAGO);
    expect(there).not.toBe(dueOn); // Kiritimati is 25 hours ahead of Pago Pago
    const rows = await s.listAll("upcoming", { typeId: type.id });
    const row = rows.find((r) => r.memberId === member.id);
    expect(row?.dueOn).toBe(dueOn);
    expect(row?.daysOverdue).toBe(daysBetween(dueOn, there));
    expect(row?.daysOverdue).toBeLessThan(0);
  });

  test("BR-REC-93 a row due on the date of the zone behind is overdue in the zone ahead, by the date gap", async () => {
    // Pago Pago's today is Kiritimati's today minus 1 or 2 days: due on Pago Pago's today
    // is overdue in Kiritimati by exactly that many days
    await s.setSettings({ timezone: PAGO_PAGO });
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await dueIn(type, 0);
    const dueOn = todayIn(PAGO_PAGO);

    await s.setSettings({ timezone: KIRITIMATI });
    const ahead = todayIn(KIRITIMATI);
    const gap = daysBetween(dueOn, ahead);
    expect(gap).toBeGreaterThanOrEqual(1);
    const rows = await s.listAll("overdue", { typeId: type.id });
    const row = rows.find((r) => r.memberId === member.id);
    expect(row?.daysOverdue).toBe(gap);
  });

  test("BR-REC-93 E32 counts days from the gym's today too", async () => {
    await s.setSettings({ timezone: KIRITIMATI });
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await dueIn(type, 0);
    const dueOn = todayIn(KIRITIMATI);
    await s.setSettings({ timezone: PAGO_PAGO });
    const line: MemberDueRow = await s.memberLine(member.id, type.id);
    expect(line.nextDueOn).toBe(dueOn);
    expect(line.daysOverdue).toBe(daysBetween(dueOn, todayIn(PAGO_PAGO)));
  });

  test("BR-REC-93 the Asia/Kolkata default: a row due on the Kolkata date is due today", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const kolkata = todayIn("Asia/Kolkata");
    await s.setDueDates(member, type, { Weight: kolkata });
    const rows = await s.listAll("upcoming", { typeId: type.id });
    const row = rows.find((r) => r.memberId === member.id);
    expect(row?.daysOverdue).toBe(0);
  });
});

describe("no settings row: the Setup defaults apply (Asia/Kolkata and 7 days)", () => {
  test("with no gym settings row the window is 7 days: due in 7 listed, in 8 not", async () => {
    await s.removeSettings();
    const type = await s.makeWeeklyType(["Weight"]);
    const seven = await dueIn(type, 7);
    const eight = await dueIn(type, 8);
    const rows = await s.listAll("upcoming", { typeId: type.id });
    expect(idsOf(rows)).toEqual([seven.id]);
    expect(idsOf(rows)).not.toContain(eight.id);
  });

  test("with no gym settings row today is the Asia/Kolkata date", async () => {
    await s.removeSettings();
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({
      joinedOn: addDays(todayIn("Asia/Kolkata"), -400),
    });
    await s.setDueDates(member, type, { Weight: todayIn("Asia/Kolkata") });
    const rows = await s.listAll("upcoming", { typeId: type.id });
    expect(rows.find((r) => r.memberId === member.id)?.daysOverdue).toBe(0);
  });

  test("with no gym settings row E32 answers too (no 500)", async () => {
    await s.removeSettings();
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await dueIn(type, 3);
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("upcoming");
    expect(line.daysOverdue).toBe(-3);
  });
});
