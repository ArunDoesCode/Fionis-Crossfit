import { describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  addDays,
  addMonths,
  type DueRow,
  dataOf,
  expectError,
  expectInvalid,
  type TestMember,
  type TestType,
  todayIn,
  useDueSuite,
} from "./support";

// E33 PUT / E34 DELETE /api/members/:memberId/due-actions/:typeId (BR-REC-18, 98, 99, 100, 158;
// due-list.md C6, C8, C9). Assess soon = { action: "flag" }; Remind me later = { action: "snooze", until }.

const s = useDueSuite();
const DAY = 86_400_000;

type SetResult = { kind: string; setOn: string; untilOn: string | null };

/** A weekly assessment (4 weeks) and a member who is overdue on it by 3 days. */
async function overdueMember(
  options: { archived?: boolean } = {},
): Promise<{ type: TestType; member: TestMember }> {
  const type = await s.makeWeeklyType(["Weight"]);
  const member = await s.makeMember({ joinedOn: s.day(-400), ...options });
  await s.setDueDates(member, type, { Weight: s.day(-3) });
  return { type, member };
}

const overdueRow = async (type: TestType, member: TestMember) =>
  (await s.listAll("overdue", { typeId: type.id })).find(
    (r: DueRow) => r.memberId === member.id,
  );

