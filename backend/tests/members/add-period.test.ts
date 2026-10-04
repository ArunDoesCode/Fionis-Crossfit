import { describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  type EndingItem,
  expectError,
  type ListItem,
  type MemberView,
  type PeriodResult,
  type PlanName,
  startFor,
  useMembersSuite,
} from "./support/suite";

// E22 POST /api/members/:memberId/periods: renew (add a membership period).
// BR-REC-08, 51 (end dates), 09 (no overlap, no delete), 50 (start vs join date),
// 54 (renew defaults), 58 (an archived member comes back when the period covers today),
// 154, 156 (Idempotency-Key), 158 (change log).

const s = useMembersSuite();

/** A member who joined on 2025-06-01 and has one annual period 2025-06-01 to 2026-05-31. */
const annual2025 = (name: string, extra: { archived?: boolean } = {}) =>
  s.seedMember({
    name,
    joinedOn: "2025-06-01",
    periods: [{ plan: "annual", startOn: "2025-06-01", endOn: "2026-05-31" }],
    ...extra,
  });

describe("E22 the end date of the new period (BR-REC-08, 51: the spec table)", () => {
  const CASES: [PlanName, string, string][] = [
    ["monthly", "2026-01-15", "2026-02-14"],
    ["quarterly", "2026-03-01", "2026-05-31"],
    ["half_annual", "2026-04-10", "2026-10-09"],
    ["annual", "2025-06-01", "2026-05-31"],
    ["monthly", "2026-01-31", "2026-02-28"],
    ["monthly", "2026-02-28", "2026-03-27"],
    ["annual", "2028-02-29", "2029-02-28"],
  ];
  for (const [plan, startOn, endOn] of CASES) {
    test(`BR-REC-51 ${plan} from ${startOn} ends ${endOn}`, async () => {
      // an old period far before, so no start in the table overlaps it
      const m = await s.seedMember({
        name: `Table ${plan} ${startOn}`,
        joinedOn: "2020-01-01",
        periods: [{ plan: "monthly", startOn: "2020-01-01" }],
      });
      const result = dataOf<PeriodResult>(
        await s.addPeriod(m.id, { plan, startOn }),
        201,
      );
      expect(result).toMatchObject({ plan, startOn, endOn });
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
      const rows = await s.periodRows(m.id);
      expect(rows.find((r) => r.id === result.id)).toMatchObject({
        plan,
        startOn,
        endOn,
      });
    });
  }

  test("BR-REC-08 the answer is { id, plan, startOn, endOn, memberRestored }", async () => {
    const m = await annual2025("Shape");
    const reply = await s.addPeriod(m.id, {
      plan: "annual",
      startOn: "2026-06-01",
    });
    expect(reply.status).toBe(201);
    expect(reply.body?.success).toBe(true);
    const data = reply.body?.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual([
      "endOn",
      "id",
      "memberRestored",
      "plan",
      "startOn",
    ]);
  });
});

