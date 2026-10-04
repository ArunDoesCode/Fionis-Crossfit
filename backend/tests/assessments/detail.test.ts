import { beforeAll, describe, expect, test } from "bun:test";

import { UNKNOWN_ID } from "../helpers/http";
import {
  type Detail,
  dataOf,
  expectError,
  expectInvalid,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E28 GET /api/assessments/:assessmentId: one assessment with its values.
// BR-REC-89 (tap a row to see it), BR-REC-153 / 154 (shapes, errors), build clarification D9
// (every stored value, on or off measurements, in setup order).

const s = useAssessmentsSuite();

let body: SeededType;

beforeAll(async () => {
  body = await s.seedType();
});

describe("E28 one assessment", () => {
  test("BR-REC-89 the detail holds the member, the assessment, the date, the flag and every stored value with name, unit and kind", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      isEstimated: true,
      values: [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ],
    });
    const detail = dataOf<Detail>(await s.detail(a.id));
    expect(detail).toEqual({
      id: a.id,
      memberId: m.id,
      typeId: body.id,
      typeName: body.name,
      date: "2025-03-12",
      isEstimated: true,
      values: [
        {
          metricId: body.metric("Weight").id,
          name: "Weight",
          unit: "kg",
          datatype: "number",
          value: 95.5,
        },
        {
          metricId: body.metric("Plank").id,
          name: "Plank",
          unit: "min:sec",
          datatype: "duration",
          value: 122,
        },
      ],
    });
  });

  test("D9 the values come in setup order, whatever order they were entered or created in", async () => {
    const t = await s.seedType({
      metrics: [
        { name: "Plank", datatype: "duration", sortOrder: 3 },
        { name: "Weight", sortOrder: 1 },
        { name: "Waist", sortOrder: 2 },
      ],
    });
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [
        [t.metric("Waist"), 90],
        [t.metric("Plank"), 122],
        [t.metric("Weight"), 95],
      ],
    });
    const detail = dataOf<Detail>(await s.detail(a.id));
    expect(detail.values.map((v) => v.name)).toEqual([
      "Weight",
      "Waist",
      "Plank",
    ]);
  });

  test("D9 values of a turned-off measurement are listed (on and off alike)", async () => {
    const t = await s.seedType({
      metrics: [{ name: "Weight" }, { name: "Old caliper", isActive: false }],
    });
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [
        [t.metric("Weight"), 95],
        [t.metric("Old caliper"), 21.5],
      ],
    });
    const detail = dataOf<Detail>(await s.detail(a.id));
    expect(detail.values.map((v) => v.name)).toEqual(["Weight", "Old caliper"]);
  });

  test("D9 measurements with no stored value are not listed (blank fields are simply not recorded)", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Waist"), 90]],
    });
    const detail = dataOf<Detail>(await s.detail(a.id));
    expect(detail.values.map((v) => v.name)).toEqual(["Waist"]);
  });

  test("D4 an assessment of a turned-off type can be read", async () => {
    const t = await s.seedType({ isActive: false });
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [[t.metric("Weight"), 95]],
    });
    expect(dataOf<Detail>(await s.detail(a.id)).typeName).toBe(t.name);
  });

  test("BR-REC-58 an archived member's assessment can be read", async () => {
    const m = await s.seedMember({ archived: true });
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95]],
    });
    expect(dataOf<Detail>(await s.detail(a.id)).memberId).toBe(m.id);
  });

  test("BR-REC-153 the detail holds exactly the contract's keys and values are JSON numbers", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const detail = dataOf<Detail>(await s.detail(a.id));
    expect(Object.keys(detail).sort()).toEqual([
      "date",
      "id",
      "isEstimated",
      "memberId",
      "typeId",
      "typeName",
      "values",
    ]);
    expect(Object.keys(detail.values[0] ?? {}).sort()).toEqual([
      "datatype",
      "metricId",
      "name",
      "unit",
      "value",
    ]);
    expect(typeof detail.values[0]?.value).toBe("number");
  });

  test("BR-REC-154 an assessment that exists nowhere is 404 NOT_FOUND", async () => {
    expectError(await s.detail(UNKNOWN_ID), 404, "NOT_FOUND");
  });

  test("BR-REC-154 an id that is not an id is 400 VALIDATION_ERROR", async () => {
    expectInvalid(await s.detail("not-an-id"));
  });

  test("BR-REC-159 without a sign-in the detail is 401 UNAUTHORIZED", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const reply = await s.get(`/api/assessments/${a.id}`, undefined, null);
    expectError(reply, 401, "UNAUTHORIZED");
  });
});
