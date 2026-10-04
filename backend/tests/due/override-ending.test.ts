import { describe, expect, test } from "bun:test";

import {
  type DueRow,
  type TestMember,
  type TestType,
  useDueSuite,
} from "./support";

// When an Assess soon or Remind me later is over (BR-REC-18, 98, 99; due-list.md C6, C7), read through
// E31 and E32. Overrides are inserted straight into `due_overrides` with explicit timestamps; "a save"
// is an `assessments` row with an explicit `updated_at` (E25-E30 are not needed). Nothing is written
// when an override ends: the row stays and the answers behave as if it were not there.

const s = useDueSuite();
const DAY = 86_400_000;
const NOW = () => Date.now();

type Fixture = { type: TestType; member: TestMember; createdAt: Date };

/** Assess soon set 2 days ago, a member with nothing due (the one row exists only while the flag is on). */
async function flagFixture(): Promise<Fixture> {
  const type = await s.makeWeeklyType(["Weight"]);
  const member = await s.makeMember({ joinedOn: s.day(-400) });
  // value dated BEFORE the day the flag was set: due in 23 days, and not a save that could end it
  await s.record(member.id, type.id, s.day(-5), [type.metrics[0]?.id ?? ""]);
  const createdAt = new Date(NOW() - 2 * DAY);
  await s.insertOverride({
    memberId: member.id,
    typeId: type.id,
    kind: "flag",
    setOn: s.day(-2),
    createdAt,
  });
  return { type, member, createdAt };
}

/** Remind me later (until in 10 days) set 2 days ago, for a member who is overdue by 3 days. */
async function snoozeFixture(): Promise<Fixture> {
  const type = await s.makeWeeklyType(["Weight"]);
  const member = await s.makeMember({ joinedOn: s.day(-400) });
  await s.record(member.id, type.id, s.day(-31), [type.metrics[0]?.id ?? ""]); // due 3 days ago
  const createdAt = new Date(NOW() - 2 * DAY);
  await s.insertOverride({
    memberId: member.id,
    typeId: type.id,
    kind: "snooze",
    setOn: s.day(-2),
    untilOn: s.day(10),
    createdAt,
  });
  return { type, member, createdAt };
}

/** The member's row in Overdue, or undefined. */
async function overdueRow(f: Fixture): Promise<DueRow | undefined> {
  const rows = await s.listAll("overdue", { typeId: f.type.id });
  return rows.find((r) => r.memberId === f.member.id);
}

/** A save of the assessment: no values (the due dates stay as they were), explicit dates. */
const save = (
  f: Fixture,
  assessedOn: string,
  updatedAt: Date,
  who: { member?: TestMember; type?: TestType } = {},
) =>
  s.record(
    (who.member ?? f.member).id,
    (who.type ?? f.type).id,
    assessedOn,
    [],
    {
      updatedAt,
    },
  );

