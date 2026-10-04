import { beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  addMonths,
  DUE_ROW_KEYS,
  type DueRow,
  dataOf,
  daysBetween,
  metaOf,
  type TestMember,
  type TestType,
  useDueSuite,
} from "./support";

// E31 GET /api/due (BR-REC-15, 16, 17, 94, 95, 96, 97, 104, 105; due-list.md C1-C5, C7).
// Fixtures go straight into the tables; every read is narrowed to the test's own assessment
// (`typeId`) because the test database may hold other rows. Dates are relative to the gym's today.

const s = useDueSuite();

/** The one row of `rows` for this member (fails when there are none or several). */
function only(rows: DueRow[], member: TestMember): DueRow {
  const mine = rows.filter((row) => row.memberId === member.id);
  expect(mine, `rows of ${member.fullName}`).toHaveLength(1);
  return mine[0] as DueRow;
}
const rowsOf = (rows: DueRow[], member: TestMember) =>
  rows.filter((row) => row.memberId === member.id);
const metricNames = (row: DueRow) => row.items.map((i) => i.name);

describe("BR-REC-16 one row per member and assessment", () => {
  test("Case 8 BR-REC-16 Weight overdue and Body fat due soon make ONE overdue row: earliest date, both chips", async () => {
    const type = await s.makeWeeklyType([
      "Weight",
      "Body fat",
      "Muscle mass",
      "Body water",
    ]);
    const member = await s.makeMember({ name: "surya" });
    await s.setDueDates(member, type, {
      Weight: s.day(-3),
      "Body fat": s.day(5),
    });
    const overdue = await s.listAll("overdue", { typeId: type.id });
    const row = only(overdue, member);
    expect(Object.keys(row).sort()).toEqual(DUE_ROW_KEYS);
    expect(row.memberId).toBe(member.id);
    expect(row.fullName).toBe(member.fullName);
    expect(row.typeId).toBe(type.id);
    expect(row.typeName).toBe(type.name);
    expect(row.dueOn).toBe(s.day(-3));
    expect(row.daysOverdue).toBe(3);
    expect(row.flagged).toBe(false);
    expect(metricNames(row)).toEqual(["Weight", "Body fat"]);
    expect(row.items[0]).toEqual({
      metricId: type.metrics[0]?.id ?? "",
      name: "Weight",
    });
    // not a second row in Due soon
    const soon = await s.listAll("upcoming", { typeId: type.id });
    expect(rowsOf(soon, member)).toEqual([]);
  });

  test("Case 9 BR-REC-16 four items due, two saved today: the row stays with two chips; when all are saved it goes", async () => {
    const type = await s.makeWeeklyType([
      "Weight",
      "Body fat",
      "Muscle mass",
      "Body water",
    ]);
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    const [weight, bodyFat, muscle, water] = type.metrics;
    const all = await s.listAll("overdue", { typeId: type.id });
    expect(metricNames(only(all, member))).toEqual([
      "Weight",
      "Body fat",
      "Muscle mass",
      "Body water",
    ]);

    await s.record(member.id, type.id, s.today(), [
      weight?.id ?? "",
      bodyFat?.id ?? "",
    ]);
    const half = await s.listAll("overdue", { typeId: type.id });
    expect(metricNames(only(half, member))).toEqual([
      "Muscle mass",
      "Body water",
    ]);

    await s.record(member.id, type.id, s.day(-1), [
      muscle?.id ?? "",
      water?.id ?? "",
    ]);
    // Muscle and Body water now have a value dated yesterday: due in 27 days
    const done = await s.listAll("overdue", { typeId: type.id });
    expect(rowsOf(done, member)).toEqual([]);
    expect(
      rowsOf(await s.listAll("upcoming", { typeId: type.id }), member),
    ).toEqual([]);
  });

  test("BR-REC-16 members are listed one by one; one who is up to date is not listed", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const late = await s.makeMember({ name: "late" });
    const fine = await s.makeMember({ name: "fine" });
    await s.setDueDates(late, type, { Weight: s.day(-4) });
    await s.setDueDates(fine, type, { Weight: s.day(20) });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rows.map((r) => r.memberId)).toEqual([late.id]);
  });

  test("BR-REC-16 one member can be on the list for two assessments, one row each", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 200_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 200_002 });
    const member = await s.makeMember();
    await s.setDueDates(member, a, { Weight: s.day(-2) });
    await s.setDueDates(member, b, { "Push-ups": s.day(-2) });
    const rows = await s.listAll("overdue", { typeIds: [a.id, b.id] });
    expect(rows.map((r) => r.typeId)).toEqual([a.id, b.id]);
    expect(rows.map((r) => r.typeName)).toEqual([a.name, b.name]);
  });

  test("BR-REC-16 the answer carries the real full name of the member", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ name: "Surya Pratap" });
    await s.setDueDates(member, type, { Weight: s.day(-1) });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(only(rows, member).fullName).toBe("TEST_due_Surya Pratap");
  });
});

