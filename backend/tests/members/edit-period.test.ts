import { describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  expectError,
  type MemberView,
  type PeriodResult,
  useMembersSuite,
} from "./support/suite";

// E23 PATCH /api/members/:memberId/periods/:periodId: edit a membership period.
// BR-REC-55 (end re-calculated; refused on overlap or start before the join date),
// BR-REC-09 (periods can be edited, not deleted), BR-REC-51, BR-REC-58 (an archived
// member comes back when the saved period covers today), BR-REC-157, BR-REC-158.

const s = useMembersSuite();

/** Joined 2025-06-01; P1 monthly 2025-06-01..2025-06-30, P2 monthly 2025-07-01..2025-07-31. */
const twoPeriods = (name: string) =>
  s.seedMember({
    name,
    joinedOn: "2025-06-01",
    periods: [
      { plan: "monthly", startOn: "2025-06-01", endOn: "2025-06-30" },
      { plan: "monthly", startOn: "2025-07-01", endOn: "2025-07-31" },
    ],
  });

/** Joined 2025-06-01; one annual period 2025-06-01..2026-05-31. */
const onePeriod = (name: string) =>
  s.seedMember({
    name,
    joinedOn: "2025-06-01",
    periods: [{ plan: "annual", startOn: "2025-06-01", endOn: "2026-05-31" }],
  });

async function periodOf(memberId: string, periodId: string) {
  return (await s.periodRows(memberId)).find((p) => p.id === periodId);
}

describe("E23 the end date is re-calculated (BR-REC-55, 51)", () => {
  test("BR-REC-55 a plan change recalculates the end: annual becomes monthly, ends 2025-06-30", async () => {
    const m = await onePeriod("Plan Change");
    const periodId = m.periodIds[0] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { plan: "monthly" }),
    );
    expect(result).toMatchObject({
      id: periodId,
      plan: "monthly",
      startOn: "2025-06-01",
      endOn: "2025-06-30",
      memberRestored: false,
    });
    expect(await periodOf(m.id, periodId)).toMatchObject({
      plan: "monthly",
      endOn: "2025-06-30",
    });
  });

  test("BR-REC-55 a start change recalculates the end: annual from 2025-06-15 ends 2026-06-14", async () => {
    const m = await onePeriod("Start Change");
    const periodId = m.periodIds[0] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { startOn: "2025-06-15" }),
    );
    expect(result).toMatchObject({
      plan: "annual",
      startOn: "2025-06-15",
      endOn: "2026-06-14",
    });
  });

  test("BR-REC-51 plan and start together: quarterly from 2025-11-30 ends 2026-02-28 (last day of the month)", async () => {
    const m = await onePeriod("Both Change");
    const periodId = m.periodIds[0] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, {
        plan: "quarterly",
        startOn: "2025-11-30",
      }),
    );
    expect(result).toMatchObject({
      plan: "quarterly",
      startOn: "2025-11-30",
      endOn: "2026-02-28",
    });
  });

  test("BR-REC-55 the edit shows in E18: the membership and the period list follow", async () => {
    const m = await onePeriod("Edit Shows");
    const periodId = m.periodIds[0] as string;
    dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { plan: "monthly" }),
    );
    const member = dataOf<MemberView>(await s.getMember(m.id));
    expect(member.membership).toMatchObject({
      plan: "monthly",
      startOn: "2025-06-01",
      endOn: "2025-06-30",
    });
    expect(member.periods).toEqual([
      {
        id: periodId,
        plan: "monthly",
        startOn: "2025-06-01",
        endOn: "2025-06-30",
      },
    ]);
  });

  test("BR-REC-55 the other periods of the member are not touched", async () => {
    const m = await twoPeriods("Others Untouched");
    const p2 = m.periodIds[1] as string;
    dataOf<PeriodResult>(
      await s.editPeriod(m.id, p2, { startOn: "2025-07-05" }),
    );
    expect(await periodOf(m.id, m.periodIds[0] as string)).toMatchObject({
      startOn: "2025-06-01",
      endOn: "2025-06-30",
    });
  });
});

