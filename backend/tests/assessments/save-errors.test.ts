import { beforeAll, describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  expectError,
  expectInvalid,
  type SaveResult,
  type SeededType,
  todayIn,
  useAssessmentsSuite,
} from "./support/suite";

// E26 refusals: unknown member / assessment (404), future date (BR-REC-83), measurements of another
// assessment (D4), body shape (BR-REC-153, 154). A refused save changes nothing.

const s = useAssessmentsSuite();

/** weight (1 decimal), visceral fat (0), plank (duration), waist (1) */
let body: SeededType;
/** a different assessment type: its measurements do not belong to `body` */
let fitness: SeededType;

beforeAll(async () => {
  body = await s.seedType();
  fitness = await s.seedType({
    metrics: [{ name: "Fran", datatype: "duration", better: "lower" }],
  });
});

describe("E26 unknown member or assessment (D6, BR-REC-154)", () => {
  test("BR-REC-154 an unknown member is 404 NOT_FOUND", async () => {
    const reply = await s.save({
      memberId: UNKNOWN_ID,
      typeId: body.id,
      date: "2025-12-30",
      isEstimated: false,
      values: [{ metricId: body.metric("Weight").id, value: 94 }],
    });
    expectError(reply, 404, "NOT_FOUND");
  });

  test("BR-REC-154 an unknown assessment type is 404 NOT_FOUND and nothing is made", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: OTHER_UNKNOWN_ID,
      date: "2025-12-30",
      isEstimated: false,
      values: [{ metricId: body.metric("Weight").id, value: 94 }],
    });
    expectError(reply, 404, "NOT_FOUND");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });
});

describe("E26 future dates (BR-REC-83, D1)", () => {
  test("BR-REC-83 tomorrow is refused 400 DATE_IN_FUTURE and nothing is made", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, body, s.day(1), [
      [body.metric("Weight"), 94],
    ]);
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("BR-REC-83 a date far in the future is refused 400 DATE_IN_FUTURE", async () => {
    const m = await s.seedMember();
    for (const date of [s.day(30), s.day(400), "2099-12-31"]) {
      const reply = await s.saveValues(m, body, date, [
        [body.metric("Weight"), 94],
      ]);
      expectError(reply, 400, "DATE_IN_FUTURE");
    }
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("BR-REC-83 yesterday and today are not in the future", async () => {
    const m = await s.seedMember();
    for (const date of [s.day(-1), s.today()]) {
      const reply = await s.saveValues(m, body, date, [
        [body.metric("Weight"), 94],
      ]);
      expect(dataOf<SaveResult>(reply).created).toBe(true);
    }
  });

  test("BR-REC-83 a refused future date also does not touch the assessment of another day", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    const reply = await s.saveValues(
      m,
      body,
      s.day(1),
      [[body.metric("Weight"), 80]],
      true,
    );
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [body.metric("Weight").id]: 94,
    });
    expect((await s.assessmentRow(first.assessmentId))?.isEstimated).toBe(
      false,
    );
  });

  test("D1 'today' is the gym's day in the time zone setting, not the server's or UTC's", async () => {
    const m = await s.seedMember();
    const kiritimati = "Pacific/Kiritimati"; // UTC+14
    const pagoPago = "Pacific/Pago_Pago"; // UTC-11: always 1 or 2 days behind Kiritimati
    try {
      await s.setTimezone(kiritimati);
      const aheadDay = todayIn(kiritimati);
      const ahead = await s.saveValues(m, body, aheadDay, [
        [body.metric("Weight"), 94],
      ]);
      expect(dataOf<SaveResult>(ahead).created).toBe(true);

      await s.setTimezone(pagoPago);
      const behindDay = todayIn(pagoPago);
      expect(behindDay < aheadDay).toBe(true);
      expectError(
        await s.saveValues(m, body, aheadDay, [[body.metric("Weight"), 93]]),
        400,
        "DATE_IN_FUTURE",
      );
      const behind = await s.saveValues(m, body, behindDay, [
        [body.metric("Weight"), 92],
      ]);
      expect(dataOf<SaveResult>(behind).created).toBe(true);
    } finally {
      await s.setTimezone("Asia/Kolkata");
    }
  });

  test("BR-REC-153 a date that is not a real day is 400 VALIDATION_ERROR on date, not DATE_IN_FUTURE", async () => {
    const m = await s.seedMember();
    for (const date of [
      "2026-02-30",
      "2025-2-3",
      "",
      "30-12-2025",
      "tomorrow",
    ]) {
      const reply = await s.saveValues(m, body, date, [
        [body.metric("Weight"), 94],
      ]);
      expectInvalid(reply, "date");
    }
  });

  test("BR-REC-153 a date that is a number is 400 VALIDATION_ERROR on date", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: body.id,
      date: 20251230,
      isEstimated: false,
      values: [{ metricId: body.metric("Weight").id, value: 94 }],
    });
    expectInvalid(reply, "date");
  });
});

