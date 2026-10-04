import { beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  type Detail,
  dataOf,
  expectError,
  expectInvalid,
  type SaveResult,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E26 values: rounding, durations in seconds, value limits.
// BR-REC-12 (duration stored in seconds), BR-REC-64 / 76 (rounded to the measurement's decimals),
// BR-REC-153 / 164 (seconds, numbers), build clarification D3 (limits and rounding).

const s = useAssessmentsSuite();

let rounding: SeededType;

beforeAll(async () => {
  rounding = await s.seedType({
    metrics: [
      { name: "N0", unit: "reps", decimals: 0 },
      { name: "N1", unit: "kg", decimals: 1 },
      { name: "N2", unit: "%", decimals: 2 },
      { name: "T", unit: "min:sec", datatype: "duration", better: "lower" },
      {
        name: "Flex",
        unit: "cm",
        decimals: 1,
        plausibleMin: -30,
        plausibleMax: 60,
      },
    ],
  });
});

/** Saves one value for a fresh member and returns the reply plus the member. */
async function saveOne(metricName: string, value: number) {
  const m = await s.seedMember();
  const reply = await s.saveValues(m, rounding, "2025-12-30", [
    [rounding.metric(metricName), value],
  ]);
  return { m, reply };
}

describe("E26 rounding to the measurement's decimals (BR-REC-64, 76, D3)", () => {
  const cases: [value: number, decimals: 0 | 1 | 2, expected: number][] = [
    // the spec's examples
    [95.56, 1, 95.6],
    [-2.25, 1, -2.3],
    [1.005, 2, 1.01],
    [2.5, 0, 3],
    [-2.5, 0, -3],
    [95.5, 0, 96],
    // below the half rounds down, above rounds up
    [95.54, 1, 95.5],
    [95.4, 0, 95],
    [-95.4, 0, -95],
    [95.55, 1, 95.6],
    [0.5, 0, 1],
    [-0.5, 0, -1],
    [0.125, 2, 0.13],
    [-0.125, 2, -0.13],
    [1234.5678, 2, 1234.57],
    // already short values are kept
    [95.5, 1, 95.5],
    [12, 2, 12],
    [0, 1, 0],
    [172, 0, 172],
    // a carry into the next digit
    [99.95, 1, 100],
    [-99.95, 1, -100],
  ];

  for (const [value, decimals, expected] of cases) {
    test(`BR-REC-76 ${value} on a ${decimals}-decimal measurement is stored as ${expected}`, async () => {
      const { reply } = await saveOne(`N${decimals}`, value);
      const result = dataOf<SaveResult>(reply);
      const stored = await s.storedValues(result.assessmentId);
      expect(Object.values(stored)).toEqual([expected]);
      const detail = dataOf<Detail>(await s.detail(result.assessmentId));
      expect(detail.values.map((v) => v.value)).toEqual([expected]);
    });
  }

  test("BR-REC-76 a negative number is allowed on a Number measurement (Flexibility -12.5)", async () => {
    const { m, reply } = await saveOne("Flex", -12.5);
    const result = dataOf<SaveResult>(reply);
    expect(await s.storedValues(result.assessmentId)).toEqual({
      [rounding.metric("Flex").id]: -12.5,
    });
    const form = await s.formOf(m.id, rounding.id, "2025-12-30");
    expect(form.existing?.values[rounding.metric("Flex").id]).toBe(-12.5);
  });

  test("BR-REC-76 rounding applies on an edit too", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, rounding, "2025-12-30", [
        [rounding.metric("N1"), 90],
      ]),
    );
    await s.saveValues(m, rounding, "2025-12-30", [
      [rounding.metric("N1"), 95.56],
    ]);
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [rounding.metric("N1").id]: 95.6,
    });
  });
});