describe("E23 no overlap with the member's other periods (BR-REC-55, 09)", () => {
  test("BR-REC-55 moving the start into the previous period is 409 PERIOD_OVERLAP and nothing changes", async () => {
    const m = await twoPeriods("Move Into Previous");
    const p2 = m.periodIds[1] as string;
    expectError(
      await s.editPeriod(m.id, p2, { startOn: "2025-06-15" }),
      409,
      "PERIOD_OVERLAP",
    );
    expect(await periodOf(m.id, p2)).toMatchObject({
      startOn: "2025-07-01",
      endOn: "2025-07-31",
    });
  });

  test("BR-REC-55 a longer plan that now runs into the next period is 409", async () => {
    const m = await twoPeriods("Plan Runs Into Next");
    const p1 = m.periodIds[0] as string;
    expectError(
      await s.editPeriod(m.id, p1, { plan: "quarterly" }),
      409,
      "PERIOD_OVERLAP",
    );
    expect(await periodOf(m.id, p1)).toMatchObject({
      plan: "monthly",
      endOn: "2025-06-30",
    });
  });

  test("BR-REC-55 ending on the day the next period starts is an overlap (one shared day)", async () => {
    const m = await twoPeriods("Share One Day");
    const p1 = m.periodIds[0] as string;
    // monthly from 2025-06-02 ends 2025-07-01: shares 1 Jul with P2
    expectError(
      await s.editPeriod(m.id, p1, { startOn: "2025-06-02" }),
      409,
      "PERIOD_OVERLAP",
    );
  });

  test("BR-REC-55 a period is not an overlap with itself: moving inside its own days is fine", async () => {
    const m = await twoPeriods("Move Inside Self");
    const p2 = m.periodIds[1] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, p2, { startOn: "2025-07-05" }),
    );
    expect(result).toMatchObject({
      startOn: "2025-07-05",
      endOn: "2025-08-04",
    });
  });

  test("BR-REC-55 a longer plan on the latest period is fine when nothing follows", async () => {
    const m = await twoPeriods("Longer Last");
    const p2 = m.periodIds[1] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, p2, { plan: "quarterly" }),
    );
    expect(result).toMatchObject({
      startOn: "2025-07-01",
      endOn: "2025-09-30",
    });
  });

  test("BR-REC-55 other members' periods are never an overlap", async () => {
    const a = await onePeriod("Edit Other A");
    const b = await onePeriod("Edit Other B");
    dataOf<PeriodResult>(
      await s.editPeriod(a.id, a.periodIds[0] as string, {
        startOn: "2025-06-02",
      }),
    );
    expect(await periodOf(b.id, b.periodIds[0] as string)).toMatchObject({
      startOn: "2025-06-01",
    });
  });
});

describe("E23 the start date against the join date (BR-REC-55, 50)", () => {
  test("BR-REC-55 a start before the join date is 400 START_BEFORE_JOIN and nothing changes", async () => {
    const m = await onePeriod("Edit Before Join");
    const periodId = m.periodIds[0] as string;
    expectError(
      await s.editPeriod(m.id, periodId, { startOn: "2025-05-20" }),
      400,
      "START_BEFORE_JOIN",
    );
    expect(await periodOf(m.id, periodId)).toMatchObject({
      startOn: "2025-06-01",
      endOn: "2026-05-31",
    });
  });

  test("BR-REC-50 a start on the join date is accepted", async () => {
    const m = await s.seedMember({
      name: "Edit On Join",
      joinedOn: "2025-06-01",
      periods: [{ plan: "annual", startOn: "2025-07-01", endOn: "2026-06-30" }],
    });
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, m.periodIds[0] as string, {
        startOn: "2025-06-01",
      }),
    );
    expect(result.startOn).toBe("2025-06-01");
  });

  test("the order of answers is 404, 400, 409: a start before the join date that would also overlap is START_BEFORE_JOIN", async () => {
    const m = await s.seedMember({
      name: "Order 400 Before 409",
      joinedOn: "2025-06-01",
      periods: [
        { plan: "monthly", startOn: "2025-06-01", endOn: "2025-06-30" },
        { plan: "annual", startOn: "2025-07-01", endOn: "2026-06-30" },
      ],
    });
    expectError(
      await s.editPeriod(m.id, m.periodIds[1] as string, {
        startOn: "2025-05-20",
      }),
      400,
      "START_BEFORE_JOIN",
    );
  });
});