describe("E33 what it answers and stores (BR-REC-18, 98, 99)", () => {
  test("BR-REC-98 Assess soon: 200 { kind: flag, setOn: today, untilOn: null }, one stored row", async () => {
    const { type, member } = await overdueMember();
    const reply = await s.flag(member.id, type.id);
    expect(reply.status).toBe(200);
    const data = dataOf<SetResult>(reply);
    expect(Object.keys(data).sort()).toEqual(["kind", "setOn", "untilOn"]);
    expect(data).toEqual({ kind: "flag", setOn: s.today(), untilOn: null });
    const rows = await s.overrideRows(member.id, type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("flag");
    expect(rows[0]?.setOn).toBe(s.today());
    expect(rows[0]?.untilOn).toBeNull();
  });

  test("BR-REC-99 Remind me later: 200 { kind: snooze, setOn: today, untilOn: the sent day }, one stored row", async () => {
    const { type, member } = await overdueMember();
    const until = s.day(30);
    const reply = await s.snooze(member.id, type.id, until);
    expect(reply.status).toBe(200);
    expect(dataOf<SetResult>(reply)).toEqual({
      kind: "snooze",
      setOn: s.today(),
      untilOn: until,
    });
    const rows = await s.overrideRows(member.id, type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("snooze");
    expect(rows[0]?.setOn).toBe(s.today());
    expect(rows[0]?.untilOn).toBe(until);
  });

  test("E33 is an upsert: 200 the first time and 200 again, never 201", async () => {
    const { type, member } = await overdueMember();
    expect((await s.flag(member.id, type.id)).status).toBe(200);
    expect((await s.flag(member.id, type.id)).status).toBe(200);
    expect((await s.snooze(member.id, type.id, s.day(5))).status).toBe(200);
    expect((await s.snooze(member.id, type.id, s.day(5))).status).toBe(200);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(1);
  });

  test("BR-REC-99 the screen's choices 1 week, 2 weeks and 1 month are accepted as plain dates", async () => {
    const choices: [string, string][] = [
      ["1 week", addDays(s.today(), 7)],
      ["2 weeks", addDays(s.today(), 14)],
      ["1 month", addMonths(s.today(), 1)],
    ];
    for (const [label, until] of choices) {
      const { type, member } = await overdueMember();
      const reply = await s.snooze(member.id, type.id, until);
      expect(reply.status, label).toBe(200);
      expect(dataOf<SetResult>(reply).untilOn).toBe(until);
    }
  });

  test("BR-REC-98 the Assess soon is in force at once: the member is the first flagged row of Overdue", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    const row = await overdueRow(type, member);
    expect(row?.flagged).toBe(true);
    const line = await s.memberLine(member.id, type.id);
    expect(line.flagged).toBe(true);
    expect(line.snoozedUntil).toBeNull();
  });

  test("BR-REC-99 the reminder is in force at once: the row is hidden and E32 shows the day", async () => {
    const { type, member } = await overdueMember();
    const until = s.day(20);
    await s.snooze(member.id, type.id, until);
    expect(await overdueRow(type, member)).toBeUndefined();
    const line = await s.memberLine(member.id, type.id);
    expect(line.snoozedUntil).toBe(until);
    expect(line.flagged).toBe(false);
  });

  test("BR-REC-18 Remind me later 30 days: hidden; cleared, the row returns", async () => {
    const { type, member } = await overdueMember();
    await s.snooze(member.id, type.id, s.day(30));
    expect(await overdueRow(type, member)).toBeUndefined();
    expect((await s.clearAction(member.id, type.id)).status).toBe(200);
    const row = await overdueRow(type, member);
    expect(row?.flagged).toBe(false);
    expect(row?.daysOverdue).toBe(3);
  });
});

describe("E33 the until day (C8: after today, at most 90 days ahead)", () => {
  test("until today is 400 VALIDATION_ERROR with details.field = until", async () => {
    const { type, member } = await overdueMember();
    const reply = await s.snooze(member.id, type.id, s.today());
    expectInvalid(reply);
    expect((reply.body?.details as { field?: string } | undefined)?.field).toBe(
      "until",
    );
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
  });

  test("until yesterday, last month or years ago is the same 400", async () => {
    const { type, member } = await overdueMember();
    for (const until of [s.day(-1), s.day(-30), "2020-01-01"]) {
      const reply = await s.snooze(member.id, type.id, until);
      expectInvalid(reply);
      expect(
        (reply.body?.details as { field?: string } | undefined)?.field,
      ).toBe("until");
    }
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
  });

  test("until tomorrow is accepted (the first day that is after today)", async () => {
    const { type, member } = await overdueMember();
    const reply = await s.snooze(member.id, type.id, s.day(1));
    expect(dataOf<SetResult>(reply).untilOn).toBe(s.day(1));
  });

  test("until today + 90 days is accepted", async () => {
    const { type, member } = await overdueMember();
    const reply = await s.snooze(member.id, type.id, s.day(90));
    expect(dataOf<SetResult>(reply).untilOn).toBe(s.day(90));
  });

  test("until today + 91 days is 400 SNOOZE_TOO_FAR", async () => {
    const { type, member } = await overdueMember();
    const reply = await s.snooze(member.id, type.id, s.day(91));
    expectError(reply, 400, "SNOOZE_TOO_FAR");
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
  });

  test("until a year ahead is 400 SNOOZE_TOO_FAR", async () => {
    const { type, member } = await overdueMember();
    expectError(
      await s.snooze(member.id, type.id, s.day(365)),
      400,
      "SNOOZE_TOO_FAR",
    );
  });

  test("a refused until leaves an earlier Assess soon exactly as it was", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    const before = await s.overrideRows(member.id, type.id);
    expectError(
      await s.snooze(member.id, type.id, s.day(91)),
      400,
      "SNOOZE_TOO_FAR",
    );
    expectInvalid(await s.snooze(member.id, type.id, s.today()));
    expect(await s.overrideRows(member.id, type.id)).toEqual(before);
  });

  test("the 404 comes before the until checks: unknown member, until too far", async () => {
    const { type } = await overdueMember();
    expectError(
      await s.snooze(UNKNOWN_ID, type.id, s.day(91)),
      404,
      "NOT_FOUND",
    );
    expectError(
      await s.snooze(UNKNOWN_ID, type.id, s.today()),
      404,
      "NOT_FOUND",
    );
  });

  test("the 404 comes before the until checks: unknown assessment, until today", async () => {
    const { member } = await overdueMember();
    expectError(
      await s.snooze(member.id, UNKNOWN_ID, s.today()),
      404,
      "NOT_FOUND",
    );
    expectError(
      await s.snooze(member.id, UNKNOWN_ID, s.day(91)),
      404,
      "NOT_FOUND",
    );
  });
});