describe("Due examples through the API (BR-REC-15, 96, 105; Cases 1, 2, 4, 6, 7)", () => {
  const cases: [string, number, "overdue" | "upcoming" | null][] = [
    ["due in 8 days (outside the 7-day window)", 8, null],
    ["due in 7 days (edge of the window)", 7, "upcoming"],
    ["due in 3 days", 3, "upcoming"],
    ["due tomorrow", 1, "upcoming"],
    ["due today", 0, "upcoming"],
    ["due yesterday", -1, "overdue"],
    ["due 2 days ago", -2, "overdue"],
    ["due 3 days ago", -3, "overdue"],
    ["due 60 days ago", -60, "overdue"],
  ];
  for (const [label, offset, tab] of cases) {
    test(`BR-REC-96 / 105 ${label}: ${tab ? `${tab}, daysOverdue ${-offset}` : "not listed"}`, async () => {
      const type = await s.makeWeeklyType(["Weight"]);
      const member = await s.makeMember();
      await s.setDueDates(member, type, { Weight: s.day(offset) });
      const overdue = await s.listAll("overdue", { typeId: type.id });
      const upcoming = await s.listAll("upcoming", { typeId: type.id });
      if (tab === null) {
        expect(rowsOf(overdue, member)).toEqual([]);
        expect(rowsOf(upcoming, member)).toEqual([]);
        return;
      }
      const other = tab === "overdue" ? upcoming : overdue;
      expect(rowsOf(other, member)).toEqual([]);
      const row = only(tab === "overdue" ? overdue : upcoming, member);
      expect(row.dueOn).toBe(s.day(offset));
      expect(row.daysOverdue).toBe(0 - offset);
      expect(row.flagged).toBe(false);
      expect(metricNames(row)).toEqual(["Weight"]);
    });
  }

  test("Case 4 BR-REC-15 never recorded: due on the join date, overdue 124 days", async () => {
    const type = await s.makeWeeklyType(["Pull-ups"]);
    const member = await s.makeMember({ joinedOn: s.day(-124) });
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(row.dueOn).toBe(s.day(-124));
    expect(row.daysOverdue).toBe(124);
    expect(metricNames(row)).toEqual(["Pull-ups"]);
  });

  test("BR-REC-15 never recorded and joined today: due today, so Due soon, no repeat added to the join date", async () => {
    const type = await s.makeWeeklyType(["Pull-ups"]);
    const member = await s.makeMember({ joinedOn: s.today() });
    const row = only(await s.listAll("upcoming", { typeId: type.id }), member);
    expect(row.dueOn).toBe(s.today());
    expect(row.daysOverdue).toBe(0);
  });

  test("BR-REC-15 never recorded and joined 5 days ago: overdue 5 days (join date, not join date + repeat)", async () => {
    const type = await s.makeWeeklyType(["Pull-ups"]);
    const member = await s.makeMember({ joinedOn: s.day(-5) });
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(row.dueOn).toBe(s.day(-5));
    expect(row.daysOverdue).toBe(5);
  });

  test("BR-REC-15 / 94 calendar months: the due day is the last value + months, month end clamped", async () => {
    const type = await s.makeType({ intervalCount: 1, intervalUnit: "month" });
    const weight = await s.makeMetric(type, "Weight");
    const member = await s.makeMember({ joinedOn: "2025-01-01" });
    // 31 Jan 2026 + 1 month = 28 Feb 2026 (Case 5); that is long past on any run date
    await s.record(member.id, type.id, "2026-01-31", [weight.id]);
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(row.dueOn).toBe("2026-02-28");
    expect(row.daysOverdue).toBe(daysBetween("2026-02-28", s.today()));
  });

  test("BR-REC-15 / 94 calendar months from a recent value: last value 2 months ago + 1 month", async () => {
    const type = await s.makeType({ intervalCount: 1, intervalUnit: "month" });
    const weight = await s.makeMetric(type, "Weight");
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const last = addMonths(s.today(), -2);
    await s.record(member.id, type.id, last, [weight.id]);
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(row.dueOn).toBe(addMonths(last, 1));
    expect(row.daysOverdue).toBe(daysBetween(addMonths(last, 1), s.today()));
  });

  test("BR-REC-94 a 2-week repeat adds 14 days to the last value", async () => {
    const type = await s.makeWeeklyType(["Plank"], { weeks: 2 });
    const member = await s.makeMember();
    await s.record(member.id, type.id, addDays(s.today(), -13), [
      type.metrics[0]?.id ?? "",
    ]);
    // last value 13 days ago + 14 days = tomorrow (Case 6: Due soon, due tomorrow)
    const row = only(await s.listAll("upcoming", { typeId: type.id }), member);
    expect(row.dueOn).toBe(s.day(1));
    expect(row.daysOverdue).toBe(-1);
  });
});