describe("E26 durations (BR-REC-12, 164, D3)", () => {
  test("BR-REC-12 a plank of 2:02 is sent as 122 and stored and returned as 122 seconds", async () => {
    const { reply } = await saveOne("T", 122);
    const result = dataOf<SaveResult>(reply);
    expect(await s.storedValues(result.assessmentId)).toEqual({
      [rounding.metric("T").id]: 122,
    });
    const detail = dataOf<Detail>(await s.detail(result.assessmentId));
    expect(detail.values[0]?.datatype).toBe("duration");
    expect(detail.values[0]?.value).toBe(122);
  });

  const roundCases: [sent: number, stored: number][] = [
    [122.4, 122],
    [122.5, 123],
    [122.49, 122],
    [59.5, 60],
    [0.4, 0],
    [0.5, 1],
  ];
  for (const [sent, stored] of roundCases) {
    test(`D3 a duration of ${sent} s is stored as ${stored} whole seconds`, async () => {
      const { reply } = await saveOne("T", sent);
      const result = dataOf<SaveResult>(reply);
      expect(await s.storedValues(result.assessmentId)).toEqual({
        [rounding.metric("T").id]: stored,
      });
    });
  }

  for (const seconds of [0, 1, 35_999]) {
    test(`D3 a duration of ${seconds} s is inside the 0 to 35,999 limit and is saved`, async () => {
      const { reply } = await saveOne("T", seconds);
      const result = dataOf<SaveResult>(reply);
      expect(result.saved).toBe(1);
      expect(await s.storedValues(result.assessmentId)).toEqual({
        [rounding.metric("T").id]: seconds,
      });
    });
  }

  for (const seconds of [-1, -0.4, 35_999.4, 35_999.5, 36_000, 1_000_000]) {
    test(`D3 a duration of ${seconds} s (as sent) is refused 400 VALIDATION_ERROR on that value, nothing saved`, async () => {
      const m = await s.seedMember();
      const reply = await s.saveValues(m, rounding, "2025-12-30", [
        [rounding.metric("T"), seconds],
      ]);
      expectInvalid(reply, "values.0.value");
      expect((await s.assessmentRows(m.id)).length).toBe(0);
    });
  }

  test("D3 a refused duration names its own entry (values.1.value) and the good entry before it is not saved", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, rounding, "2025-12-30", [
      [rounding.metric("N1"), 94],
      [rounding.metric("T"), 40_000],
    ]);
    expectInvalid(reply, "values.1.value");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("D3 a refused duration on an edit leaves the stored assessment as it was", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, rounding, "2025-12-30", [
        [rounding.metric("N1"), 94],
        [rounding.metric("T"), 120],
      ]),
    );
    const reply = await s.saveValues(
      m,
      rounding,
      "2025-12-30",
      [
        [rounding.metric("N1"), 90],
        [rounding.metric("T"), 36_000],
      ],
      true,
    );
    expectInvalid(reply, "values.1.value");
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [rounding.metric("N1").id]: 94,
      [rounding.metric("T").id]: 120,
    });
    expect((await s.assessmentRow(first.assessmentId))?.isEstimated).toBe(
      false,
    );
  });

  test("D3 the 0 to 35,999 limit is for durations only: a Number measurement takes 40000", async () => {
    const { reply } = await saveOne("N1", 40_000);
    expect(dataOf<SaveResult>(reply).saved).toBe(1);
  });

  test("D3 a null for a duration is never checked against the limit (it is a removal)", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, rounding, "2025-12-30", [
      [rounding.metric("N1"), 94],
      [rounding.metric("T"), null],
    ]);
    expect(dataOf<SaveResult>(reply).saved).toBe(1);
  });
});