describe("BR-REC-93 'today' of E33 is the gym day", () => {
  const KIRITIMATI = "Pacific/Kiritimati";
  const PAGO_PAGO = "Pacific/Pago_Pago";

  test("setOn is today in the gym's time zone", async () => {
    await s.setSettings({ timezone: KIRITIMATI });
    const { type, member } = await overdueMember();
    const reply = await s.flag(member.id, type.id);
    expect(dataOf<SetResult>(reply).setOn).toBe(todayIn(KIRITIMATI));
    expect((await s.overrideRows(member.id, type.id))[0]?.setOn).toBe(
      todayIn(KIRITIMATI),
    );
  });

  test("until = the gym's today is refused, while the same day is a future day in a zone that is still behind", async () => {
    await s.setSettings({ timezone: KIRITIMATI });
    const { type, member } = await overdueMember();
    const aheadToday = todayIn(KIRITIMATI);
    expectInvalid(await s.snooze(member.id, type.id, aheadToday));

    await s.setSettings({ timezone: PAGO_PAGO });
    expect(todayIn(PAGO_PAGO) < aheadToday).toBe(true);
    const reply = await s.snooze(member.id, type.id, aheadToday);
    expect(dataOf<SetResult>(reply).untilOn).toBe(aheadToday);
    expect(dataOf<SetResult>(reply).setOn).toBe(todayIn(PAGO_PAGO));
  });

  test("the 90-day limit counts from the gym's today", async () => {
    await s.setSettings({ timezone: PAGO_PAGO });
    const { type, member } = await overdueMember();
    const behind = todayIn(PAGO_PAGO);
    expect(
      (await s.snooze(member.id, type.id, addDays(behind, 90))).status,
    ).toBe(200);
    expectError(
      await s.snooze(member.id, type.id, addDays(behind, 91)),
      400,
      "SNOOZE_TOO_FAR",
    );
  });
});

describe("BR-REC-100 Assess soon and Remind me later replace each other", () => {
  test("a reminder, then Assess soon: the reminder is gone and the row is on top", async () => {
    const { type, member } = await overdueMember();
    await s.snooze(member.id, type.id, s.day(14));
    expect(await overdueRow(type, member)).toBeUndefined();
    await s.flag(member.id, type.id);
    const rows = await s.overrideRows(member.id, type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("flag");
    expect(rows[0]?.untilOn).toBeNull();
    const row = await overdueRow(type, member);
    expect(row?.flagged).toBe(true);
    const line = await s.memberLine(member.id, type.id);
    expect(line.flagged).toBe(true);
    expect(line.snoozedUntil).toBeNull();
  });

  test("Assess soon, then a reminder: Assess soon is gone and the row is hidden", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    await s.snooze(member.id, type.id, s.day(14));
    const rows = await s.overrideRows(member.id, type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("snooze");
    expect(rows[0]?.untilOn).toBe(s.day(14));
    expect(await overdueRow(type, member)).toBeUndefined();
    const line = await s.memberLine(member.id, type.id);
    expect(line.flagged).toBe(false);
    expect(line.snoozedUntil).toBe(s.day(14));
  });

  test("a new reminder replaces the earlier reminder's day", async () => {
    const { type, member } = await overdueMember();
    await s.snooze(member.id, type.id, s.day(14));
    await s.snooze(member.id, type.id, s.day(40));
    const rows = await s.overrideRows(member.id, type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.untilOn).toBe(s.day(40));
    expect((await s.memberLine(member.id, type.id)).snoozedUntil).toBe(
      s.day(40),
    );
  });

  test("setting again replaces the row: setOn is today and the creation time is new", async () => {
    const { type, member } = await overdueMember();
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.day(-5),
      createdAt: new Date(Date.now() - 5 * DAY),
    });
    const [old] = await s.overrideRows(member.id, type.id);
    await s.flag(member.id, type.id);
    const rows = await s.overrideRows(member.id, type.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.setOn).toBe(s.today());
    const created = rows[0]?.createdAt.getTime() ?? 0;
    expect(created).toBeGreaterThan(old?.createdAt.getTime() ?? 0);
    expect(created).toBeGreaterThan(Date.now() - 5 * 60_000);
  });

  test("an override of one assessment never touches the member's other assessment", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 400_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 400_002 });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.flag(member.id, a.id);
    await s.snooze(member.id, b.id, s.day(10));
    expect((await s.overrideRows(member.id, a.id))[0]?.kind).toBe("flag");
    expect((await s.overrideRows(member.id, b.id))[0]?.kind).toBe("snooze");
  });

  test("two parallel E33 for the same member and assessment: both 200, one row, no 500", async () => {
    const { type, member } = await overdueMember();
    const calls = [
      s.flag(member.id, type.id),
      s.snooze(member.id, type.id, s.day(7)),
      s.flag(member.id, type.id),
      s.snooze(member.id, type.id, s.day(9)),
      s.flag(member.id, type.id),
      s.snooze(member.id, type.id, s.day(11)),
    ];
    const replies = await Promise.all(calls);
    expect(replies.map((r) => r.status)).toEqual([
      200, 200, 200, 200, 200, 200,
    ]);
    const rows = await s.overrideRows(member.id, type.id);
    expect(rows).toHaveLength(1);
    // the stored row is one of the requests, whole: a flag has no day, a reminder has one
    const row = rows[0];
    if (row?.kind === "flag") expect(row.untilOn).toBeNull();
    else expect([s.day(7), s.day(9), s.day(11)]).toContain(row?.untilOn ?? "");
  });

  test("parallel E33 each write their change-log row", async () => {
    const { type, member } = await overdueMember();
    const actor = await s.newActor();
    const replies = await Promise.all([
      s.flag(member.id, type.id, actor.token),
      s.snooze(member.id, type.id, s.day(7), actor.token),
      s.flag(member.id, type.id, actor.token),
      s.snooze(member.id, type.id, s.day(9), actor.token),
    ]);
    expect(replies.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(await s.audit(actor.sid, "due_override.set")).toHaveLength(4);
  });
});