describe("E22 renewing (BR-REC-09, 54)", () => {
  test("BR-REC-54 annual ended 31 May 2026: renew from 1 Jun 2026 (the day after) is accepted and ends 31 May 2027", async () => {
    const m = await annual2025("Renew Default");
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2026-06-01" }),
      201,
    );
    expect(result).toMatchObject({
      plan: "annual",
      startOn: "2026-06-01",
      endOn: "2027-05-31",
      memberRestored: false,
    });
  });

  test("BR-REC-09 the new period shows in E18: periods newest first, and the membership comes from it", async () => {
    const m = await annual2025("Renew Shows");
    const added = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2026-06-01" }),
      201,
    );
    const member = dataOf<MemberView>(await s.getMember(m.id));
    expect(member.periods.map((p) => p.startOn)).toEqual([
      "2026-06-01",
      "2025-06-01",
    ]);
    expect(member.periods[0]?.id).toBe(added.id);
    expect(member.membership).toMatchObject({
      plan: "annual",
      startOn: "2026-06-01",
      endOn: "2027-05-31",
    });
  });

  test("BR-REC-52 renewed early: a period that starts after today is allowed and the member is Active, not Ends soon", async () => {
    const m = await s.seedMember({
      name: "Renew Early",
      periods: [{ plan: "monthly", startOn: s.day(-25), endOn: s.day(4) }],
    });
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: s.day(5) }),
      201,
    );
    expect(result.startOn).toBe(s.day(5));
    const member = dataOf<MemberView>(await s.getMember(m.id));
    expect(member.membership.status).toBe("active");
  });

  test("BR-REC-09 a member can have many periods: three renewals in a row", async () => {
    const m = await s.seedMember({
      name: "Renew Thrice",
      joinedOn: "2024-01-01",
      periods: [{ plan: "monthly", startOn: "2024-01-01" }],
    });
    for (const startOn of ["2024-02-01", "2024-03-01", "2024-04-01"]) {
      dataOf<PeriodResult>(
        await s.addPeriod(m.id, { plan: "monthly", startOn }),
        201,
      );
    }
    expect(await s.periodRows(m.id)).toHaveLength(4);
  });

  test("BR-REC-09 another member's periods never count as an overlap", async () => {
    const a = await annual2025("Overlap Other A");
    const b = await annual2025("Overlap Other B");
    dataOf<PeriodResult>(
      await s.addPeriod(a.id, { plan: "monthly", startOn: "2026-06-01" }),
      201,
    );
    dataOf<PeriodResult>(
      await s.addPeriod(b.id, { plan: "monthly", startOn: "2026-06-01" }),
      201,
    );
  });
});

describe("E22 no overlap (BR-REC-09)", () => {
  // the member has one monthly period 2026-01-01 to 2026-01-31
  const existing = {
    plan: "monthly" as const,
    startOn: "2026-01-01",
    endOn: "2026-01-31",
  };
  const OVERLAPS: [string, PlanName, string][] = [
    ["starts inside the existing period", "monthly", "2026-01-15"],
    ["ends inside the existing period", "monthly", "2025-12-15"],
    ["contains the existing period", "annual", "2025-12-01"],
    ["shares only the last day (starts on 31 Jan)", "monthly", "2026-01-31"],
    ["shares only the first day (ends on 1 Jan)", "monthly", "2025-12-02"],
    ["starts on the same day", "monthly", "2026-01-01"],
    ["ends on 30 Jan", "monthly", "2025-12-31"],
  ];
  for (const [label, plan, startOn] of OVERLAPS) {
    test(`BR-REC-09 a period that ${label} is 409 PERIOD_OVERLAP and nothing is stored`, async () => {
      const m = await s.seedMember({
        name: `Overlap ${startOn} ${plan}`,
        joinedOn: "2025-01-01",
        periods: [existing],
      });
      const before = (await s.audit()).length;
      const reply = await s.addPeriod(m.id, { plan, startOn });
      expectError(reply, 409, "PERIOD_OVERLAP");
      expect(await s.periodRows(m.id)).toHaveLength(1);
      expect((await s.audit()).length).toBe(before);
    });
  }

  test("BR-REC-09 the day after the existing period ends is fine (1 Feb)", async () => {
    const m = await s.seedMember({
      name: "Adjacent After",
      joinedOn: "2025-01-01",
      periods: [existing],
    });
    dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn: "2026-02-01" }),
      201,
    );
  });

  test("BR-REC-09 a period that ends the day before the existing one starts is fine (ends 31 Dec)", async () => {
    const m = await s.seedMember({
      name: "Adjacent Before",
      joinedOn: "2025-01-01",
      periods: [existing],
    });
    dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn: "2025-12-01" }),
      201,
    );
  });

  test("BR-REC-09 overlap is checked against every period, not only the latest", async () => {
    const m = await s.seedMember({
      name: "Overlap Old One",
      joinedOn: "2024-01-01",
      periods: [
        { plan: "annual", startOn: "2024-01-01", endOn: "2024-12-31" },
        { plan: "annual", startOn: "2026-01-01", endOn: "2026-12-31" },
      ],
    });
    expectError(
      await s.addPeriod(m.id, { plan: "monthly", startOn: "2024-06-15" }),
      409,
      "PERIOD_OVERLAP",
    );
    // the gap in 2025 is free
    dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2025-01-01" }),
      201,
    );
  });

  test("BR-REC-09 two requests sent at the same moment for the same days: one is saved, the other is 409", async () => {
    const m = await s.seedMember({
      name: "Overlap Race",
      joinedOn: "2020-01-01",
      periods: [{ plan: "monthly", startOn: "2020-01-01" }],
    });
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        s.addPeriod(m.id, { plan: "monthly", startOn: "2026-03-01" }),
      ),
    );
    const statuses = replies.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    expect(await s.periodRows(m.id)).toHaveLength(2);
  });

  test("BR-REC-09 two requests at the same moment for partly overlapping days: only one is saved", async () => {
    const m = await s.seedMember({
      name: "Partly Overlap Race",
      joinedOn: "2020-01-01",
      periods: [{ plan: "monthly", startOn: "2020-01-01" }],
    });
    const replies = await Promise.all([
      s.addPeriod(m.id, { plan: "monthly", startOn: "2026-03-01" }),
      s.addPeriod(m.id, { plan: "monthly", startOn: "2026-03-20" }),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await s.periodRows(m.id)).toHaveLength(2);
  });

  test("BR-REC-09 periods cannot be deleted: there is no DELETE route", async () => {
    const m = await annual2025("No Period Delete");
    const periodId = m.periodIds[0] as string;
    const reply = await s.send(
      "DELETE",
      `/api/members/${m.id}/periods/${periodId}`,
    );
    expect([404, 405]).toContain(reply.status);
    expect(await s.periodRows(m.id)).toHaveLength(1);
  });
});

