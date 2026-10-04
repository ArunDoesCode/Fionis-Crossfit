import { beforeAll, describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  type Detail,
  dataOf,
  expectError,
  expectInvalid,
  type ListItem,
  type SeededMember,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E29 PATCH /api/assessments/:assessmentId: move an assessment's date and/or mark it estimated.
// BR-REC-87 (moving onto a date that already has the assessment is refused), BR-REC-83 (no future date),
// BR-REC-166 (values move with it), BR-REC-157 (update bodies), BR-REC-58 (archived members),
// BR-REC-92 (editable at any time), build clarification D8.

const s = useAssessmentsSuite();

let body: SeededType;

beforeAll(async () => {
  body = await s.seedType();
});

/** 12 Mar 2025 body composition with four values. */
async function seedMarch(
  m: SeededMember,
  options: { isEstimated?: boolean } = {},
) {
  return s.seedAssessment({
    member: m,
    type: body,
    date: "2025-03-12",
    isEstimated: options.isEstimated ?? false,
    values: [
      [body.metric("Weight"), 95.5],
      [body.metric("Visceral fat"), 8],
      [body.metric("Plank"), 122],
      [body.metric("Waist"), 91],
    ],
  });
}

describe("E29 moving the date (BR-REC-166, D8)", () => {
  test("BR-REC-166 moving 12 Mar to 15 Mar answers the assessment on its new date with the same values", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-15" }));
    expect(detail.id).toBe(a.id);
    expect(detail.date).toBe("2025-03-15");
    expect(detail.memberId).toBe(m.id);
    expect(detail.values.map((v) => [v.name, v.value])).toEqual([
      ["Weight", 95.5],
      ["Visceral fat", 8],
      ["Plank", 122],
      ["Waist", 91],
    ]);
  });

  test("BR-REC-166 all four values now carry the new date, and the assessment row too", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    await s.patch(a.id, { date: "2025-03-15" });
    expect((await s.assessmentRow(a.id))?.assessedOn).toBe("2025-03-15");
    const rows = await s.measurementRows(a.id);
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.measuredOn).toBe("2025-03-15");
      expect(row.memberId).toBe(m.id);
    }
  });

  test("BR-REC-166 values of the member's other assessments keep their dates", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const other = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-06-12",
      values: [[body.metric("Weight"), 94]],
    });
    expect((await s.patch(a.id, { date: "2025-03-15" })).status).toBe(200);
    const rows = await s.measurementRows(other.id);
    expect(rows.map((r) => r.measuredOn)).toEqual(["2025-06-12"]);
    expect((await s.assessmentRow(other.id))?.assessedOn).toBe("2025-06-12");
  });

  test("BR-REC-166 E28, E25 and E27 follow the move", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    await s.patch(a.id, { date: "2025-03-15" });
    expect(dataOf<Detail>(await s.detail(a.id)).date).toBe("2025-03-15");
    expect((await s.formOf(m.id, body.id, "2025-03-12")).existing).toBeNull();
    expect(
      (await s.formOf(m.id, body.id, "2025-03-15")).existing?.assessmentId,
    ).toBe(a.id);
    const list = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    expect(list.map((i) => [i.id, i.date])).toEqual([[a.id, "2025-03-15"]]);
  });

  test("BR-REC-81 'previous' of later forms follows the moved values", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    await s.patch(a.id, { date: "2025-09-12" });
    const before = await s.formOf(m.id, body.id, "2025-06-01");
    expect(before.metrics.every((x) => x.previous === null)).toBe(true);
    const after = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = after.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous?.on).toBe("2025-09-12");
    expect(weight?.previous?.value).toBe(95.5);
  });

  test("BR-REC-88 E16 lastAssessedOn follows the move at once", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2025-03-12");
    await s.patch(a.id, { date: "2025-09-12" });
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2025-09-12");
  });

  test("D8 moving to the date it already has is fine (not 'taken') and changes nothing", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-12" }));
    expect(detail.date).toBe("2025-03-12");
    expect(detail.values.length).toBe(4);
    expect((await s.measurementRows(a.id)).length).toBe(4);
  });

  test("BR-REC-83 moving to today is allowed", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const detail = dataOf<Detail>(await s.patch(a.id, { date: s.today() }));
    expect(detail.date).toBe(s.today());
  });

  test("BR-REC-83 moving to a date before the member joined is allowed (only a warning in the app)", async () => {
    const m = await s.seedMember({ joinedOn: "2025-06-01" });
    const a = await seedMarch(m);
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2024-01-15" }));
    expect(detail.date).toBe("2024-01-15");
  });

  test("BR-REC-58 an archived member's assessment can be moved", async () => {
    const m = await s.seedMember({ archived: true });
    const a = await seedMarch(m);
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-15" }));
    expect(detail.date).toBe("2025-03-15");
  });

  test("D4 an assessment of a turned-off type can be moved", async () => {
    const t = await s.seedType({ isActive: false });
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [[t.metric("Weight"), 95]],
    });
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-15" }));
    expect(detail.date).toBe("2025-03-15");
  });
});