describe("E23 the period must belong to the member (404)", () => {
  test("BR-REC-154 an unknown member and an unknown period is 404 NOT_FOUND", async () => {
    expectError(
      await s.editPeriod(UNKNOWN_ID, OTHER_UNKNOWN_ID, { plan: "monthly" }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-154 a known member with a period id that exists nowhere is 404", async () => {
    const m = await onePeriod("Unknown Period");
    expectError(
      await s.editPeriod(m.id, UNKNOWN_ID, { plan: "monthly" }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-154 another member's period under this member's address is 404 and that period is not changed", async () => {
    const a = await onePeriod("Mine");
    const b = await onePeriod("Theirs");
    const theirs = b.periodIds[0] as string;
    expectError(
      await s.editPeriod(a.id, theirs, { plan: "monthly" }),
      404,
      "NOT_FOUND",
    );
    expect(await periodOf(b.id, theirs)).toMatchObject({ plan: "annual" });
  });

  test("BR-REC-154 an unknown member with a period that exists (of another member) is 404", async () => {
    const b = await onePeriod("Real Period Wrong Member");
    expectError(
      await s.editPeriod(UNKNOWN_ID, b.periodIds[0] as string, {
        plan: "monthly",
      }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-154 malformed ids are 400 VALIDATION_ERROR", async () => {
    const m = await onePeriod("Malformed Ids");
    expectError(
      await s.editPeriod(m.id, "nope", { plan: "monthly" }),
      400,
      "VALIDATION_ERROR",
    );
    expectError(
      await s.editPeriod("nope", m.periodIds[0] as string, { plan: "monthly" }),
      400,
      "VALIDATION_ERROR",
    );
  });
});

describe("E23 update body (BR-REC-157)", () => {
  const BAD: [string, unknown][] = [
    ["an empty body", {}],
    ["an unknown field (endOn)", { endOn: "2027-01-01" }],
    [
      "an unknown field next to a valid one",
      { plan: "monthly", memberId: "x" },
    ],
    ["a plan outside the four", { plan: "weekly" }],
    ["a start that is not a day", { startOn: "2026-02-30" }],
    ["a null plan", { plan: null }],
    ["a null start", { startOn: null }],
  ];
  for (const [label, body] of BAD) {
    test(`BR-REC-157 ${label} is 400 VALIDATION_ERROR and nothing changes`, async () => {
      const m = await onePeriod(`Bad Edit ${label}`);
      const periodId = m.periodIds[0] as string;
      expectError(
        await s.editPeriod(m.id, periodId, body),
        400,
        "VALIDATION_ERROR",
      );
      expect(await periodOf(m.id, periodId)).toMatchObject({
        plan: "annual",
        startOn: "2025-06-01",
        endOn: "2026-05-31",
      });
    });
  }

  test("BR-REC-157 a body that is not JSON is 400 INVALID_JSON", async () => {
    const m = await onePeriod("Bad Json");
    const reply = await s.send(
      "PATCH",
      `/api/members/${m.id}/periods/${m.periodIds[0]}`,
      { rawBody: "{nope" },
    );
    expectError(reply, 400, "INVALID_JSON");
  });

  test("BR-REC-157 either field alone is enough", async () => {
    const m = await onePeriod("One Field");
    const periodId = m.periodIds[0] as string;
    dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { plan: "annual" }),
    );
    dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { startOn: "2025-06-01" }),
    );
  });

  test("BR-REC-09 periods cannot be deleted: there is no DELETE route", async () => {
    const m = await onePeriod("No Delete");
    const reply = await s.send(
      "DELETE",
      `/api/members/${m.id}/periods/${m.periodIds[0]}`,
    );
    expect([404, 405]).toContain(reply.status);
    expect(await s.periodRows(m.id)).toHaveLength(1);
  });
});

describe("E23 an archived member (BR-REC-58)", () => {
  const archivedWithOldPeriod = (name: string) =>
    s.seedMember({
      name,
      archived: true,
      joinedOn: "2020-01-01",
      periods: [{ plan: "annual", startOn: "2020-01-01", endOn: "2020-12-31" }],
    });

  test("BR-REC-58 editing a period so that it covers today restores the member: memberRestored true, archivedAt cleared", async () => {
    const m = await archivedWithOldPeriod("Edit Restores");
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, m.periodIds[0] as string, {
        startOn: s.day(-10),
      }),
    );
    expect(result.memberRestored).toBe(true);
    expect((await s.memberRow(m.id))?.archivedAt).toBeNull();
    expect(dataOf<MemberView>(await s.getMember(m.id)).archivedAt).toBeNull();
  });

  test("BR-REC-58 fixing an old binder entry (it still does not cover today) does not restore: memberRestored false, still archived", async () => {
    const m = await archivedWithOldPeriod("Edit Old Entry");
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, m.periodIds[0] as string, {
        startOn: "2020-02-01",
      }),
    );
    expect(result.memberRestored).toBe(false);
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });

  test("BR-REC-58 editing an old period of an archived member who also has a current one does not restore", async () => {
    const m = await s.seedMember({
      name: "Edit Old While Current",
      archived: true,
      joinedOn: "2020-01-01",
      periods: [
        { plan: "annual", startOn: "2020-01-01", endOn: "2020-12-31" },
        { plan: "annual", startOn: s.day(-100) },
      ],
    });
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, m.periodIds[0] as string, { plan: "monthly" }),
    );
    expect(result.memberRestored).toBe(false);
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });

  test("BR-REC-58 moving a period away from today (it starts tomorrow) is false and the member stays archived", async () => {
    const m = await s.seedMember({
      name: "Edit Moves Away",
      archived: true,
      periods: [{ plan: "annual", startOn: s.day(-100) }],
    });
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, m.periodIds[0] as string, {
        startOn: s.day(1),
      }),
    );
    expect(result.memberRestored).toBe(false);
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });

  test("BR-REC-58 a save that changes nothing on a period covering today still restores an archived member", async () => {
    const m = await s.seedMember({
      name: "Noop Restores",
      archived: true,
      periods: [{ plan: "annual", startOn: s.day(-100) }],
    });
    const periodId = m.periodIds[0] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { plan: "annual" }),
    );
    expect(result.memberRestored).toBe(true);
    expect((await s.memberRow(m.id))?.archivedAt).toBeNull();
    // the period itself did not change, so no membership.update row
    expect(
      await s.audit({ action: "membership.update", entityId: periodId }),
    ).toEqual([]);
  });

  test("BR-REC-58 a member who is not archived gets memberRestored false", async () => {
    const m = await s.seedMember({
      name: "Not Archived Edit",
      periods: [{ plan: "annual", startOn: s.day(-100) }],
    });
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, m.periodIds[0] as string, { plan: "annual" }),
    );
    expect(result.memberRestored).toBe(false);
  });

  test("BR-REC-58 a period that starts today covers today (boundary)", async () => {
    const m = await archivedWithOldPeriod("Edit Starts Today");
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, m.periodIds[0] as string, {
        startOn: s.today(),
      }),
    );
    expect(result.memberRestored).toBe(true);
  });

  test("BR-REC-58 a refused edit (overlap) leaves the member archived", async () => {
    const m = await s.seedMember({
      name: "Refused Edit Archived",
      archived: true,
      joinedOn: "2020-01-01",
      periods: [
        { plan: "monthly", startOn: "2020-01-01", endOn: "2020-01-31" },
        { plan: "monthly", startOn: "2020-02-01", endOn: "2020-02-29" },
      ],
    });
    expectError(
      await s.editPeriod(m.id, m.periodIds[1] as string, {
        startOn: "2020-01-15",
      }),
      409,
      "PERIOD_OVERLAP",
    );
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });
});