describe("E22 the start date against the join date (BR-REC-50)", () => {
  test("BR-REC-50 a start before the join date is 400 START_BEFORE_JOIN and nothing is stored", async () => {
    const m = await s.seedMember({
      name: "Start Before Join",
      joinedOn: "2025-06-01",
      periods: [{ plan: "annual", startOn: "2025-07-01", endOn: "2026-06-30" }],
    });
    const before = (await s.audit()).length;
    expectError(
      await s.addPeriod(m.id, { plan: "monthly", startOn: "2025-05-20" }),
      400,
      "START_BEFORE_JOIN",
    );
    expect(await s.periodRows(m.id)).toHaveLength(1);
    expect((await s.audit()).length).toBe(before);
  });

  test("BR-REC-50 a start on the join date is accepted", async () => {
    const m = await s.seedMember({
      name: "Start On Join",
      joinedOn: "2025-06-01",
      periods: [{ plan: "annual", startOn: "2025-07-01", endOn: "2026-06-30" }],
    });
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn: "2025-06-01" }),
      201,
    );
    expect(result.endOn).toBe("2025-06-30");
  });

  test("BR-REC-50 a start one day before the join date is refused", async () => {
    const m = await s.seedMember({
      name: "Start One Day Early",
      joinedOn: "2025-06-10",
      periods: [{ plan: "annual", startOn: "2025-07-01", endOn: "2026-06-30" }],
    });
    expectError(
      await s.addPeriod(m.id, { plan: "monthly", startOn: "2025-06-09" }),
      400,
      "START_BEFORE_JOIN",
    );
  });

  test("the order of answers is 404, then 400, then 409: a start before the join date that would also overlap is START_BEFORE_JOIN", async () => {
    const m = await annual2025("Order 400 Before 409");
    expectError(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2025-05-20" }),
      400,
      "START_BEFORE_JOIN",
    );
  });
});

