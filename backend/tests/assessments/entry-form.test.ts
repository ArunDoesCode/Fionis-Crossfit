import { beforeAll, describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  type EntryForm,
  expectError,
  expectInvalid,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E25 GET /api/members/:memberId/entry-form?typeId=&date=
// BR-REC-20 (previous value next to each field), BR-REC-74 (existing assessment for the date),
// BR-REC-81 (previous = latest value dated before this date), BR-REC-83 (future date only a
// shape matter here, D1), BR-REC-153 / 154 (shapes, errors), build clarifications D1, D4, D5, D20.

const s = useAssessmentsSuite();

/** weight (1 decimal), visceral fat (0), plank (duration), waist (1) */
let body: SeededType;

beforeAll(async () => {
  body = await s.seedType();
});

describe("E25 previous values (BR-REC-20, 81, D5)", () => {
  test("BR-REC-20 previous holds the latest earlier value with its date and its estimated flag", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-06-30",
      values: [[body.metric("Weight"), 97]],
    });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      isEstimated: true,
      values: [[body.metric("Weight"), 95.5]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous).toEqual({
      value: 95.5,
      on: "2025-09-30",
      isEstimated: true,
    });
  });

  test("BR-REC-81 back-filling 2025-12-30 compares with 2025-09-30, not with the 2026 value", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Weight"), 95.5]],
    });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2026-03-01",
      values: [[body.metric("Weight"), 90]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous?.value).toBe(95.5);
    expect(weight?.previous?.on).toBe("2025-09-30");
  });

  test("BR-REC-81 a value dated on the form's own date is never the previous one", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Weight"), 95.5]],
    });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-12-30",
      values: [[body.metric("Weight"), 94]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous?.value).toBe(95.5);
    expect(weight?.previous?.on).toBe("2025-09-30");
  });

  test("BR-REC-81 a value dated the day before the form's date counts as previous", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-12-29",
      values: [[body.metric("Weight"), 93.2]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous).toEqual({
      value: 93.2,
      on: "2025-12-29",
      isEstimated: false,
    });
  });

  test("BR-REC-81 with no earlier value previous is null (a member never assessed)", async () => {
    const m = await s.seedMember();
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    expect(form.metrics.length).toBe(4);
    for (const metric of form.metrics) expect(metric.previous).toBeNull();
  });

  test("BR-REC-81 data dated only after the form's date gives previous null", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2026-03-01",
      values: [[body.metric("Weight"), 90]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous).toBeNull();
  });

  test("BR-REC-81 previous is worked out per measurement, each from its own latest earlier value", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-06-30",
      values: [
        [body.metric("Weight"), 97],
        [body.metric("Plank"), 100],
      ],
    });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Weight"), 95.5]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const byName = (name: string) => form.metrics.find((x) => x.name === name);
    expect(byName("Weight")?.previous?.on).toBe("2025-09-30");
    expect(byName("Weight")?.previous?.value).toBe(95.5);
    expect(byName("Plank")?.previous?.on).toBe("2025-06-30");
    expect(byName("Plank")?.previous?.value).toBe(100);
    expect(byName("Waist")?.previous).toBeNull();
  });

  test("BR-REC-12 BR-REC-153 a duration's previous value is in whole seconds", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Plank"), 110]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const plank = form.metrics.find((x) => x.name === "Plank");
    expect(plank?.datatype).toBe("duration");
    expect(plank?.previous?.value).toBe(110);
  });

  test("BR-REC-81 another member's values never show up as previous", async () => {
    const m = await s.seedMember();
    const other = await s.seedMember();
    await s.seedAssessment({
      member: other,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Weight"), 80]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    for (const metric of form.metrics) expect(metric.previous).toBeNull();
  });

  test("BR-REC-81 a save through E26 is the previous value of a later date at once", async () => {
    const m = await s.seedMember();
    const save = await s.saveValues(m, body, "2026-01-10", [
      [body.metric("Weight"), 92.4],
    ]);
    expect(save.status).toBe(200);
    const form = await s.formOf(m.id, body.id, "2026-02-10");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous).toEqual({
      value: 92.4,
      on: "2026-01-10",
      isEstimated: false,
    });
  });

  test("BR-REC-58 an archived member's previous values are worked out the same way", async () => {
    const m = await s.seedMember({ archived: true });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Weight"), 95.5]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous?.value).toBe(95.5);
  });
});