describe("E26 measurements of the assessment (D4)", () => {
  test("D4 a measurement of another assessment is refused 400 METRIC_NOT_IN_TYPE and nothing is made", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, body, "2025-12-30", [
      [fitness.metric("Fran"), 300],
    ]);
    expectError(reply, 400, "METRIC_NOT_IN_TYPE");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("D4 a measurement id that exists nowhere is refused 400 METRIC_NOT_IN_TYPE", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, body, "2025-12-30", [
      [{ id: UNKNOWN_ID }, 300],
    ]);
    expectError(reply, 400, "METRIC_NOT_IN_TYPE");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("D4 a null entry for a measurement of another assessment is refused too", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, body, "2025-12-30", [
      [body.metric("Weight"), 94],
      [fitness.metric("Fran"), null],
    ]);
    expectError(reply, 400, "METRIC_NOT_IN_TYPE");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("D4 an all-null body with a foreign measurement is METRIC_NOT_IN_TYPE, not NO_VALUES", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, body, "2025-12-30", [
      [fitness.metric("Fran"), null],
    ]);
    expectError(reply, 400, "METRIC_NOT_IN_TYPE");
  });

  test("D4 one foreign measurement among good ones refuses the whole save: the good values are not saved", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    const reply = await s.saveValues(
      m,
      body,
      "2025-12-30",
      [
        [body.metric("Weight"), 80],
        [body.metric("Waist"), 90],
        [fitness.metric("Fran"), 300],
      ],
      true,
    );
    expectError(reply, 400, "METRIC_NOT_IN_TYPE");
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [body.metric("Weight").id]: 94,
    });
    expect((await s.assessmentRow(first.assessmentId))?.isEstimated).toBe(
      false,
    );
  });

  test("D4 a turned-off measurement of the assessment is accepted (an old record stays editable)", async () => {
    const t = await s.seedType({
      metrics: [{ name: "Weight" }, { name: "Old caliper", isActive: false }],
    });
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, t, "2025-12-30", [
        [t.metric("Weight"), 94],
        [t.metric("Old caliper"), 21.5],
      ]),
    );
    expect(result.saved).toBe(2);
    expect(await s.storedValues(result.assessmentId)).toEqual({
      [t.metric("Weight").id]: 94,
      [t.metric("Old caliper").id]: 21.5,
    });
  });

  test("D4 a stored value of a turned-off measurement can be removed with null", async () => {
    const t = await s.seedType({
      metrics: [{ name: "Weight" }, { name: "Old caliper", isActive: false }],
    });
    const m = await s.seedMember();
    const first = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [
        [t.metric("Weight"), 95],
        [t.metric("Old caliper"), 21.5],
      ],
    });
    const result = dataOf<SaveResult>(
      await s.saveValues(m, t, "2025-03-12", [
        [t.metric("Weight"), 95],
        [t.metric("Old caliper"), null],
      ]),
    );
    expect(result.removed).toBe(1);
    expect(await s.storedValues(first.id)).toEqual({
      [t.metric("Weight").id]: 95,
    });
  });

  test("D4 a turned-off assessment can still be saved to (history stays editable)", async () => {
    const t = await s.seedType({ isActive: false });
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, t, "2025-12-30", [[t.metric("Weight"), 94]]),
    );
    expect(result.created).toBe(true);
    expect(result.saved).toBe(1);
  });

  test("BR-REC-153 sixty entries pass the shape check (here they are refused only as unknown measurements)", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: body.id,
      date: "2025-12-30",
      isEstimated: false,
      values: Array.from({ length: 60 }, () => ({
        metricId: crypto.randomUUID(),
        value: 1,
      })),
    });
    expectError(reply, 400, "METRIC_NOT_IN_TYPE");
  });

  test("BR-REC-153 sixty-one entries are 400 VALIDATION_ERROR on values", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: body.id,
      date: "2025-12-30",
      isEstimated: false,
      values: Array.from({ length: 61 }, () => ({
        metricId: crypto.randomUUID(),
        value: 1,
      })),
    });
    expectInvalid(reply, "values");
  });
});