describe("Assess soon is over when a save made after it was set is dated on or after the day it was set (C6)", () => {
  test("BR-REC-18 before any save the member is a flagged row; E32 says flagged", async () => {
    const f = await flagFixture();
    const row = await overdueRow(f);
    expect(row?.flagged).toBe(true);
    expect((await s.memberLine(f.member.id, f.type.id)).flagged).toBe(true);
  });

  test("BR-REC-18 a save after setting, dated today, ends it: the row is gone and E32 says not flagged", async () => {
    const f = await flagFixture();
    await save(f, s.today(), new Date(NOW() + 60_000));
    expect(await overdueRow(f)).toBeUndefined();
    expect((await s.memberLine(f.member.id, f.type.id)).flagged).toBe(false);
  });

  test("BR-REC-98 a save dated the day the flag was set ends it (on or after)", async () => {
    const f = await flagFixture();
    await save(f, s.day(-2), new Date(NOW() - DAY));
    expect(await overdueRow(f)).toBeUndefined();
  });

  test("BR-REC-98 a save dated after that day ends it", async () => {
    const f = await flagFixture();
    await save(f, s.day(-1), new Date(NOW() - DAY));
    expect(await overdueRow(f)).toBeUndefined();
  });

  test("Case 15 BR-REC-98 a back-filled save dated before the day it was set does not end it", async () => {
    const f = await flagFixture();
    await save(f, s.day(-10), new Date(NOW() - DAY)); // saved after setting, dated 10 days ago
    const row = await overdueRow(f);
    expect(row?.flagged).toBe(true);
    expect((await s.memberLine(f.member.id, f.type.id)).flagged).toBe(true);
  });

  test("BR-REC-98 a save dated the day before the flag was set does not end it, even when saved just now", async () => {
    const f = await flagFixture();
    await save(f, s.day(-3), new Date(NOW()));
    expect((await overdueRow(f))?.flagged).toBe(true);
  });

  test("C6 a save dated on or after the day set but made BEFORE the flag was set does not end it", async () => {
    const f = await flagFixture();
    await save(f, s.day(-2), new Date(f.createdAt.getTime() - 3_600_000));
    expect((await overdueRow(f))?.flagged).toBe(true);
  });

  test("C6 a save made at the very moment the flag was set (and dated that day) ends it: not earlier than, i.e. >=", async () => {
    const f = await flagFixture();
    await save(f, s.day(-2), f.createdAt);
    expect(await overdueRow(f)).toBeUndefined();
  });

  test("C6 a save of another assessment does not end it", async () => {
    const f = await flagFixture();
    const other = await s.makeWeeklyType(["Push-ups"]);
    await save(f, s.today(), new Date(NOW() + 60_000), { type: other });
    expect((await overdueRow(f))?.flagged).toBe(true);
  });

  test("C6 a save for another member does not end it", async () => {
    const f = await flagFixture();
    const other = await s.makeMember({ joinedOn: s.day(-400) });
    await save(f, s.today(), new Date(NOW() + 60_000), { member: other });
    expect((await overdueRow(f))?.flagged).toBe(true);
  });

  test("C6 any one qualifying save is enough, however many back-fills come first", async () => {
    const f = await flagFixture();
    await save(f, s.day(-20), new Date(NOW() - DAY));
    await save(f, s.day(-30), new Date(NOW() - DAY));
    expect((await overdueRow(f))?.flagged).toBe(true);
    await save(f, s.day(-1), new Date(NOW() - DAY));
    expect(await overdueRow(f)).toBeUndefined();
  });

  test("C6 when it ends the due_overrides row stays: nothing is written by the save", async () => {
    const f = await flagFixture();
    await save(f, s.today(), new Date(NOW() + 60_000));
    expect(await overdueRow(f)).toBeUndefined();
    const rows = await s.overrideRows(f.member.id, f.type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("flag");
    expect(rows[0]?.setOn).toBe(s.day(-2));
  });

  test("BR-REC-98 an ended Assess soon leaves the member's normal dates: a member who is also due still has a normal row", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const [weight, bodyFat] = type.metrics;
    await s.record(member.id, type.id, s.day(-31), [weight?.id ?? ""]); // Weight due 3 days ago
    await s.record(member.id, type.id, s.day(-3), [bodyFat?.id ?? ""]); // Body fat due in 25 days
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.day(-2),
      createdAt: new Date(NOW() - 2 * DAY),
    });
    const flagged = (await s.listAll("overdue", { typeId: type.id })).find(
      (r) => r.memberId === member.id,
    );
    expect(flagged?.flagged).toBe(true);
    expect(flagged?.items.map((i) => i.name)).toEqual(["Weight", "Body fat"]);

    await s.record(member.id, type.id, s.today(), [], {
      updatedAt: new Date(NOW() + 60_000),
    });
    const normal = (await s.listAll("overdue", { typeId: type.id })).find(
      (r) => r.memberId === member.id,
    );
    expect(normal?.flagged).toBe(false);
    expect(normal?.items.map((i) => i.name)).toEqual(["Weight"]);
    expect(normal?.daysOverdue).toBe(3);
  });
});