describe("E25 existing assessment (BR-REC-74)", () => {
  test("BR-REC-74 existing is null when the member has none of this assessment on that date", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Weight"), 95.5]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    expect(form.existing).toBeNull();
  });

  test("BR-REC-74 existing holds the saved assessment's id, estimated flag and values by measurement id", async () => {
    const m = await s.seedMember();
    const saved = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      isEstimated: true,
      values: [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ],
    });
    const form = await s.formOf(m.id, body.id, "2025-03-12");
    expect(form.existing).toEqual({
      assessmentId: saved.id,
      isEstimated: true,
      values: {
        [body.metric("Weight").id]: 95.5,
        [body.metric("Plank").id]: 122,
      },
    });
  });

  test("BR-REC-74 an assessment on another date is not the existing one", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expect((await s.formOf(m.id, body.id, "2025-03-13")).existing).toBeNull();
    expect((await s.formOf(m.id, body.id, "2025-03-11")).existing).toBeNull();
  });

  test("BR-REC-19 another member's assessment of the same type and date is not the existing one", async () => {
    const m = await s.seedMember();
    const other = await s.seedMember();
    await s.seedAssessment({
      member: other,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 80]],
    });
    expect((await s.formOf(m.id, body.id, "2025-03-12")).existing).toBeNull();
  });

  test("BR-REC-19 another assessment type on the same date is not the existing one", async () => {
    const m = await s.seedMember();
    const fitness = await s.seedType({
      metrics: [{ name: "Fran", datatype: "duration", better: "lower" }],
    });
    await s.seedAssessment({
      member: m,
      type: fitness,
      date: "2025-03-12",
      values: [[fitness.metric("Fran"), 300]],
    });
    expect((await s.formOf(m.id, body.id, "2025-03-12")).existing).toBeNull();
    expect(
      (await s.formOf(m.id, fitness.id, "2025-03-12")).existing,
    ).not.toBeNull();
  });

  test("BR-REC-86 the form shows what E26 saved on that date", async () => {
    const m = await s.seedMember();
    const save = await s.savedOf(
      await s.saveValues(
        m,
        body,
        "2025-12-30",
        [
          [body.metric("Weight"), 94],
          [body.metric("Visceral fat"), 8],
        ],
        true,
      ),
    );
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    expect(form.existing?.assessmentId).toBe(save.assessmentId);
    expect(form.existing?.isEstimated).toBe(true);
    expect(form.existing?.values).toEqual({
      [body.metric("Weight").id]: 94,
      [body.metric("Visceral fat").id]: 8,
    });
  });
});