describe("E22 request rules and errors (BR-REC-154, 156)", () => {
  test("BR-REC-154 an unknown member is 404 NOT_FOUND", async () => {
    expectError(
      await s.addPeriod(UNKNOWN_ID, { plan: "monthly", startOn: "2026-06-01" }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-154 a malformed member id is 400 VALIDATION_ERROR", async () => {
    expectError(
      await s.addPeriod("nope", { plan: "monthly", startOn: "2026-06-01" }),
      400,
      "VALIDATION_ERROR",
    );
  });

  const BAD: [string, unknown][] = [
    ["no body fields", {}],
    ["no plan", { startOn: "2026-06-01" }],
    ["no start", { plan: "monthly" }],
    ["a plan outside the four", { plan: "weekly", startOn: "2026-06-01" }],
    ["a start that is not a day", { plan: "monthly", startOn: "2026-02-30" }],
    ["a start in the wrong format", { plan: "monthly", startOn: "1/6/2026" }],
  ];
  for (const [label, body] of BAD) {
    test(`BR-REC-154 ${label} is 400 VALIDATION_ERROR and nothing is stored`, async () => {
      const m = await annual2025(`Bad Body ${label}`);
      expectError(await s.addPeriod(m.id, body), 400, "VALIDATION_ERROR");
      expect(await s.periodRows(m.id)).toHaveLength(1);
    });
  }

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    const m = await annual2025("Bad Json");
    const reply = await s.send("POST", `/api/members/${m.id}/periods`, {
      rawBody: "{nope",
      key: crypto.randomUUID(),
    });
    expectError(reply, 400, "INVALID_JSON");
  });

  test("BR-REC-156 without the Idempotency-Key header: 400 IDEMPOTENCY_KEY_MISSING and nothing is stored", async () => {
    const m = await annual2025("No Key");
    const reply = await s.addPeriod(
      m.id,
      { plan: "annual", startOn: "2026-06-01" },
      null,
    );
    expectError(reply, 400, "IDEMPOTENCY_KEY_MISSING");
    expect(await s.periodRows(m.id)).toHaveLength(1);
  });

  test("BR-REC-156 a retry with the same key and body returns the first answer and adds one period only", async () => {
    const m = await annual2025("Retry");
    const key = crypto.randomUUID();
    const body = { plan: "annual", startOn: "2026-06-01" };
    const first = await s.addPeriod(m.id, body, key);
    const retry = await s.addPeriod(m.id, body, key);
    dataOf<PeriodResult>(first, 201);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(await s.periodRows(m.id)).toHaveLength(2);
    const created = dataOf<PeriodResult>(first, 201).id;
    expect(
      await s.audit({ action: "membership.create", entityId: created }),
    ).toHaveLength(1);
  });

  test("BR-REC-156 the same key with a different body is 422 IDEMPOTENCY_KEY_REUSED and adds nothing", async () => {
    const m = await annual2025("Key Reused");
    const key = crypto.randomUUID();
    dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2026-06-01" }, key),
      201,
    );
    const reused = await s.addPeriod(
      m.id,
      { plan: "monthly", startOn: "2028-01-01" },
      key,
    );
    expectError(reused, 422, "IDEMPOTENCY_KEY_REUSED");
    expect(await s.periodRows(m.id)).toHaveLength(2);
  });

  test("BR-REC-156 a request that failed (409) frees its key: a corrected retry with the same key is saved", async () => {
    const m = await annual2025("Fail Then Fix");
    const key = crypto.randomUUID();
    expectError(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2026-05-01" }, key),
      409,
      "PERIOD_OVERLAP",
    );
    dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2026-06-01" }, key),
      201,
    );
    expect(await s.periodRows(m.id)).toHaveLength(2);
  });

  test("BR-REC-156 four identical requests at the same moment with one key add one period and all get the same answer", async () => {
    const m = await annual2025("Parallel Same Key");
    const key = crypto.randomUUID();
    const body = { plan: "annual", startOn: "2026-06-01" };
    const replies = await Promise.all(
      Array.from({ length: 4 }, () => s.addPeriod(m.id, body, key)),
    );
    for (const reply of replies) expect(reply.status).toBe(201);
    const ids = new Set(replies.map((r) => dataOf<PeriodResult>(r, 201).id));
    expect(ids.size).toBe(1);
    expect(await s.periodRows(m.id)).toHaveLength(2);
  });

  test("BR-REC-154 the success envelope is { success: true, data } with status 201", async () => {
    const m = await annual2025("Envelope");
    const reply = await s.addPeriod(m.id, {
      plan: "annual",
      startOn: "2026-06-01",
    });
    expect(reply.status).toBe(201);
    expect(reply.body?.success).toBe(true);
  });
});