describe("C1 every measurement has its own due date", () => {
  test("C1 the latest value of a measurement counts, not an older one", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const weight = type.metrics[0]?.id ?? "";
    await s.record(member.id, type.id, s.day(-100), [weight]);
    await s.record(member.id, type.id, s.day(-5), [weight]);
    await s.record(member.id, type.id, s.day(-60), [weight]);
    // latest value 5 days ago + 4 weeks = in 23 days: not due
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toEqual([]);
    expect(
      rowsOf(await s.listAll("upcoming", { typeId: type.id }), member),
    ).toEqual([]);
  });

  test("C1 a measurement is due by its own last value, not by the date of the assessment's latest save", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    const [weight, bodyFat] = type.metrics;
    // Body fat was only in the older save (60 days ago); Weight is in both
    await s.record(member.id, type.id, s.day(-60), [
      weight?.id ?? "",
      bodyFat?.id ?? "",
    ]);
    await s.record(member.id, type.id, s.day(-5), [weight?.id ?? ""]);
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(metricNames(row)).toEqual(["Body fat"]);
    expect(row.dueOn).toBe(s.day(-60 + 28));
    expect(row.daysOverdue).toBe(32);
  });

  test("C1 other members' values do not make this member up to date", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const done = await s.makeMember({ name: "done" });
    const idle = await s.makeMember({ name: "idle", joinedOn: s.day(-9) });
    await s.setDueDates(done, type, {});
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rows.map((r) => r.memberId)).toEqual([idle.id]);
    expect(rows[0]?.daysOverdue).toBe(9);
  });

  test("C1 a measurement with its own repeat uses it instead of the assessment's", async () => {
    const type = await s.makeWeeklyType(["Fran"], { weeks: 4 });
    const fran = type.metrics[0];
    expect(fran).toBeDefined();
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.record(member.id, type.id, s.day(-40), [fran?.id ?? ""]);
    // the assessment's 4 weeks would make it due 12 days ago
    expect(
      metricNames(
        only(await s.listAll("overdue", { typeId: type.id }), member),
      ),
    ).toEqual(["Fran"]);
    // its own 12 weeks: due in 44 days, not listed
    await s.setMetricInterval(fran?.id ?? "", 12, "week");
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toEqual([]);
    // its own 1 week: due 33 days ago
    await s.setMetricInterval(fran?.id ?? "", 1, "week");
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(row.dueOn).toBe(s.day(-33));
  });

  test("Case 3 BR-REC-15 Fran has its own repeat in an assessment of another repeat: only the others are due", async () => {
    const type = await s.makeWeeklyType(["Push-ups", "Fran"], { weeks: 8 });
    const [pushUps, fran] = type.metrics;
    await s.setMetricInterval(fran?.id ?? "", 12, "week");
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    // both last done 60 days ago: Push-ups (8 weeks) was due 4 days ago, Fran (12 weeks) is due in 24 days
    await s.record(member.id, type.id, s.day(-60), [
      pushUps?.id ?? "",
      fran?.id ?? "",
    ]);
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(metricNames(row)).toEqual(["Push-ups"]);
    expect(row.dueOn).toBe(s.day(-4));
  });

  test("C1 Changing a repeat in Setup changes the next answer: nothing is stored", async () => {
    const type = await s.makeWeeklyType(["Weight"], { weeks: 4 });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.record(member.id, type.id, s.day(-20), [type.metrics[0]?.id ?? ""]);
    // 4 weeks: due in 8 days, outside the 7-day window
    expect(
      rowsOf(await s.listAll("upcoming", { typeId: type.id }), member),
    ).toEqual([]);
    // 3 weeks: due tomorrow
    await s.setTypeInterval(type.id, 3, "week");
    const soon = only(await s.listAll("upcoming", { typeId: type.id }), member);
    expect(soon.dueOn).toBe(s.day(1));
    // 2 weeks: due 6 days ago
    await s.setTypeInterval(type.id, 2, "week");
    const late = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(late.dueOn).toBe(s.day(-6));
    expect(late.daysOverdue).toBe(6);
  });
});