describe("E26 body shape (BR-REC-153, 154)", () => {
  const valid = (memberId: string) => ({
    memberId,
    typeId: body.id,
    date: "2025-12-30",
    isEstimated: false,
    values: [{ metricId: body.metric("Weight").id, value: 94 }],
  });

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    const reply = await s.send("POST", "/api/assessments", {
      rawBody: "{nope",
    });
    expectError(reply, 400, "INVALID_JSON");
  });

  for (const field of ["memberId", "typeId", "date", "isEstimated", "values"]) {
    test(`BR-REC-153 a body without ${field} is 400 VALIDATION_ERROR on ${field}`, async () => {
      const m = await s.seedMember();
      const payload: Record<string, unknown> = { ...valid(m.id) };
      delete payload[field];
      expectInvalid(await s.save(payload), field);
      expect((await s.assessmentRows(m.id)).length).toBe(0);
    });
  }

  test("BR-REC-153 a memberId or typeId that is not an id is 400 VALIDATION_ERROR", async () => {
    const m = await s.seedMember();
    expectInvalid(
      await s.save({ ...valid(m.id), memberId: "nope" }),
      "memberId",
    );
    expectInvalid(await s.save({ ...valid(m.id), typeId: "nope" }), "typeId");
  });

  test("BR-REC-153 isEstimated must be a true or false", async () => {
    const m = await s.seedMember();
    for (const isEstimated of ["yes", 1, null]) {
      expectInvalid(
        await s.save({ ...valid(m.id), isEstimated }),
        "isEstimated",
      );
    }
  });

  test("BR-REC-153 values must be a list", async () => {
    const m = await s.seedMember();
    for (const values of ["Weight", { metricId: "x" }, null]) {
      expectInvalid(await s.save({ ...valid(m.id), values }), "values");
    }
  });

  test("BR-REC-154 a bad body is 400 even when the member does not exist (shape is checked first)", async () => {
    const reply = await s.save({ ...valid(UNKNOWN_ID), date: "2026-02-30" });
    expectInvalid(reply, "date");
  });

  test("D3 a measurement listed twice is 400 VALIDATION_ERROR on the repeat's metricId", async () => {
    const m = await s.seedMember();
    const weight = body.metric("Weight").id;
    const reply = await s.save({
      ...valid(m.id),
      values: [
        { metricId: weight, value: 94 },
        { metricId: body.metric("Waist").id, value: 90 },
        { metricId: weight, value: 95 },
      ],
    });
    expectInvalid(reply, "values.2.metricId");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("D3 the same measurement in another letter case counts as a repeat", async () => {
    const m = await s.seedMember();
    const weight = body.metric("Weight").id;
    const reply = await s.save({
      ...valid(m.id),
      values: [
        { metricId: weight, value: 94 },
        { metricId: weight.toUpperCase(), value: 95 },
      ],
    });
    expectInvalid(reply, "values.1.metricId");
  });

  test("D3 a repeated measurement is refused even when one of the two is null", async () => {
    const m = await s.seedMember();
    const weight = body.metric("Weight").id;
    const reply = await s.save({
      ...valid(m.id),
      values: [
        { metricId: weight, value: 94 },
        { metricId: weight, value: null },
      ],
    });
    expectInvalid(reply, "values.1.metricId");
  });
});