describe("E25 measurements list (D4, D20)", () => {
  test("D20 the turned-on measurements come in setup order (sort order), whatever order they were created in", async () => {
    const t = await s.seedType({
      metrics: [
        { name: "Plank", datatype: "duration", sortOrder: 3 },
        { name: "Weight", sortOrder: 1 },
        { name: "Visceral fat", decimals: 0, sortOrder: 4 },
        { name: "Waist", sortOrder: 2 },
      ],
    });
    const m = await s.seedMember();
    const form = await s.formOf(m.id, t.id, "2025-12-30");
    expect(form.metrics.map((x) => x.name)).toEqual([
      "Weight",
      "Waist",
      "Plank",
      "Visceral fat",
    ]);
  });

  test("D20 measurements with the same sort order come in id order", async () => {
    const t = await s.seedType({
      metrics: [
        { name: "Alpha", sortOrder: 5 },
        { name: "Bravo", sortOrder: 5 },
        { name: "Charlie", sortOrder: 5 },
      ],
    });
    const m = await s.seedMember();
    const form = await s.formOf(m.id, t.id, "2025-12-30");
    const expected = t.metrics.map((x) => x.id).sort();
    expect(form.metrics.map((x) => x.id)).toEqual(expected);
  });

  test("D4 a turned-off measurement without a value is not on the form", async () => {
    const t = await s.seedType({
      metrics: [
        { name: "Weight" },
        { name: "Old caliper", isActive: false },
        { name: "Waist" },
      ],
    });
    const m = await s.seedMember();
    const form = await s.formOf(m.id, t.id, "2025-12-30");
    expect(form.metrics.map((x) => x.name)).toEqual(["Weight", "Waist"]);
  });

  test("D4 a turned-off measurement that holds a value in the existing assessment is on the form, in its setup place", async () => {
    const t = await s.seedType({
      metrics: [
        { name: "Weight" },
        { name: "Old caliper", isActive: false },
        { name: "Waist" },
      ],
    });
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [
        [t.metric("Weight"), 95],
        [t.metric("Old caliper"), 21.5],
      ],
    });
    const form = await s.formOf(m.id, t.id, "2025-03-12");
    expect(form.metrics.map((x) => x.name)).toEqual([
      "Weight",
      "Old caliper",
      "Waist",
    ]);
    expect(form.existing?.values[t.metric("Old caliper").id]).toBe(21.5);
  });

  test("D4 a turned-off measurement that holds a value only on another date stays off the form", async () => {
    const t = await s.seedType({
      metrics: [{ name: "Weight" }, { name: "Old caliper", isActive: false }],
    });
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [[t.metric("Old caliper"), 21.5]],
    });
    const form = await s.formOf(m.id, t.id, "2025-06-12");
    expect(form.existing).toBeNull();
    expect(form.metrics.map((x) => x.name)).toEqual(["Weight"]);
  });

  test("D4 a turned-off assessment without an existing record gives an empty measurements list (still 200)", async () => {
    const t = await s.seedType({ isActive: false });
    const m = await s.seedMember();
    const form = await s.formOf(m.id, t.id, "2025-12-30");
    expect(form.metrics).toEqual([]);
    expect(form.existing).toBeNull();
    expect(form.type).toEqual({ id: t.id, name: t.name });
  });

  test("D4 a turned-off assessment with an existing record lists only the measurements that hold a value in it", async () => {
    const t = await s.seedType({ isActive: false });
    const m = await s.seedMember();
    const saved = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [
        [t.metric("Weight"), 95.5],
        [t.metric("Plank"), 122],
      ],
    });
    const form = await s.formOf(m.id, t.id, "2025-03-12");
    expect(form.existing?.assessmentId).toBe(saved.id);
    expect(form.metrics.map((x) => x.name)).toEqual(["Weight", "Plank"]);
  });

  test("BR-REC-20 each measurement carries name, unit, kind, decimals, direction and the check limits as setup holds them", async () => {
    const t = await s.seedType({
      metrics: [
        {
          name: "Flexibility",
          unit: "cm",
          decimals: 2,
          better: "higher",
          plausibleMin: -30,
          plausibleMax: 60,
        },
        {
          name: "Fran",
          unit: "min:sec",
          datatype: "duration",
          better: "lower",
        },
        { name: "Height", unit: "cm", decimals: 0, better: "none" },
      ],
    });
    const m = await s.seedMember();
    const form = await s.formOf(m.id, t.id, "2025-12-30");
    expect(form.metrics).toEqual([
      {
        id: t.metric("Flexibility").id,
        name: "Flexibility",
        unit: "cm",
        datatype: "number",
        decimals: 2,
        better: "higher",
        plausibleMin: -30,
        plausibleMax: 60,
        previous: null,
      },
      {
        id: t.metric("Fran").id,
        name: "Fran",
        unit: "min:sec",
        datatype: "duration",
        decimals: 0,
        better: "lower",
        plausibleMin: null,
        plausibleMax: null,
        previous: null,
      },
      {
        id: t.metric("Height").id,
        name: "Height",
        unit: "cm",
        datatype: "number",
        decimals: 0,
        better: "none",
        plausibleMin: null,
        plausibleMax: null,
        previous: null,
      },
    ]);
  });
});