describe("BR-REC-95 only turned-on assessments and measurements are ever due", () => {
  test("Case 14 BR-REC-95 a turned-off measurement that was never recorded is never a chip", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body age"]);
    const bodyAge = type.metrics[1];
    await s.setMetricActive(bodyAge?.id ?? "", false);
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    await s.setDueDates(member, type, { Weight: s.day(-2), "Body age": null });
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(metricNames(row)).toEqual(["Weight"]);
  });

  test("BR-REC-95 a member whose only unrecorded measurement is turned off is not listed", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body age"]);
    await s.setMetricActive(type.metrics[1]?.id ?? "", false);
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    await s.setDueDates(member, type, { Weight: s.day(20), "Body age": null });
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toEqual([]);
    expect(
      rowsOf(await s.listAll("upcoming", { typeId: type.id }), member),
    ).toEqual([]);
  });

  test("BR-REC-95 turning a measurement off removes its chip at the next read; turning it on brings it back", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    const bodyFat = type.metrics[1]?.id ?? "";
    expect(
      metricNames(
        only(await s.listAll("overdue", { typeId: type.id }), member),
      ),
    ).toEqual(["Weight", "Body fat"]);
    await s.setMetricActive(bodyFat, false);
    expect(
      metricNames(
        only(await s.listAll("overdue", { typeId: type.id }), member),
      ),
    ).toEqual(["Weight"]);
    await s.setMetricActive(bodyFat, true);
    expect(
      metricNames(
        only(await s.listAll("overdue", { typeId: type.id }), member),
      ),
    ).toEqual(["Weight", "Body fat"]);
  });

  test("C1 an assessment with no turned-on measurement is never listed", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    for (const metric of type.metrics)
      await s.setMetricActive(metric.id, false);
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    const reply = await s.list({ status: "overdue", typeId: type.id });
    expect(dataOf<DueRow[]>(reply)).toEqual([]);
    expect(metaOf(reply).total).toBe(0);
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toEqual([]);
  });

  test("BR-REC-95 a turned-off assessment has no rows; turned on again, the rows are back", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    await s.setTypeActive(type.id, false);
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toEqual([]);
    expect(
      rowsOf(await s.listAll("overdue", { typeIds: [type.id] }), member),
    ).toEqual([]);
    await s.setTypeActive(type.id, true);
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toHaveLength(1);
  });

  test("BR-REC-95 the chips of an assessment keep setup order, not creation or name order", async () => {
    const type = await s.makeType({ intervalCount: 4, intervalUnit: "week" });
    await s.makeMetric(type, "Zeta", { sortOrder: 3 });
    await s.makeMetric(type, "Alpha", { sortOrder: 1 });
    await s.makeMetric(type, "Mid", { sortOrder: 2 });
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(metricNames(row)).toEqual(["Alpha", "Mid", "Zeta"]);
  });
});