describe("E29 estimated flag (BR-REC-19, D8)", () => {
  test("D8 { isEstimated } alone changes the flag and leaves the date and the values", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const detail = dataOf<Detail>(await s.patch(a.id, { isEstimated: true }));
    expect(detail.isEstimated).toBe(true);
    expect(detail.date).toBe("2025-03-12");
    expect(detail.values.length).toBe(4);
    expect((await s.assessmentRow(a.id))?.isEstimated).toBe(true);
    for (const row of await s.measurementRows(a.id)) {
      expect(row.measuredOn).toBe("2025-03-12");
    }
  });

  test("D8 { isEstimated: false } clears the flag", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m, { isEstimated: true });
    const detail = dataOf<Detail>(await s.patch(a.id, { isEstimated: false }));
    expect(detail.isEstimated).toBe(false);
  });

  test("D8 { date } alone leaves the estimated flag as it was", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m, { isEstimated: true });
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-15" }));
    expect(detail.isEstimated).toBe(true);
  });

  test("D8 date and isEstimated together change both", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const detail = dataOf<Detail>(
      await s.patch(a.id, { date: "2025-03-15", isEstimated: true }),
    );
    expect(detail.date).toBe("2025-03-15");
    expect(detail.isEstimated).toBe(true);
  });
});

describe("E29 date already taken (BR-REC-87)", () => {
  test("BR-REC-87 moving 12 Mar to 15 Mar when 15 Mar already has this assessment is 409 ASSESSMENT_DATE_TAKEN", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-15",
      values: [[body.metric("Weight"), 94]],
    });
    expectError(
      await s.patch(a.id, { date: "2025-03-15" }),
      409,
      "ASSESSMENT_DATE_TAKEN",
    );
  });

  test("BR-REC-87 a refused move changes nothing: the date, the values' dates and the estimated flag stay", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const taken = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-15",
      values: [[body.metric("Weight"), 94]],
    });
    const reply = await s.patch(a.id, {
      date: "2025-03-15",
      isEstimated: true,
    });
    expectError(reply, 409, "ASSESSMENT_DATE_TAKEN");
    const row = await s.assessmentRow(a.id);
    expect(row?.assessedOn).toBe("2025-03-12");
    expect(row?.isEstimated).toBe(false);
    for (const v of await s.measurementRows(a.id)) {
      expect(v.measuredOn).toBe("2025-03-12");
    }
    expect((await s.measurementRows(taken.id)).length).toBe(1);
    expect((await s.assessmentRows(m.id, body.id)).length).toBe(2);
  });

  test("BR-REC-87 another assessment type of the same member on that date is no conflict", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const fitness = await s.seedType({
      metrics: [{ name: "Fran", datatype: "duration", better: "lower" }],
    });
    await s.seedAssessment({
      member: m,
      type: fitness,
      date: "2025-03-15",
      values: [[fitness.metric("Fran"), 300]],
    });
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-15" }));
    expect(detail.date).toBe("2025-03-15");
  });

  test("BR-REC-87 another member's assessment of the same type on that date is no conflict", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const other = await s.seedMember();
    await s.seedAssessment({
      member: other,
      type: body,
      date: "2025-03-15",
      values: [[body.metric("Weight"), 80]],
    });
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-15" }));
    expect(detail.date).toBe("2025-03-15");
  });

  test("BR-REC-87 once the date is free again the move works", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const taken = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-15",
      values: [[body.metric("Weight"), 94]],
    });
    expectError(
      await s.patch(a.id, { date: "2025-03-15" }),
      409,
      "ASSESSMENT_DATE_TAKEN",
    );
    await s.dbDeleteAssessment(taken.id);
    const detail = dataOf<Detail>(await s.patch(a.id, { date: "2025-03-15" }));
    expect(detail.date).toBe("2025-03-15");
  });
});