describe("E25 the member and the date (BR-REC-83, 153; D1)", () => {
  test("BR-REC-153 the answer holds exactly member, type, existing and metrics, camelCase", async () => {
    const m = await s.seedMember({ joinedOn: "2025-06-01" });
    const reply = await s.entryForm(m.id, {
      typeId: body.id,
      date: "2025-12-30",
    });
    const form = dataOf<EntryForm>(reply);
    expect(Object.keys(form).sort()).toEqual([
      "existing",
      "member",
      "metrics",
      "type",
    ]);
    expect(form.member).toEqual({
      id: m.id,
      fullName: m.fullName,
      joinedOn: "2025-06-01",
    });
    expect(form.type).toEqual({ id: body.id, name: body.name });
    expect(Object.keys(form.metrics[0] ?? {}).sort()).toEqual([
      "better",
      "datatype",
      "decimals",
      "id",
      "name",
      "plausibleMax",
      "plausibleMin",
      "previous",
      "unit",
    ]);
  });

  test("BR-REC-153 existing and previous hold exactly the contract's keys, values as JSON numbers", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-30",
      values: [[body.metric("Weight"), 95.5]],
    });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-12-30",
      values: [[body.metric("Weight"), 94]],
    });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    expect(Object.keys(form.existing ?? {}).sort()).toEqual([
      "assessmentId",
      "isEstimated",
      "values",
    ]);
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(Object.keys(weight?.previous ?? {}).sort()).toEqual([
      "isEstimated",
      "on",
      "value",
    ]);
    expect(typeof weight?.previous?.value).toBe("number");
    expect(typeof form.existing?.values[body.metric("Weight").id]).toBe(
      "number",
    );
  });

  test("D1 a future date just returns a form (200)", async () => {
    const m = await s.seedMember();
    const form = await s.formOf(m.id, body.id, s.day(30));
    expect(form.metrics.length).toBe(4);
    expect(form.existing).toBeNull();
  });

  test("D1 a date before the member joined just returns a form (200)", async () => {
    const m = await s.seedMember({ joinedOn: "2025-06-01" });
    const form = await s.formOf(m.id, body.id, "2024-01-15");
    expect(form.member.joinedOn).toBe("2025-06-01");
    expect(form.metrics.length).toBe(4);
  });

  test("BR-REC-58 an archived member's form works", async () => {
    const m = await s.seedMember({ archived: true });
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    expect(form.member.id).toBe(m.id);
    expect(form.metrics.length).toBe(4);
  });

  test("D20 E25 sends no ETag", async () => {
    const m = await s.seedMember();
    const reply = await s.entryForm(m.id, {
      typeId: body.id,
      date: "2025-12-30",
    });
    expect(reply.status).toBe(200);
    expect(reply.headers.get("etag")).toBeNull();
  });
});

describe("E25 errors (BR-REC-154)", () => {
  test("BR-REC-154 an unknown member is 404 NOT_FOUND", async () => {
    const reply = await s.entryForm(UNKNOWN_ID, {
      typeId: body.id,
      date: "2025-12-30",
    });
    expectError(reply, 404, "NOT_FOUND");
  });

  test("BR-REC-154 an unknown assessment type is 404 NOT_FOUND", async () => {
    const m = await s.seedMember();
    const reply = await s.entryForm(m.id, {
      typeId: OTHER_UNKNOWN_ID,
      date: "2025-12-30",
    });
    expectError(reply, 404, "NOT_FOUND");
  });

  test("BR-REC-154 a malformed member id is 400 VALIDATION_ERROR", async () => {
    const reply = await s.entryForm("not-an-id", {
      typeId: body.id,
      date: "2025-12-30",
    });
    expectInvalid(reply);
  });

  test("BR-REC-154 a missing or malformed typeId is 400 on typeId", async () => {
    const m = await s.seedMember();
    expectInvalid(await s.entryForm(m.id, { date: "2025-12-30" }), "typeId");
    expectInvalid(
      await s.entryForm(m.id, { typeId: "nope", date: "2025-12-30" }),
      "typeId",
    );
  });

  test("BR-REC-153 a missing date is 400 on date", async () => {
    const m = await s.seedMember();
    expectInvalid(await s.entryForm(m.id, { typeId: body.id }), "date");
  });

  for (const date of [
    "2026-02-30",
    "2025-2-3",
    "30-12-2025",
    "2025/12/30",
    "20251230",
    "",
    "tomorrow",
  ]) {
    test(`BR-REC-153 the date "${date}" is 400 on date`, async () => {
      const m = await s.seedMember();
      expectInvalid(await s.entryForm(m.id, { typeId: body.id, date }), "date");
    });
  }

  test("BR-REC-154 a bad query is 400 even when the member does not exist (shape is checked first)", async () => {
    const reply = await s.entryForm(UNKNOWN_ID, {
      typeId: body.id,
      date: "2026-02-30",
    });
    expectInvalid(reply, "date");
  });
});