describe("BR-REC-17 who is left out (C3)", () => {
  async function scenario() {
    const type = await s.makeWeeklyType(["Weight"]);
    const make = async (
      name: string,
      options: Parameters<typeof s.makeMember>[0] = {},
    ) => {
      const member = await s.makeMember({
        name,
        joinedOn: s.day(-30),
        ...options,
      });
      await s.setDueDates(member, type, { Weight: s.day(-3) });
      return member;
    };
    return { type, make };
  }

  test("Case 16 BR-REC-17 an archived member is not listed", async () => {
    const { type, make } = await scenario();
    const archived = await make("archived", {
      archived: true,
      periods: [{ startOn: s.day(-100), endOn: s.day(200) }],
    });
    const active = await make("active", {
      periods: [{ startOn: s.day(-100), endOn: s.day(200) }],
    });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rowsOf(rows, archived)).toEqual([]);
    expect(rowsOf(rows, active)).toHaveLength(1);
  });

  test("Case 10 BR-REC-17 a member whose membership ended yesterday is not listed", async () => {
    const { type, make } = await scenario();
    const expired = await make("expired", {
      periods: [{ startOn: s.day(-366), endOn: s.day(-1) }],
    });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rowsOf(rows, expired)).toEqual([]);
    const reply = await s.list({ status: "overdue", typeId: type.id });
    expect(metaOf(reply).total).toBe(0);
  });

  test("Case 11 BR-REC-17 a membership that ends soon still lists the member; one ending today too", async () => {
    const { type, make } = await scenario();
    const soon = await make("soon", {
      periods: [{ startOn: s.day(-360), endOn: s.day(5) }],
    });
    const today = await make("today", {
      periods: [{ startOn: s.day(-360), endOn: s.today() }],
    });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rowsOf(rows, soon)).toHaveLength(1);
    expect(rowsOf(rows, today)).toHaveLength(1);
  });

  test("C3 a member with no membership at all is listed", async () => {
    const { type, make } = await scenario();
    const nobody = await make("nomembership", { periods: [] });
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), nobody),
    ).toHaveLength(1);
  });

  test("C3 the latest membership counts: an old ended one plus a current renewal is listed", async () => {
    const { type, make } = await scenario();
    const renewed = await make("renewed", {
      periods: [
        { startOn: s.day(-800), endOn: s.day(-436) },
        { startOn: s.day(-435), endOn: s.day(-70) },
        { startOn: s.day(-69), endOn: s.day(296) },
      ],
    });
    const lapsed = await make("lapsed", {
      periods: [
        { startOn: s.day(-800), endOn: s.day(-436) },
        { startOn: s.day(-435), endOn: s.day(-70) },
      ],
    });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rowsOf(rows, renewed)).toHaveLength(1);
    expect(rowsOf(rows, lapsed)).toEqual([]);
  });

  test("C3 a renewal that has not started yet keeps the member listed", async () => {
    const { type, make } = await scenario();
    const early = await make("early", {
      periods: [
        { startOn: s.day(-360), endOn: s.day(-1) },
        { startOn: s.day(5), endOn: s.day(369) },
      ],
    });
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), early),
    ).toHaveLength(1);
  });

  test("BR-REC-17 an archived member is left out of Due soon too", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const archived = await s.makeMember({ archived: true });
    const live = await s.makeMember();
    await s.setDueDates(archived, type, { Weight: s.day(3) });
    await s.setDueDates(live, type, { Weight: s.day(3) });
    const rows = await s.listAll("upcoming", { typeId: type.id });
    expect(rows.map((r) => r.memberId)).toEqual([live.id]);
  });

  test("BR-REC-17 an expired member is left out of Due soon and out of meta.total", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const expired = await s.makeMember({
      periods: [{ startOn: s.day(-400), endOn: s.day(-35) }],
    });
    const live = await s.makeMember();
    await s.setDueDates(expired, type, { Weight: s.day(3) });
    await s.setDueDates(live, type, { Weight: s.day(3) });
    const reply = await s.list({ status: "upcoming", typeId: type.id });
    expect(dataOf<DueRow[]>(reply).map((r) => r.memberId)).toEqual([live.id]);
    expect(metaOf(reply).total).toBe(1);
  });
});