describe("E23 change log (BR-REC-158)", () => {
  test("BR-REC-158 a plan change writes one membership.update row with plan and endOn, before and after", async () => {
    const m = await twoPeriods("Log Plan");
    const p2 = m.periodIds[1] as string;
    dataOf<PeriodResult>(await s.editPeriod(m.id, p2, { plan: "quarterly" }));
    const rows = await s.audit({ action: "membership.update", entityId: p2 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: s.sessionId,
      entity: "membership_period",
      entityId: p2,
    });
    expect(rows[0]?.before).toEqual({ plan: "monthly", endOn: "2025-07-31" });
    expect(rows[0]?.after).toEqual({ plan: "quarterly", endOn: "2025-09-30" });
  });

  test("BR-REC-158 a start change logs startOn and endOn", async () => {
    const m = await onePeriod("Log Start");
    const periodId = m.periodIds[0] as string;
    dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { startOn: "2025-06-15" }),
    );
    const rows = await s.audit({
      action: "membership.update",
      entityId: periodId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toEqual({
      startOn: "2025-06-01",
      endOn: "2026-05-31",
    });
    expect(rows[0]?.after).toEqual({
      startOn: "2025-06-15",
      endOn: "2026-06-14",
    });
  });

  test("BR-REC-158 endOn is logged only when it moves: monthly from 29 Jan to 30 Jan both end 28 Feb, so only startOn is in the row", async () => {
    const m = await s.seedMember({
      name: "Log Same End",
      joinedOn: "2026-01-01",
      periods: [
        { plan: "monthly", startOn: "2026-01-29", endOn: "2026-02-28" },
      ],
    });
    const periodId = m.periodIds[0] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { startOn: "2026-01-30" }),
    );
    expect(result.endOn).toBe("2026-02-28");
    const rows = await s.audit({
      action: "membership.update",
      entityId: periodId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toEqual({ startOn: "2026-01-29" });
    expect(rows[0]?.after).toEqual({ startOn: "2026-01-30" });
  });

  test("BR-REC-158 saving the stored values again is 200 and writes no row", async () => {
    const m = await onePeriod("Log Noop");
    const periodId = m.periodIds[0] as string;
    const reply = await s.editPeriod(m.id, periodId, {
      plan: "annual",
      startOn: "2025-06-01",
    });
    expect(reply.status).toBe(200);
    expect(
      await s.audit({ action: "membership.update", entityId: periodId }),
    ).toEqual([]);
  });

  test("BR-REC-158 an edit that restores the member writes membership.update and member.restore", async () => {
    const archivedAt = new Date(Date.now() - 86_400_000);
    const m = await s.seedMember({
      name: "Log Edit Restore",
      archived: archivedAt,
      joinedOn: "2020-01-01",
      periods: [{ plan: "annual", startOn: "2020-01-01", endOn: "2020-12-31" }],
    });
    const periodId = m.periodIds[0] as string;
    const result = dataOf<PeriodResult>(
      await s.editPeriod(m.id, periodId, { startOn: s.day(-10) }),
    );
    expect(result.memberRestored).toBe(true);
    const rows = await s.auditAbout(m.id, [periodId]);
    expect(rows.map((r) => r.action).sort()).toEqual([
      "member.restore",
      "membership.update",
    ]);
    const restore = rows.find((r) => r.action === "member.restore");
    expect(restore?.after).toEqual({ archivedAt: null });
    const logged = (restore?.before as { archivedAt: string } | undefined)
      ?.archivedAt as string;
    expect(new Date(logged).getTime()).toBe(archivedAt.getTime());
  });

  test("BR-REC-158 a refused edit (409) writes nothing", async () => {
    const m = await twoPeriods("Log Refused");
    const before = (await s.audit()).length;
    expectError(
      await s.editPeriod(m.id, m.periodIds[1] as string, {
        startOn: "2025-06-15",
      }),
      409,
      "PERIOD_OVERLAP",
    );
    expect((await s.audit()).length).toBe(before);
  });

  test("BR-REC-158 a refused edit (400 START_BEFORE_JOIN) writes nothing", async () => {
    const m = await onePeriod("Log Refused Join");
    const before = (await s.audit()).length;
    expectError(
      await s.editPeriod(m.id, m.periodIds[0] as string, {
        startOn: "2025-05-01",
      }),
      400,
      "START_BEFORE_JOIN",
    );
    expect((await s.audit()).length).toBe(before);
  });
});