describe("E29 future dates (BR-REC-83, D8)", () => {
  test("BR-REC-83 a date after today is 400 DATE_IN_FUTURE and nothing changes", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    expectError(await s.patch(a.id, { date: s.day(1) }), 400, "DATE_IN_FUTURE");
    expectError(
      await s.patch(a.id, { date: "2099-01-01", isEstimated: true }),
      400,
      "DATE_IN_FUTURE",
    );
    const row = await s.assessmentRow(a.id);
    expect(row?.assessedOn).toBe("2025-03-12");
    expect(row?.isEstimated).toBe(false);
    for (const v of await s.measurementRows(a.id)) {
      expect(v.measuredOn).toBe("2025-03-12");
    }
  });
});

describe("E29 bodies and ids (BR-REC-154, 157)", () => {
  test("BR-REC-157 an empty body is 400 VALIDATION_ERROR", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    expectInvalid(await s.patch(a.id, {}));
  });

  test("BR-REC-157 an unknown field (memberId, typeId, values) is 400 VALIDATION_ERROR", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    for (const extra of [
      { memberId: OTHER_UNKNOWN_ID },
      { typeId: OTHER_UNKNOWN_ID },
      { values: [] },
      { nickname: "x" },
    ]) {
      expectInvalid(await s.patch(a.id, extra));
    }
    expect((await s.assessmentRow(a.id))?.memberId).toBe(m.id);
  });

  test("BR-REC-157 a valid field sent next to an unknown one is not applied", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    expectInvalid(await s.patch(a.id, { date: "2025-03-15", nickname: "x" }));
    expect((await s.assessmentRow(a.id))?.assessedOn).toBe("2025-03-12");
  });

  test("BR-REC-157 null is refused for date and for isEstimated", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    expectInvalid(await s.patch(a.id, { date: null }), "date");
    expectInvalid(await s.patch(a.id, { isEstimated: null }), "isEstimated");
  });

  test("BR-REC-153 a date that is not a real day is 400 on date", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    for (const date of ["2026-02-30", "2025-3-5", "", "15/03/2025"]) {
      expectInvalid(await s.patch(a.id, { date }), "date");
    }
  });

  test("BR-REC-153 isEstimated must be true or false", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    expectInvalid(await s.patch(a.id, { isEstimated: "yes" }), "isEstimated");
  });

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    const m = await s.seedMember();
    const a = await seedMarch(m);
    const reply = await s.send("PATCH", `/api/assessments/${a.id}`, {
      rawBody: "{nope",
    });
    expectError(reply, 400, "INVALID_JSON");
  });

  test("BR-REC-154 an assessment that exists nowhere is 404 NOT_FOUND", async () => {
    expectError(
      await s.patch(UNKNOWN_ID, { date: "2025-03-15" }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-154 an id that is not an id is 400 VALIDATION_ERROR", async () => {
    expectInvalid(await s.patch("not-an-id", { date: "2025-03-15" }));
  });

  test("BR-REC-154 a bad body is 400 even when the assessment does not exist (shape is checked first)", async () => {
    expectInvalid(await s.patch(UNKNOWN_ID, {}));
  });
});