describe("BR-REC-18, 97, 98 Assess soon rows (C4)", () => {
  test("Case 12 BR-REC-98 Assess soon with nothing due: first row, flagged, every turned-on item", async () => {
    const type = await s.makeWeeklyType([
      "Push-ups",
      "Pull-ups",
      "Fran",
      "Body age",
    ]);
    await s.setMetricActive(type.metrics[3]?.id ?? "", false);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, {});
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    const rows = await s.listAll("overdue", { typeId: type.id });
    const row = only(rows, member);
    expect(row.flagged).toBe(true);
    expect(metricNames(row)).toEqual(["Push-ups", "Pull-ups", "Fran"]);
    // dueOn = the earliest due date among the turned-on measurements: everything was done today
    expect(row.dueOn).toBe(s.day(28));
    expect(row.daysOverdue).toBe(-28);
    expect(Object.keys(row).sort()).toEqual(DUE_ROW_KEYS);
  });

  test("C4 an Assess soon row is never in Due soon, whatever its dates", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, {
      Weight: s.day(3),
      "Body fat": s.day(4),
    });
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    expect(
      rowsOf(await s.listAll("upcoming", { typeId: type.id }), member),
    ).toEqual([]);
    const row = only(await s.listAll("overdue", { typeId: type.id }), member);
    expect(row.flagged).toBe(true);
    // chips: every turned-on measurement, not just the due ones; dueOn the earliest of them
    expect(metricNames(row)).toEqual(["Weight", "Body fat"]);
    expect(row.dueOn).toBe(s.day(3));
    expect(row.daysOverdue).toBe(-3);
  });

  test("C4 an Assess soon row of a member who is also overdue is one row with every item", async () => {
    const type = await s.makeWeeklyType(["Weight", "Body fat", "Muscle mass"]);
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, type, { Weight: s.day(-6) });
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    const rows = await s.listAll("overdue", { typeId: type.id });
    const row = only(rows, member);
    expect(row.flagged).toBe(true);
    expect(metricNames(row)).toEqual(["Weight", "Body fat", "Muscle mass"]);
    expect(row.dueOn).toBe(s.day(-6));
    expect(row.daysOverdue).toBe(6);
  });

  test("BR-REC-18 an Assess soon of one assessment does not touch the member's other assessment", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 210_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 210_002 });
    const member = await s.makeMember({ joinedOn: s.day(-400) });
    await s.setDueDates(member, a, { Weight: s.day(-2) });
    await s.setDueDates(member, b, { "Push-ups": s.day(-2) });
    await s.insertOverride({
      memberId: member.id,
      typeId: a.id,
      kind: "flag",
      setOn: s.today(),
    });
    const rows = await s.listAll("overdue", { typeIds: [a.id, b.id] });
    expect(rows.map((r) => [r.typeId, r.flagged])).toEqual([
      [a.id, true],
      [b.id, false],
    ]);
  });

  test("BR-REC-17 an archived member's Assess soon row is not listed", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({ archived: true });
    await s.setDueDates(member, type, {});
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toEqual([]);
  });

  test("BR-REC-17 an Expired member's Assess soon row is not listed", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember({
      periods: [{ startOn: s.day(-400), endOn: s.day(-35) }],
    });
    await s.setDueDates(member, type, {});
    await s.insertOverride({
      memberId: member.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    expect(
      rowsOf(await s.listAll("overdue", { typeId: type.id }), member),
    ).toEqual([]);
  });

  test("BR-REC-18 meta.total counts the Assess soon rows in Overdue and leaves them out of Due soon", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const flagged = await s.makeMember({ name: "flagged" });
    const late = await s.makeMember({ name: "late" });
    const soon = await s.makeMember({ name: "soon" });
    await s.setDueDates(flagged, type, {});
    await s.setDueDates(late, type, { Weight: s.day(-4) });
    await s.setDueDates(soon, type, { Weight: s.day(4) });
    await s.insertOverride({
      memberId: flagged.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    const overdue = await s.list({ status: "overdue", typeId: type.id });
    const upcoming = await s.list({ status: "upcoming", typeId: type.id });
    expect(metaOf(overdue).total).toBe(2);
    expect(dataOf<DueRow[]>(overdue).map((r) => r.memberId)).toEqual([
      flagged.id,
      late.id,
    ]);
    expect(metaOf(upcoming).total).toBe(1);
    expect(dataOf<DueRow[]>(upcoming).map((r) => r.memberId)).toEqual([
      soon.id,
    ]);
  });
});