describe("E26 number limits (D3)", () => {
  test("D3 999,999,999.99 on a 2-decimal measurement is saved (inside the limit after rounding)", async () => {
    const { reply } = await saveOne("N2", 999_999_999.99);
    const result = dataOf<SaveResult>(reply);
    expect(await s.storedValues(result.assessmentId)).toEqual({
      [rounding.metric("N2").id]: 999_999_999.99,
    });
  });

  test("D3 -999,999,999.99 on a 2-decimal measurement is saved", async () => {
    const { reply } = await saveOne("N2", -999_999_999.99);
    expect(dataOf<SaveResult>(reply).saved).toBe(1);
  });

  test("D3 999,999,999.4 on a 0-decimal measurement is saved as 999,999,999", async () => {
    const { reply } = await saveOne("N0", 999_999_999.4);
    const result = dataOf<SaveResult>(reply);
    expect(await s.storedValues(result.assessmentId)).toEqual({
      [rounding.metric("N0").id]: 999_999_999,
    });
  });

  const refused: [value: number, metric: string][] = [
    [999_999_999.6, "N0"],
    [-999_999_999.6, "N0"],
    [999_999_999.96, "N1"],
    [-999_999_999.96, "N1"],
    [999_999_999.999, "N2"],
    [-999_999_999.999, "N2"],
    [999_999_999.999, "N1"],
    [999_999_999.999, "N0"],
  ];
  for (const [value, metric] of refused) {
    test(`D3 ${value} on ${metric} rounds past 999,999,999.999: refused 400 VALIDATION_ERROR, never a database error`, async () => {
      const m = await s.seedMember();
      const reply = await s.saveValues(m, rounding, "2025-12-30", [
        [rounding.metric(metric), value],
      ]);
      expectInvalid(reply, "values.0.value");
      expect((await s.assessmentRows(m.id)).length).toBe(0);
    });
  }

  const shapeRefused: [label: string, value: unknown][] = [
    ["1000000000", 1_000_000_000],
    ["-1000000000", -1_000_000_000],
    ["1e12", 1e12],
    ['the text "2:02"', "2:02"],
    ['the text "95.5"', "95.5"],
    ["true", true],
    ["an object", { v: 1 }],
  ];
  for (const [label, value] of shapeRefused) {
    test(`BR-REC-153 a value of ${label} is refused 400 VALIDATION_ERROR on values.0.value`, async () => {
      const m = await s.seedMember();
      const reply = await s.save({
        memberId: m.id,
        typeId: rounding.id,
        date: "2025-12-30",
        isEstimated: false,
        values: [{ metricId: rounding.metric("N1").id, value }],
      });
      expectInvalid(reply, "values.0.value");
      expect((await s.assessmentRows(m.id)).length).toBe(0);
    });
  }

  test("BR-REC-153 a value that is not finite (1e999) is refused 400 VALIDATION_ERROR on values.0.value", async () => {
    const m = await s.seedMember();
    const raw = `{"memberId":"${m.id}","typeId":"${rounding.id}","date":"2025-12-30","isEstimated":false,"values":[{"metricId":"${rounding.metric("N1").id}","value":1e999}]}`;
    const reply = await s.send("POST", "/api/assessments", { rawBody: raw });
    expectInvalid(reply, "values.0.value");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("BR-REC-153 an entry without the value key is refused 400 VALIDATION_ERROR on values.0.value", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: rounding.id,
      date: "2025-12-30",
      isEstimated: false,
      values: [{ metricId: rounding.metric("N1").id }],
    });
    expectInvalid(reply, "values.0.value");
  });

  test("BR-REC-153 an entry without a metricId is refused 400 VALIDATION_ERROR on values.0.metricId", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: rounding.id,
      date: "2025-12-30",
      isEstimated: false,
      values: [{ value: 94 }],
    });
    expectInvalid(reply, "values.0.metricId");
  });

  test("BR-REC-153 a metricId that is not an id is refused 400 VALIDATION_ERROR on values.0.metricId", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: rounding.id,
      date: "2025-12-30",
      isEstimated: false,
      values: [{ metricId: "weight", value: 94 }],
    });
    expectInvalid(reply, "values.0.metricId");
  });

  test("BR-REC-153 a shape error on a later entry is reported on that entry's index", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: rounding.id,
      date: "2025-12-30",
      isEstimated: false,
      values: [
        { metricId: rounding.metric("N1").id, value: 94 },
        { metricId: rounding.metric("N0").id, value: 1_000_000_000 },
      ],
    });
    expectInvalid(reply, "values.1.value");
  });
});

describe("E26 dates in a row for one member (BR-REC-19)", () => {
  test("BR-REC-19 back-filling several dates keeps one assessment per date", async () => {
    const m = await s.seedMember();
    const dates = [0, 1, 2, 3].map((i) => addDays("2025-01-01", i * 30));
    for (const [i, date] of dates.entries()) {
      const result = dataOf<SaveResult>(
        await s.saveValues(m, rounding, date, [
          [rounding.metric("N1"), 90 + i],
        ]),
      );
      expect(result.created).toBe(true);
    }
    const rows = await s.assessmentRows(m.id, rounding.id);
    expect(rows.map((r) => r.assessedOn)).toEqual(dates);
  });

  test("BR-REC-19 a refused save (here NO_VALUES) is not an assessment", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, rounding, "2025-12-30", []);
    expectError(reply, 400, "NO_VALUES");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });
});