describe("BR-REC-18, 98 it ends when that assessment is saved (C6)", () => {
  /** A member with nothing due, so a flagged row exists only while the Assess soon is in force. */
  async function calmMember() {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    // dated before any "set on" used below, so it cannot end an Assess soon set later
    await s.record(member.id, type.id, s.day(-6), [type.metrics[0]?.id ?? ""]);
    return { type, member };
  }

  test("Assess soon, then a save dated today: the flagged row goes; the stored row stays", async () => {
    const { type, member } = await calmMember();
    await s.flag(member.id, type.id);
    expect((await overdueRow(type, member))?.flagged).toBe(true);
    await s.record(member.id, type.id, s.today(), [], {
      updatedAt: new Date(Date.now() + 60_000),
    });
    expect(await overdueRow(type, member)).toBeUndefined();
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(1);
  });

  test("Assess soon, then a back-filled save dated before the day it was set: still Assess soon", async () => {
    const { type, member } = await calmMember();
    await s.flag(member.id, type.id);
    await s.record(member.id, type.id, s.day(-15), [], {
      updatedAt: new Date(Date.now() + 60_000),
    });
    expect((await overdueRow(type, member))?.flagged).toBe(true);
  });

  test("setting Assess soon again after an older save: the old save no longer counts", async () => {
    const { type, member } = await calmMember();
    // an Assess soon set 5 days ago, ended by a save made yesterday
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.day(-5),
      createdAt: new Date(Date.now() - 5 * DAY),
    });
    await s.record(member.id, type.id, s.day(-1), [], {
      updatedAt: new Date(Date.now() - DAY),
    });
    expect(await overdueRow(type, member)).toBeUndefined();
    // asking again now starts a new one: the save of yesterday is older than it
    await s.flag(member.id, type.id);
    expect((await overdueRow(type, member))?.flagged).toBe(true);
  });

  test("setting Assess soon again after a save made earlier today (dated today): that save is older than it, so it does not end it", async () => {
    const { type, member } = await calmMember();
    await s.record(member.id, type.id, s.today(), [], {
      updatedAt: new Date(Date.now() - 3_600_000),
    });
    await s.flag(member.id, type.id);
    expect((await overdueRow(type, member))?.flagged).toBe(true);
  });

  test("a reminder is ended by a save in the same way: the row is back", async () => {
    const { type, member } = await overdueMember();
    await s.snooze(member.id, type.id, s.day(30));
    expect(await overdueRow(type, member)).toBeUndefined();
    await s.record(member.id, type.id, s.today(), [], {
      updatedAt: new Date(Date.now() + 60_000),
    });
    expect((await overdueRow(type, member))?.daysOverdue).toBe(3);
    expect((await s.memberLine(member.id, type.id)).snoozedUntil).toBeNull();
  });
});