describe("BR-REC-97 order (C5): both tabs, fixed", () => {
  test("BR-REC-97 Assess soon first, then most days overdue, then name A-Z ignoring case, then assessment setup order", async () => {
    const a = await s.makeWeeklyType(["Weight"], { sortOrder: 220_001 });
    const b = await s.makeWeeklyType(["Push-ups"], { sortOrder: 220_002 });
    const flagged = await s.makeMember({ name: "flagged" });
    const old = await s.makeMember({ name: "old" });
    const anita = await s.makeMember({ name: "anita" });
    const bala = await s.makeMember({ name: "Bala" });
    const chitra = await s.makeMember({ name: "Chitra" });
    const newer = await s.makeMember({ name: "newer" });
    await s.setDueDates(flagged, a, {});
    await s.insertOverride({
      memberId: flagged.id,
      typeId: a.id,
      kind: "flag",
      setOn: s.today(),
    });
    await s.setDueDates(old, a, { Weight: s.day(-90) });
    await s.setDueDates(anita, a, { Weight: s.day(-5) });
    await s.setDueDates(bala, a, { Weight: s.day(-5) });
    await s.setDueDates(chitra, a, { Weight: s.day(-5) });
    await s.setDueDates(chitra, b, { "Push-ups": s.day(-5) });
    await s.setDueDates(newer, a, { Weight: s.day(-1) });
    // everyone else is up to date on the second assessment (never recorded would make them due)
    for (const member of [flagged, old, anita, bala, newer]) {
      await s.setDueDates(member, b, {});
    }

    const rows = await s.listAll("overdue", { typeIds: [a.id, b.id] });
    expect(
      rows.map(
        (r) =>
          `${r.fullName.replace("TEST_due_", "")}/${r.typeId === a.id ? "A" : "B"}`,
      ),
    ).toEqual([
      "flagged/A",
      "old/A",
      "anita/A",
      "Bala/A",
      "Chitra/A",
      "Chitra/B",
      "newer/A",
    ]);
  });

  test("BR-REC-97 an Assess soon row is above a row 90 days overdue even when its own dates are later", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const flagged = await s.makeMember({ name: "zz-flagged" });
    const old = await s.makeMember({ name: "aa-old" });
    await s.setDueDates(flagged, type, { Weight: s.day(30) });
    await s.setDueDates(old, type, { Weight: s.day(-90) });
    await s.insertOverride({
      memberId: flagged.id,
      typeId: type.id,
      kind: "flag",
      setOn: s.today(),
    });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rows.map((r) => r.memberId)).toEqual([flagged.id, old.id]);
  });

  test("C5 a later name with an earlier due date comes first: the date is compared before the name", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const aaron = await s.makeMember({ name: "Aaron" });
    const zed = await s.makeMember({ name: "Zed" });
    await s.setDueDates(aaron, type, { Weight: s.day(-2) });
    await s.setDueDates(zed, type, { Weight: s.day(-10) });
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rows.map((r) => r.memberId)).toEqual([zed.id, aaron.id]);
  });

  test("BR-REC-97 Due soon lists the soonest due first", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const six = await s.makeMember({ name: "aaa" });
    const two = await s.makeMember({ name: "bbb" });
    const zero = await s.makeMember({ name: "ccc" });
    await s.setDueDates(six, type, { Weight: s.day(6) });
    await s.setDueDates(two, type, { Weight: s.day(2) });
    await s.setDueDates(zero, type, { Weight: s.today() });
    const rows = await s.listAll("upcoming", { typeId: type.id });
    expect(rows.map((r) => r.memberId)).toEqual([zero.id, two.id, six.id]);
    expect(rows.map((r) => r.daysOverdue)).toEqual([0, -2, -6]);
  });

  test("C5 same date, same name, same assessment: the member id decides (the order is stable between calls)", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const one = await s.makeMember({ name: "Twin" });
    const two = await s.makeMember({ name: "Twin" });
    await s.setDueDates(one, type, { Weight: s.day(-3) });
    await s.setDueDates(two, type, { Weight: s.day(-3) });
    const expected = [one.id, two.id].sort();
    for (let i = 0; i < 3; i++) {
      const rows = await s.listAll("overdue", { typeId: type.id });
      expect(rows.map((r) => r.memberId)).toEqual(expected);
    }
  });

  test("C5 names compare ignoring case, even for names that differ only in case", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const lower = await s.makeMember({ name: "anita" });
    const upper = await s.makeMember({ name: "Bala" });
    const upperA = await s.makeMember({ name: "Carl" });
    for (const m of [lower, upper, upperA]) {
      await s.setDueDates(m, type, { Weight: s.day(-3) });
    }
    const rows = await s.listAll("overdue", { typeId: type.id });
    expect(rows.map((r) => r.memberId)).toEqual([
      lower.id,
      upper.id,
      upperA.id,
    ]);
  });
});