describe("E22 an archived member (BR-REC-58)", () => {
  // an archived member whose only period ended long ago
  const archivedOld = (name: string) =>
    s.seedMember({
      name,
      archived: true,
      joinedOn: "2020-01-01",
      periods: [{ plan: "annual", startOn: "2020-01-01", endOn: "2020-12-31" }],
    });

  test("BR-REC-58 renewing from today brings the member back: memberRestored true, archivedAt cleared", async () => {
    const m = await archivedOld("Renew Restores");
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn: s.today() }),
      201,
    );
    expect(result.memberRestored).toBe(true);
    expect((await s.memberRow(m.id))?.archivedAt).toBeNull();
    const member = dataOf<MemberView>(await s.getMember(m.id));
    expect(member.archivedAt).toBeNull();
  });

  test("BR-REC-58 after the renewal the member is in search and on Home again", async () => {
    const endOn = s.day(5);
    const startOn = startFor("monthly", endOn);
    const m = await archivedOld("Renew Back In Lists");
    dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn }),
      201,
    );
    const found = dataOf<ListItem[]>(
      await s.list({ q: m.fullName, pageSize: 100 }),
    );
    expect(found.map((i) => i.id)).toContain(m.id);
    const home = dataOf<EndingItem[]>(
      await s.ending({ status: "expiring", pageSize: 100 }),
    );
    expect(home.map((i) => i.memberId)).toContain(m.id);
  });

  test("BR-REC-58 a period that starts today covers today", async () => {
    const m = await archivedOld("Starts Today");
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "quarterly", startOn: s.today() }),
      201,
    );
    expect(result.memberRestored).toBe(true);
  });

  test("BR-REC-58 a period that ends today covers today", async () => {
    const m = await archivedOld("Ends Today");
    const startOn = startFor("monthly", s.today());
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn }),
      201,
    );
    expect(result.endOn).toBe(s.today());
    expect(result.memberRestored).toBe(true);
  });

  test("BR-REC-58 an old binder entry (ended before today) does not restore: memberRestored false, still archived", async () => {
    const m = await archivedOld("Old Binder Entry");
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2021-01-01" }),
      201,
    );
    expect(result.memberRestored).toBe(false);
    const stored = await s.memberRow(m.id);
    expect(stored?.archivedAt).not.toBeNull();
  });

  test("BR-REC-58 a period that ended yesterday does not restore", async () => {
    const m = await archivedOld("Ended Yesterday");
    const startOn = startFor("monthly", s.day(-1));
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn }),
      201,
    );
    expect(result.memberRestored).toBe(false);
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });

  test("BR-REC-58 a period that starts tomorrow does not restore (it does not cover today)", async () => {
    const m = await archivedOld("Starts Tomorrow");
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn: s.day(1) }),
      201,
    );
    expect(result.memberRestored).toBe(false);
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });

  test("BR-REC-58 a member who is not archived gets memberRestored false even when the period covers today", async () => {
    const m = await s.seedMember({
      name: "Not Archived Renew",
      joinedOn: "2020-01-01",
      periods: [{ plan: "annual", startOn: "2020-01-01", endOn: "2020-12-31" }],
    });
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn: s.today() }),
      201,
    );
    expect(result.memberRestored).toBe(false);
    expect(await s.audit({ action: "member.restore", entityId: m.id })).toEqual(
      [],
    );
  });

  test("BR-REC-58 an archived member can be renewed at all: a refused renewal (overlap) leaves them archived", async () => {
    const m = await archivedOld("Archived Overlap");
    expectError(
      await s.addPeriod(m.id, { plan: "monthly", startOn: "2020-12-15" }),
      409,
      "PERIOD_OVERLAP",
    );
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });
});