describe("C9 404s and what is accepted", () => {
  test("E33 unknown member: 404 NOT_FOUND, nothing stored", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    expectError(await s.flag(UNKNOWN_ID, type.id), 404, "NOT_FOUND");
    expectError(
      await s.snooze(UNKNOWN_ID, type.id, s.day(5)),
      404,
      "NOT_FOUND",
    );
    expect(await s.overrideRows(UNKNOWN_ID, type.id)).toHaveLength(0);
  });

  test("E33 unknown assessment: 404 NOT_FOUND, nothing stored", async () => {
    const member = await s.makeMember();
    expectError(await s.flag(member.id, UNKNOWN_ID), 404, "NOT_FOUND");
    expectError(
      await s.snooze(member.id, UNKNOWN_ID, s.day(5)),
      404,
      "NOT_FOUND",
    );
    expect(await s.overrideRows(member.id, UNKNOWN_ID)).toHaveLength(0);
  });

  test("E33 unknown member and unknown assessment: 404 NOT_FOUND", async () => {
    expectError(await s.flag(UNKNOWN_ID, OTHER_UNKNOWN_ID), 404, "NOT_FOUND");
  });

  test("E34 unknown member or unknown assessment: 404 NOT_FOUND", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember();
    expectError(await s.clearAction(UNKNOWN_ID, type.id), 404, "NOT_FOUND");
    expectError(await s.clearAction(member.id, UNKNOWN_ID), 404, "NOT_FOUND");
    expectError(
      await s.clearAction(UNKNOWN_ID, OTHER_UNKNOWN_ID),
      404,
      "NOT_FOUND",
    );
  });

  test("a 404 changes nothing: another member's override stays", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    await s.clearAction(UNKNOWN_ID, type.id);
    await s.clearAction(member.id, UNKNOWN_ID);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(1);
  });

  test("an archived member can be given Assess soon and a reminder", async () => {
    const { type, member } = await overdueMember({ archived: true });
    expect((await s.flag(member.id, type.id)).status).toBe(200);
    expect((await s.overrideRows(member.id, type.id))[0]?.kind).toBe("flag");
    expect((await s.snooze(member.id, type.id, s.day(7))).status).toBe(200);
    expect((await s.overrideRows(member.id, type.id))[0]?.kind).toBe("snooze");
    expect((await s.clearAction(member.id, type.id)).status).toBe(200);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
  });

  test("a turned-off assessment is accepted and shows nothing until it is turned on again", async () => {
    const type = await s.makeWeeklyType(["Weight"], { isActive: false });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(-3) });
    expect((await s.flag(member.id, type.id)).status).toBe(200);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(1);
    expect(await overdueRow(type, member)).toBeUndefined();
    expect((await s.memberDue(member.id)).status).toBe(200);
    await s.setTypeActive(type.id, true);
    const row = await overdueRow(type, member);
    expect(row?.flagged).toBe(true);
  });

  test("E34 accepts a turned-off assessment too", async () => {
    const type = await s.makeWeeklyType(["Weight"], { isActive: false });
    const member = await s.makeMember();
    await s.flag(member.id, type.id);
    expect((await s.clearAction(member.id, type.id)).status).toBe(200);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
  });
});

describe("E34 clearing", () => {
  test("clearing Assess soon: 200 with an empty object, the row is deleted, the member is a normal row again", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    const reply = await s.clearAction(member.id, type.id);
    expect(reply.status).toBe(200);
    expect(reply.body?.success).toBe(true);
    expect(reply.body?.data).toEqual({});
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
    const row = await overdueRow(type, member);
    expect(row?.flagged).toBe(false);
    expect((await s.memberLine(member.id, type.id)).flagged).toBe(false);
  });

  test("clearing a reminder: the row is deleted and the member is listed again", async () => {
    const { type, member } = await overdueMember();
    await s.snooze(member.id, type.id, s.day(21));
    const reply = await s.clearAction(member.id, type.id);
    expect(reply.body?.data).toEqual({});
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
    expect(await overdueRow(type, member)).toBeDefined();
    expect((await s.memberLine(member.id, type.id)).snoozedUntil).toBeNull();
  });

  test("clearing Assess soon on a member with nothing due removes the row from Overdue", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.record(member.id, type.id, s.day(-6), [type.metrics[0]?.id ?? ""]);
    await s.flag(member.id, type.id);
    expect(await overdueRow(type, member)).toBeDefined();
    await s.clearAction(member.id, type.id);
    expect(await overdueRow(type, member)).toBeUndefined();
  });

  test("with nothing set it is still 200 with an empty object (no 404)", async () => {
    const { type, member } = await overdueMember();
    const reply = await s.clearAction(member.id, type.id);
    expect(reply.status).toBe(200);
    expect(reply.body?.success).toBe(true);
    expect(reply.body?.data).toEqual({});
  });

  test("clearing twice is fine", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    expect((await s.clearAction(member.id, type.id)).status).toBe(200);
    expect((await s.clearAction(member.id, type.id)).status).toBe(200);
  });

  test("clearing touches only that member and assessment", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 410_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 410_002 });
    const one = await s.makeMember({ joinedOn: s.day(-400) });
    const two = await s.makeMember({ joinedOn: s.day(-400) });
    await s.flag(one.id, a.id);
    await s.flag(one.id, b.id);
    await s.flag(two.id, a.id);
    await s.clearAction(one.id, a.id);
    expect(await s.overrideRows(one.id, a.id)).toHaveLength(0);
    expect(await s.overrideRows(one.id, b.id)).toHaveLength(1);
    expect(await s.overrideRows(two.id, a.id)).toHaveLength(1);
  });

  test("the stored row stays after a save ended it, until it is cleared", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    await s.record(member.id, type.id, s.today(), [], {
      updatedAt: new Date(Date.now() + 60_000),
    });
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(1);
    await s.clearAction(member.id, type.id);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
  });
});