describe("BR-REC-104 filter and 25 per page", () => {
  test("BR-REC-104 the typeId filter keeps only that assessment's rows, in both tabs", async () => {
    const body = await s.makeWeeklyType(["Weight"], { sortOrder: 230_001 });
    const fit = await s.makeWeeklyType(["Fran"], { sortOrder: 230_002 });
    const member = await s.makeMember();
    const other = await s.makeMember();
    await s.setDueDates(member, body, { Weight: s.day(-3) });
    await s.setDueDates(member, fit, { Fran: s.day(-3) });
    await s.setDueDates(other, fit, { Fran: s.day(4) });
    await s.setDueDates(other, body, {});

    const fitOverdue = await s.list({ status: "overdue", typeId: fit.id });
    expect(dataOf<DueRow[]>(fitOverdue).map((r) => r.typeId)).toEqual([fit.id]);
    expect(metaOf(fitOverdue).total).toBe(1);
    const fitSoon = await s.list({ status: "upcoming", typeId: fit.id });
    expect(dataOf<DueRow[]>(fitSoon).map((r) => r.memberId)).toEqual([
      other.id,
    ]);
    expect(metaOf(fitSoon).total).toBe(1);
    const bodyOverdue = await s.list({ status: "overdue", typeId: body.id });
    expect(dataOf<DueRow[]>(bodyOverdue).map((r) => r.typeId)).toEqual([
      body.id,
    ]);
    expect(metaOf(bodyOverdue).total).toBe(1);
    // without a filter both of the member's rows are in the list
    const unfiltered = await s.listAll("overdue", {
      typeIds: [body.id, fit.id],
    });
    expect(unfiltered.filter((r) => r.memberId === member.id)).toHaveLength(2);
  });

  describe("paging over 30 members", () => {
    let type: TestType;
    let expectedOrder: string[] = [];

    beforeAll(async () => {
      type = await s.makeWeeklyType(["Weight"]);
      // member i is due i days ago (i = 1..30): most overdue is i = 30
      const made: { id: string; i: number }[] = [];
      for (let i = 1; i <= 30; i++) {
        const member = await s.makeMember({
          name: `p${String(i).padStart(2, "0")}`,
        });
        await s.setDueDates(member, type, { Weight: addDays(s.today(), -i) });
        made.push({ id: member.id, i });
      }
      s.keep(made.map((m) => m.id)); // shared by the tests below: stay active
      expectedOrder = made.sort((a, b) => b.i - a.i).map((m) => m.id);
    });

    test("BR-REC-104 pageSize 25: 25 rows, then the other 5; meta says 30 rows on 2 pages", async () => {
      const first = await s.list({
        status: "overdue",
        typeId: type.id,
        pageSize: 25,
      });
      const rows1 = dataOf<DueRow[]>(first);
      expect(rows1.map((r) => r.memberId)).toEqual(expectedOrder.slice(0, 25));
      expect(metaOf(first)).toEqual({
        page: 1,
        pageSize: 25,
        total: 30,
        totalPages: 2,
      });
      const second = await s.list({
        status: "overdue",
        typeId: type.id,
        pageSize: 25,
        page: 2,
      });
      expect(dataOf<DueRow[]>(second).map((r) => r.memberId)).toEqual(
        expectedOrder.slice(25),
      );
      expect(metaOf(second)).toEqual({
        page: 2,
        pageSize: 25,
        total: 30,
        totalPages: 2,
      });
    });

    test("BR-REC-155 the default page is 10 rows", async () => {
      const reply = await s.list({ status: "overdue", typeId: type.id });
      expect(dataOf<DueRow[]>(reply).map((r) => r.memberId)).toEqual(
        expectedOrder.slice(0, 10),
      );
      expect(metaOf(reply)).toEqual({
        page: 1,
        pageSize: 10,
        total: 30,
        totalPages: 3,
      });
    });

    test("Home asks for 5: the first 5 rows and the real total", async () => {
      const reply = await s.list({
        status: "overdue",
        typeId: type.id,
        pageSize: 5,
      });
      expect(dataOf<DueRow[]>(reply).map((r) => r.memberId)).toEqual(
        expectedOrder.slice(0, 5),
      );
      expect(metaOf(reply)).toEqual({
        page: 1,
        pageSize: 5,
        total: 30,
        totalPages: 6,
      });
    });

    test("paging cuts one list: all pages of 7 put together are the whole ordered list", async () => {
      const seen: string[] = [];
      for (let page = 1; page <= 5; page++) {
        const reply = await s.list({
          status: "overdue",
          typeId: type.id,
          pageSize: 7,
          page,
        });
        seen.push(...dataOf<DueRow[]>(reply).map((r) => r.memberId));
      }
      expect(seen).toEqual(expectedOrder);
    });

    test("a page past the end is 200 with no rows and the same meta total", async () => {
      const reply = await s.list({
        status: "overdue",
        typeId: type.id,
        pageSize: 25,
        page: 3,
      });
      expect(dataOf<DueRow[]>(reply)).toEqual([]);
      const meta = metaOf(reply);
      expect([meta.pageSize, meta.total, meta.totalPages]).toEqual([25, 30, 2]);
    });

    test("an empty list is 200 with total 0 and one (empty) page", async () => {
      const reply = await s.list({ status: "upcoming", typeId: type.id });
      expect(dataOf<DueRow[]>(reply)).toEqual([]);
      // standards §pagination: totalPages = max(1, ceil(total / pageSize))
      expect(metaOf(reply)).toEqual({
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
      });
    });
  });
});
