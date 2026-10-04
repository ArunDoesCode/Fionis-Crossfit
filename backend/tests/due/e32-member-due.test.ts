import { describe, expect, test } from "bun:test";

import { UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  expectError,
  MEMBER_DUE_ROW_KEYS,
  type MemberDueRow,
  useDueSuite,
} from "./support";

// E32 GET /api/members/:memberId/due (BR-REC-103, 15, 17, 95, 96, 105; due-list.md C1, C3, C10).
// One entry per turned-on assessment (with a turned-on measurement), in setup order. The state is
// worked out from dates alone; Assess soon and reminders only add `flagged` / `snoozedUntil`.

const s = useDueSuite();
const names = (line: MemberDueRow) => line.items.map((i) => i.name);

describe("the answer: a plain array of lines (C10)", () => {
  test("a line has exactly these fields, and the answer has no meta", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(-3) });
    const reply = await s.memberDue(member.id);
    expect(reply.status).toBe(200);
    expect(reply.body?.success).toBe(true);
    expect(Array.isArray(reply.body?.data)).toBe(true);
    expect(reply.body?.meta).toBeUndefined();
    const line = await s.memberLine(member.id, type.id);
    expect(Object.keys(line).sort()).toEqual(MEMBER_DUE_ROW_KEYS);
    expect(line.typeName).toBe(type.name);
    expect(line.items[0]).toEqual({
      metricId: type.metrics[0]?.id ?? "",
      name: "Weight",
    });
  });

  test("an unknown member is 404 NOT_FOUND", async () => {
    expectError(await s.memberDue(UNKNOWN_ID), 404, "NOT_FOUND");
  });

  test("one line per turned-on assessment, in setup order (not creation or name order)", async () => {
    const third = await s.makeWeeklyType(["X"], {
      sortOrder: 300_003,
      name: `TEST_due_aaa_${crypto.randomUUID()}`,
    });
    const first = await s.makeWeeklyType(["X"], {
      sortOrder: 300_001,
      name: `TEST_due_zzz_${crypto.randomUUID()}`,
    });
    const second = await s.makeWeeklyType(["X"], {
      sortOrder: 300_002,
      name: `TEST_due_mmm_${crypto.randomUUID()}`,
    });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const lines = await s.memberLines(member.id, [
      third.id,
      first.id,
      second.id,
    ]);
    expect(lines.map((l) => l.typeId)).toEqual([first.id, second.id, third.id]);
  });

  test("a turned-off assessment has no line", async () => {
    const on = await s.makeWeeklyType(["Weight"], { sortOrder: 300_011 });
    const off = await s.makeWeeklyType(["Weight"], {
      sortOrder: 300_012,
      isActive: false,
    });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const lines = await s.memberLines(member.id, [on.id, off.id]);
    expect(lines.map((l) => l.typeId)).toEqual([on.id]);
  });

  test("C1 an assessment without a turned-on measurement has no line (none at all, or all turned off)", async () => {
    const empty = await s.makeType({ sortOrder: 300_021 });
    const allOff = await s.makeWeeklyType(["Weight", "Body fat"], {
      sortOrder: 300_022,
    });
    for (const metric of allOff.metrics)
      await s.setMetricActive(metric.id, false);
    const fine = await s.makeWeeklyType(["Weight"], { sortOrder: 300_023 });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const lines = await s.memberLines(member.id, [
      empty.id,
      allOff.id,
      fine.id,
    ]);
    expect(lines.map((l) => l.typeId)).toEqual([fine.id]);
  });

  test("a member with nothing recorded still gets a line for every turned-on assessment", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-10) });
    const line = await s.memberLine(member.id, type.id);
    expect(line.neverRecorded).toBe(true);
  });
});