describe("E22 change log (BR-REC-158)", () => {
  test("BR-REC-158 one membership.create row: nothing before, memberId, plan, start and end after, this sign-in", async () => {
    const m = await annual2025("Log Create");
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "quarterly", startOn: "2026-06-01" }),
      201,
    );
    const rows = await s.auditAbout(m.id, [result.id]);
    expect(rows.map((r) => r.action)).toEqual(["membership.create"]);
    expect(rows[0]).toMatchObject({
      sessionId: s.sessionId,
      entity: "membership_period",
      entityId: result.id,
    });
    const before = rows[0]?.before ?? null;
    if (before !== null) {
      for (const value of Object.values(before)) {
        expect(value ?? null).toBeNull();
      }
    }
    expect(rows[0]?.after).toEqual({
      memberId: m.id,
      plan: "quarterly",
      startOn: "2026-06-01",
      endOn: "2026-08-31",
    });
  });

  test("BR-REC-158 a renewal that restores the member writes membership.create and member.restore (the old archivedAt before, null after)", async () => {
    const archivedAt = new Date(Date.now() - 86_400_000);
    const m = await s.seedMember({
      name: "Log Restore",
      archived: archivedAt,
      joinedOn: "2020-01-01",
      periods: [{ plan: "annual", startOn: "2020-01-01", endOn: "2020-12-31" }],
    });
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "monthly", startOn: s.today() }),
      201,
    );
    expect(result.memberRestored).toBe(true);
    const rows = await s.auditAbout(m.id, [result.id]);
    expect(rows.map((r) => r.action).sort()).toEqual([
      "member.restore",
      "membership.create",
    ]);
    const restore = rows.find((r) => r.action === "member.restore");
    expect(restore).toMatchObject({
      sessionId: s.sessionId,
      entity: "member",
      entityId: m.id,
      after: { archivedAt: null },
    });
    const logged = (restore?.before as { archivedAt: string } | undefined)
      ?.archivedAt as string;
    expect(new Date(logged).getTime()).toBe(archivedAt.getTime());
  });

  test("BR-REC-158 an old binder entry on an archived member writes membership.create only", async () => {
    const m = await s.seedMember({
      name: "Log Old Entry",
      archived: true,
      joinedOn: "2020-01-01",
      periods: [{ plan: "annual", startOn: "2020-01-01", endOn: "2020-12-31" }],
    });
    const result = dataOf<PeriodResult>(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2021-01-01" }),
      201,
    );
    const rows = await s.auditAbout(m.id, [result.id]);
    expect(rows.map((r) => r.action)).toEqual(["membership.create"]);
  });

  test("BR-REC-158 a refused renewal writes nothing", async () => {
    const m = await annual2025("Log Refused");
    const before = (await s.audit()).length;
    expectError(
      await s.addPeriod(m.id, { plan: "annual", startOn: "2026-05-31" }),
      409,
      "PERIOD_OVERLAP",
    );
    expect((await s.audit()).length).toBe(before);
  });
});

describe("E22 sanity of ids", () => {
  test("BR-REC-154 a well-formed member id that does not exist is 404, never 400", async () => {
    const reply = await s.addPeriod(OTHER_UNKNOWN_ID, {
      plan: "annual",
      startOn: "2026-06-01",
    });
    expect(reply.status).toBe(404);
  });
});