describe("Remind me later is over by the same rule (C6)", () => {
  test("BR-REC-99 while on, the member is hidden from Overdue and E32 shows the reminder day", async () => {
    const f = await snoozeFixture();
    expect(await overdueRow(f)).toBeUndefined();
    const line = await s.memberLine(f.member.id, f.type.id);
    expect(line.snoozedUntil).toBe(s.day(10));
    expect(line.flagged).toBe(false);
    // dates only: still overdue by 3 days
    expect(line.state).toBe("overdue");
    expect(line.daysOverdue).toBe(3);
  });

  test("BR-REC-99 a save after setting, dated on or after the day it was set, ends it: the row is back with its normal dates", async () => {
    const f = await snoozeFixture();
    await save(f, s.day(-1), new Date(NOW() - DAY));
    const row = await overdueRow(f);
    expect(row?.flagged).toBe(false);
    expect(row?.daysOverdue).toBe(3);
    expect(
      (await s.memberLine(f.member.id, f.type.id)).snoozedUntil,
    ).toBeNull();
  });

  test("BR-REC-99 a save dated the day the reminder was set ends it", async () => {
    const f = await snoozeFixture();
    await save(f, s.day(-2), new Date(NOW() + 60_000));
    expect(await overdueRow(f)).toBeDefined();
  });

  test("BR-REC-99 a back-filled save dated before the day it was set does not end it", async () => {
    const f = await snoozeFixture();
    await save(f, s.day(-10), new Date(NOW() - DAY));
    expect(await overdueRow(f)).toBeUndefined();
    expect((await s.memberLine(f.member.id, f.type.id)).snoozedUntil).toBe(
      s.day(10),
    );
  });

  test("C6 a save made before the reminder was set does not end it", async () => {
    const f = await snoozeFixture();
    await save(f, s.day(-2), new Date(f.createdAt.getTime() - 3_600_000));
    expect(await overdueRow(f)).toBeUndefined();
  });

  test("C6 a save of another assessment or by another member does not end it", async () => {
    const f = await snoozeFixture();
    const other = await s.makeWeeklyType(["Push-ups"]);
    const stranger = await s.makeMember({ joinedOn: s.day(-400) });
    await save(f, s.today(), new Date(NOW() + 60_000), { type: other });
    await save(f, s.today(), new Date(NOW() + 60_000), { member: stranger });
    expect(await overdueRow(f)).toBeUndefined();
  });

  test("C6 when it ends the due_overrides row stays", async () => {
    const f = await snoozeFixture();
    await save(f, s.today(), new Date(NOW() + 60_000));
    expect(await overdueRow(f)).toBeDefined();
    const rows = await s.overrideRows(f.member.id, f.type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("snooze");
    expect(rows[0]?.untilOn).toBe(s.day(10));
  });
});

describe("C7 a reminder hides the row while today is before the until day", () => {
  /** An overdue member (Weight due 3 days ago) with a reminder set 10 days ago, until `untilOn`. */
  async function reminderUntil(untilOn: string) {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.record(member.id, type.id, s.day(-31), [type.metrics[0]?.id ?? ""]);
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "snooze",
      setOn: s.day(-10),
      untilOn,
      createdAt: new Date(NOW() - 10 * DAY),
    });
    return { type, member };
  }
  const visible = async (f: { type: TestType; member: TestMember }) =>
    (await s.listAll("overdue", { typeId: f.type.id })).some(
      (r) => r.memberId === f.member.id,
    );

  test("Case 13 BR-REC-99 until tomorrow: hidden today", async () => {
    const f = await reminderUntil(s.day(1));
    expect(await visible(f)).toBe(false);
    expect((await s.memberLine(f.member.id, f.type.id)).snoozedUntil).toBe(
      s.day(1),
    );
  });

  test("Case 13 C7 until today: the row is back today (on the until day)", async () => {
    const f = await reminderUntil(s.today());
    expect(await visible(f)).toBe(true);
    expect(
      (await s.memberLine(f.member.id, f.type.id)).snoozedUntil,
    ).toBeNull();
  });

  test("C7 until yesterday: the row is shown", async () => {
    const f = await reminderUntil(s.day(-1));
    expect(await visible(f)).toBe(true);
    expect(
      (await s.memberLine(f.member.id, f.type.id)).snoozedUntil,
    ).toBeNull();
  });

  test("BR-REC-99 until 80 days from now: hidden", async () => {
    const f = await reminderUntil(s.day(80));
    expect(await visible(f)).toBe(false);
  });

  test("BR-REC-99 a reminder hides the row in Due soon too", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(3) });
    expect(
      (await s.listAll("upcoming", { typeId: type.id })).map((r) => r.memberId),
    ).toEqual([member.id]);
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "snooze",
      setOn: s.today(),
      untilOn: s.day(20),
    });
    expect(await s.listAll("upcoming", { typeId: type.id })).toEqual([]);
    const reply = await s.list({ status: "upcoming", typeId: type.id });
    expect(reply.body?.meta).toMatchObject({ total: 0 });
  });

  test("BR-REC-99 a reminder hides one member + assessment only: the member's other assessment and other members stay", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 240_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 240_002 });
    const snoozed = await s.makeMember({
      name: "snoozed",
      joinedOn: s.day(-400),
    });
    const other = await s.makeMember({ name: "other", joinedOn: s.day(-400) });
    for (const m of [snoozed, other]) {
      await s.setDueDates(m, a, { Weight: s.day(-3) });
      await s.setDueDates(m, b, { "Push-ups": s.day(-3) });
    }
    await s.insertOverride({
      memberId: snoozed.id,
      typeId: a.id,
      kind: "snooze",
      setOn: s.today(),
      untilOn: s.day(20),
    });
    const rows = await s.listAll("overdue", { typeIds: [a.id, b.id] });
    expect(rows.map((r) => [r.memberId, r.typeId])).toEqual([
      [other.id, a.id],
      [other.id, b.id],
      [snoozed.id, b.id],
    ]);
  });
});