describe("BR-REC-158 the change log: one row per successful call, none for a refused one", () => {
  test("E33 Assess soon writes one due_override.set row with the signed-in session", async () => {
    const { type, member } = await overdueMember();
    const actor = await s.newActor();
    expect((await s.flag(member.id, type.id, actor.token)).status).toBe(200);
    const rows = await s.audit(actor.sid);
    expect(rows.map((r) => r.action)).toEqual(["due_override.set"]);
    expect(rows[0]?.sessionId).toBe(actor.sid);
  });

  test("E33 Remind me later writes one due_override.set row", async () => {
    const { type, member } = await overdueMember();
    const actor = await s.newActor();
    expect(
      (await s.snooze(member.id, type.id, s.day(7), actor.token)).status,
    ).toBe(200);
    expect((await s.audit(actor.sid)).map((r) => r.action)).toEqual([
      "due_override.set",
    ]);
  });

  test("every successful E33 writes its own row, also a repeat of the same call", async () => {
    const { type, member } = await overdueMember();
    const actor = await s.newActor();
    await s.flag(member.id, type.id, actor.token);
    await s.flag(member.id, type.id, actor.token);
    await s.snooze(member.id, type.id, s.day(7), actor.token);
    expect(await s.audit(actor.sid, "due_override.set")).toHaveLength(3);
    expect(await s.audit(actor.sid)).toHaveLength(3);
  });

  test("E34 writes one due_override.clear row", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    const actor = await s.newActor();
    expect(
      (await s.clearAction(member.id, type.id, { token: actor.token })).status,
    ).toBe(200);
    const rows = await s.audit(actor.sid);
    expect(rows.map((r) => r.action)).toEqual(["due_override.clear"]);
    expect(rows[0]?.sessionId).toBe(actor.sid);
  });

  test("E34 with nothing set still writes one due_override.clear row", async () => {
    const { type, member } = await overdueMember();
    const actor = await s.newActor();
    expect(
      (await s.clearAction(member.id, type.id, { token: actor.token })).status,
    ).toBe(200);
    expect((await s.audit(actor.sid)).map((r) => r.action)).toEqual([
      "due_override.clear",
    ]);
  });

  test("a refused E33 (validation, until checks, 404, Origin, sign-in) writes no row and changes nothing", async () => {
    const { type, member } = await overdueMember();
    const actor = await s.newActor();
    const attempts = [
      s.setAction(
        member.id,
        type.id,
        { action: "nope" },
        { token: actor.token },
      ),
      s.setAction(
        member.id,
        type.id,
        { action: "snooze" },
        { token: actor.token },
      ),
      s.snooze(member.id, type.id, s.today(), actor.token),
      s.snooze(member.id, type.id, s.day(91), actor.token),
      s.flag(UNKNOWN_ID, type.id, actor.token),
      s.flag(member.id, UNKNOWN_ID, actor.token),
      s.setAction(
        member.id,
        type.id,
        { action: "flag" },
        { token: actor.token, origin: "https://evil.example" },
      ),
    ];
    const replies = await Promise.all(attempts);
    expect(replies.map((r) => r.status)).toEqual([
      400, 400, 400, 400, 404, 404, 403,
    ]);
    expect(await s.audit(actor.sid)).toHaveLength(0);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
  });

  test("a refused E34 (404, Origin) writes no row", async () => {
    const { type, member } = await overdueMember();
    await s.flag(member.id, type.id);
    const actor = await s.newActor();
    expect(
      (await s.clearAction(UNKNOWN_ID, type.id, { token: actor.token })).status,
    ).toBe(404);
    expect(
      (
        await s.clearAction(member.id, type.id, {
          token: actor.token,
          origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(await s.audit(actor.sid)).toHaveLength(0);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(1);
  });

  test("the reads (E31, E32) write no change-log row", async () => {
    const { type, member } = await overdueMember();
    const actor = await s.newActor();
    await s.list({ status: "overdue", typeId: type.id }, actor.token);
    await s.memberDue(member.id, actor.token);
    expect(await s.audit(actor.sid)).toHaveLength(0);
  });
});