describe("state, nextDueOn, daysOverdue and items come from the dates (BR-REC-15, 96, 105)", () => {
  test("Case 2 overdue: Weight due 3 days ago", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(-3) });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("overdue");
    expect(line.nextDueOn).toBe(s.day(-3));
    expect(line.daysOverdue).toBe(3);
    expect(names(line)).toEqual(["Weight"]);
    expect(line.neverRecorded).toBe(false);
    expect(line.flagged).toBe(false);
    expect(line.snoozedUntil).toBeNull();
  });

  test("Case 1 upcoming: Weight due in 7 days (daysOverdue is negative)", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(7) });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("upcoming");
    expect(line.nextDueOn).toBe(s.day(7));
    expect(line.daysOverdue).toBe(-7);
    expect(names(line)).toEqual(["Weight"]);
  });

  test("Case 7 upcoming: due today is 0 days and listed as upcoming (Due soon)", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.today() });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("upcoming");
    expect(line.daysOverdue).toBe(0);
  });

  test("ok: nothing due within the window; nextDueOn is the earliest due date, daysOverdue negative, no items", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, {
      Weight: s.day(8),
      "Body fat": s.day(20),
    });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("ok");
    expect(line.nextDueOn).toBe(s.day(8));
    expect(line.daysOverdue).toBe(-8);
    expect(line.items).toEqual([]);
    expect(line.neverRecorded).toBe(false);
  });

  test("nextDueOn is the earliest due date of the measurements, and items hold those due within the window", async () => {
    const type = await s.makeWeeklyType([
      "Weight",
      "Body fat",
      "Muscle mass",
      "Water",
    ]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, {
      Weight: s.day(5),
      "Body fat": s.day(-9),
      "Muscle mass": s.day(7),
      Water: s.day(8),
    });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("overdue");
    expect(line.nextDueOn).toBe(s.day(-9));
    expect(line.daysOverdue).toBe(9);
    expect(names(line)).toEqual(["Weight", "Body fat", "Muscle mass"]);
  });

  test("Case 4 never recorded: due on the join date", async () => {
    const type = await s.makeWeeklyType(["Pull-ups"]);
    const member = await s.makeMember({ joinedOn: s.day(-124) });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("overdue");
    expect(line.nextDueOn).toBe(s.day(-124));
    expect(line.daysOverdue).toBe(124);
    expect(line.neverRecorded).toBe(true);
    expect(names(line)).toEqual(["Pull-ups"]);
  });

  test("Case 14 BR-REC-95 a turned-off measurement is never an item and its date is not the next due date", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body age"]);
    await s.setMetricActive(type.metrics[1]?.id ?? "", false);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(20), "Body age": null });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("ok");
    expect(line.nextDueOn).toBe(s.day(20));
    expect(line.items).toEqual([]);
  });

  test("C1 each measurement's own repeat is used for nextDueOn", async () => {
    const type = await s.makeWeeklyType(["Fran"], { weeks: 4 });
    await s.setMetricInterval(type.metrics[0]?.id ?? "", 12, "week");
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.record(member.id, type.id, s.day(-40), [type.metrics[0]?.id ?? ""]);
    const line = await s.memberLine(member.id, type.id);
    expect(line.nextDueOn).toBe(s.day(-40 + 84));
    expect(line.state).toBe("ok");
  });

  test("Changing a repeat in Setup changes the next E32 answer (nothing is stored)", async () => {
    const type = await s.makeWeeklyType(["Weight"], { weeks: 4 });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.record(member.id, type.id, s.day(-20), [type.metrics[0]?.id ?? ""]);
    expect((await s.memberLine(member.id, type.id)).nextDueOn).toBe(s.day(8));
    await s.setTypeInterval(type.id, 2, "week");
    const line = await s.memberLine(member.id, type.id);
    expect(line.nextDueOn).toBe(s.day(-6));
    expect(line.state).toBe("overdue");
  });
});

describe("neverRecorded: no turned-on measurement of the assessment has a value (C10)", () => {
  test("true with no value at all, also when overdue", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-40) });
    const line = await s.memberLine(member.id, type.id);
    expect(line.neverRecorded).toBe(true);
    expect(line.state).toBe("overdue");
  });

  test("false as soon as one turned-on measurement has a value, even a very old one", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.record(member.id, type.id, s.day(-300), [
      type.metrics[1]?.id ?? "",
    ]);
    const line = await s.memberLine(member.id, type.id);
    expect(line.neverRecorded).toBe(false);
    expect(line.state).toBe("overdue");
  });

  test("a value of a turned-off measurement does not count", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body age"]);
    await s.setMetricActive(type.metrics[1]?.id ?? "", false);
    const member = await s.makeMember({ joinedOn: s.day(-40) });
    await s.record(member.id, type.id, s.day(-2), [type.metrics[1]?.id ?? ""]);
    expect((await s.memberLine(member.id, type.id)).neverRecorded).toBe(true);
  });

  test("another member's values do not count", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-40) });
    const other = await s.makeMember({ joinedOn: s.day(-40) });
    await s.setDueDates(other, type, {});
    expect((await s.memberLine(member.id, type.id)).neverRecorded).toBe(true);
    expect((await s.memberLine(other.id, type.id)).neverRecorded).toBe(false);
  });

  test("a value in another assessment does not count", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 310_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 310_002 });
    const member = await s.makeMember({ joinedOn: s.day(-40) });
    await s.setDueDates(member, b, {});
    expect((await s.memberLine(member.id, a.id)).neverRecorded).toBe(true);
    expect((await s.memberLine(member.id, b.id)).neverRecorded).toBe(false);
  });
});

describe("Assess soon and Remind me later on the member page (BR-REC-98, 99, 103; C10)", () => {
  test("Assess soon: flagged, every turned-on measurement as items, state still from the dates (ok)", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat", "Body age"]);
    await s.setMetricActive(type.metrics[2]?.id ?? "", false);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, {});
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    const line = await s.memberLine(member.id, type.id);
    expect(line.flagged).toBe(true);
    expect(line.snoozedUntil).toBeNull();
    expect(line.state).toBe("ok");
    expect(line.nextDueOn).toBe(s.day(28));
    expect(line.daysOverdue).toBe(-28);
    expect(names(line)).toEqual(["Weight", "Body fat"]);
  });

  test("Assess soon on a member who is overdue: flagged, state overdue, every measurement", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(-2) });
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    const line = await s.memberLine(member.id, type.id);
    expect(line.flagged).toBe(true);
    expect(line.state).toBe("overdue");
    expect(line.daysOverdue).toBe(2);
    expect(names(line)).toEqual(["Weight", "Body fat"]);
  });

  test("Remind me later: snoozedUntil set, flagged false; state, dates and items stay from the dates", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(-2) });
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "snooze",
      setOn: s.today(),
      untilOn: s.day(14),
    });
    const line = await s.memberLine(member.id, type.id);
    expect(line.snoozedUntil).toBe(s.day(14));
    expect(line.flagged).toBe(false);
    expect(line.state).toBe("overdue");
    expect(line.daysOverdue).toBe(2);
    expect(names(line)).toEqual(["Weight"]);
  });

  test("an override of one assessment does not show on the member's other assessment", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 320_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 320_002 });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.insertOverride({
      memberId: member.id,
      typeId: a.id,
      kind: "flag",
      setOn: s.today(),
    });
    const [lineA, lineB] = await s.memberLines(member.id, [a.id, b.id]);
    expect(lineA?.flagged).toBe(true);
    expect(lineB?.flagged).toBe(false);
  });

  test("an override of another member does not show", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const flagged = await s.makeMember({ joinedOn: s.day(-400) });
    const plain = await s.makeMember({ joinedOn: s.day(-400) });
    await s.insertOverride({
      memberId: flagged.id,
      typeId: type.id,
      kind: "snooze",
      setOn: s.today(),
      untilOn: s.day(5),
    });
    expect((await s.memberLine(plain.id, type.id)).snoozedUntil).toBeNull();
    expect((await s.memberLine(flagged.id, type.id)).snoozedUntil).toBe(
      s.day(5),
    );
  });
});

describe("C3 E32 answers for every member", () => {
  test("an archived member's page still has its lines", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({
      archived: true,
      joinedOn: s.day(-400),
    });
    await s.setDueDates(member, type, { Weight: s.day(-3) });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("overdue");
    expect(line.daysOverdue).toBe(3);
  });

  test("an Expired member's page still has its lines", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({
      joinedOn: s.day(-400),
      periods: [{ startOn: s.day(-400), endOn: s.day(-35) }],
    });
    await s.setDueDates(member, type, { Weight: s.day(-3) });
    const line = await s.memberLine(member.id, type.id);
    expect(line.state).toBe("overdue");
  });

  test("a member with no membership at all has lines", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400), periods: [] });
    await s.setDueDates(member, type, { Weight: s.day(4) });
    expect((await s.memberLine(member.id, type.id)).state).toBe("upcoming");
  });

  test("an archived member's Assess soon still shows on the member page", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({
      archived: true,
      joinedOn: s.day(-400),
    });
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    expect((await s.memberLine(member.id, type.id)).flagged).toBe(true);
  });
});

describe("the E32 answer agrees with E31 (BR-REC-16, 103)", () => {
  test("the member's row in E31 has the line's dates and items when the line is overdue", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat", "Muscle mass"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, {
      Weight: s.day(-6),
      "Body fat": s.day(2),
    });
    const line = await s.memberLine(member.id, type.id);
    const rows = await s.listAll("overdue", { typeId: type.id });
    const row = rows.find((r) => r.memberId === member.id);
    expect(row?.dueOn).toBe(line.nextDueOn);
    expect(row?.daysOverdue).toBe(line.daysOverdue);
    expect(row?.items).toEqual(line.items);
    expect(
      dataOf<MemberDueRow[]>(await s.memberDue(member.id)).length,
    ).toBeGreaterThan(0);
  });
});
