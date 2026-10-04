import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  addValue,
  api,
  assertCatalogOnlyOurs,
  cleanupAll,
  dbMetric,
  dbMetricCount,
  dbMetricsInOrder,
  dbStoredValues,
  expectError,
  expectInvalid,
  expectOk,
  METRIC_KEYS,
  type MetricOut,
  makeMetric,
  makeType,
  metricOf,
  PATH,
  typesOf,
  UUID_SHAPE,
  wipeCatalog,
} from "./helpers";

// member-records/setup E13 (add a measurement), E14 (change / turn off), E15 (order):
// BR-REC-10 (what a measurement is), 11 (lock once values exist), 14 (own repeat), 62 (limits),
// 63 (No direction), 64 (decimals), 65 (report-table place), 66 (never deleted, off hides),
// 67 (order), 69 (units are labels), 71 (better can change with values), C2-C4, C6-C9.

beforeAll(assertCatalogOnlyOurs);
beforeEach(wipeCatalog);
afterAll(cleanupAll);

const T = (suffix: string) => `TEST_setup_${suffix}`;
const idsOf = (list: { id: string }[]) => list.map((item) => item.id);

const createBody = (extra: Record<string, unknown> = {}) => ({
  name: "Burpees",
  datatype: "number",
  better: "higher",
  ...extra,
});

const create = (typeId: string, body: Record<string, unknown>) =>
  api.post(PATH.typeMetrics(typeId), { body });
const update = (metricId: string, body: Record<string, unknown>) =>
  api.patch(PATH.metric(metricId), { body });

/** A type and a typical number measurement ("Weight", kg, lower, check range 30 to 250). */
async function weight() {
  const type = await makeType({ name: T("Body") });
  const metric = await makeMetric(type.id, {
    name: "Weight",
    unit: "kg",
    decimals: 1,
    better: "lower",
    plausibleMin: 30,
    plausibleMax: 250,
  });
  return { type, metric };
}

/** A type and a Time measurement ("Fran") with the seeded settings. */
async function fran() {
  const type = await makeType({ name: T("Fitness") });
  const metric = await makeMetric(type.id, {
    name: "Fran",
    unit: "min:sec",
    datatype: "duration",
    decimals: 0,
    better: "lower",
    plausibleMin: 90,
    plausibleMax: 1800,
  });
  return { type, metric };
}

async function catalogMetrics(typeId: string): Promise<MetricOut[]> {
  const all = typesOf(
    await api.get("/api/assessment-types?includeInactive=true"),
  );
  return all.find((t) => t.id === typeId)?.metrics ?? [];
}

// ---------------------------------------------------------------------------

describe("E13 add a measurement", () => {
  test("BR-REC-10 / C7 201: only name, kind and better are needed; the rest takes its defaults and the measurement is On, without values", async () => {
    const type = await makeType({ name: T("Fit") });
    const reply = await create(type.id, createBody());
    expectOk(reply, 201);
    const metric = metricOf(reply);
    expect(Object.keys(metric).sort()).toEqual(METRIC_KEYS);
    expect(metric.id).toMatch(UUID_SHAPE);
    expect(metric).toMatchObject({
      name: "Burpees",
      unit: "",
      datatype: "number",
      decimals: 1,
      better: "higher",
      plausibleMin: null,
      plausibleMax: null,
      intervalCount: null,
      intervalUnit: null,
      tableGroup: null,
      tablePart: null,
      isActive: true,
      hasValues: false,
    });
  });

  test('BR-REC-10 Add "Burpees 1 min", count, higher: it is stored under the assessment and shows in the catalog', async () => {
    const type = await makeType({ name: T("Fit") });
    const reply = await create(type.id, {
      name: "Burpees 1 min",
      datatype: "number",
      unit: "count",
      decimals: 0,
      better: "higher",
    });
    expectOk(reply, 201);
    const row = await dbMetric(metricOf(reply).id);
    expect(row).toMatchObject({
      typeId: type.id,
      name: "Burpees 1 min",
      unit: "count",
      decimals: 0,
      better: "higher",
      isActive: true,
    });
    expect((await catalogMetrics(type.id)).map((m) => m.name)).toEqual([
      "Burpees 1 min",
    ]);
    const normal = typesOf(await api.get(PATH.types))[0];
    expect(normal?.metrics.map((m) => m.name)).toEqual(["Burpees 1 min"]);
  });

  test("BR-REC-10 every field sent is saved and answered as sent (numbers as JSON numbers)", async () => {
    const type = await makeType({ name: T("Fit") });
    const body = {
      name: "Skeletal muscle arms",
      datatype: "number",
      unit: "%",
      decimals: 2,
      better: "higher",
      plausibleMin: 10.5,
      plausibleMax: 60,
      intervalCount: 3,
      intervalUnit: "month",
      tableGroup: "Skeletal muscle %",
      tablePart: "arms",
    };
    const reply = await create(type.id, body);
    expectOk(reply, 201);
    expect(metricOf(reply)).toMatchObject(body);
    expect(typeof metricOf(reply).plausibleMin).toBe("number");
    expect(await dbMetric(metricOf(reply).id)).toMatchObject({
      ...body,
      typeId: type.id,
    });
  });

  test("C7 the new measurement is added last: its sortOrder is above every sibling's, off ones included", async () => {
    const type = await makeType({ name: T("Fit") });
    await makeMetric(type.id, { name: "One", sortOrder: 4 });
    await makeMetric(type.id, { name: "Off", sortOrder: 9, isActive: false });
    await makeMetric(type.id, { name: "Two", sortOrder: 2 });
    const reply = await create(type.id, createBody({ name: "Last" }));
    expect(metricOf(reply).sortOrder).toBeGreaterThan(9);
    const stored = await dbMetricsInOrder(type.id);
    expect(stored[stored.length - 1]?.name).toBe("Last");
  });

  test("C7 the measurement's own isActive, sortOrder or hasValues in the body decide nothing", async () => {
    const type = await makeType({ name: T("Fit") });
    await makeMetric(type.id, { name: "Existing", sortOrder: 3 });
    const reply = await create(
      type.id,
      createBody({ isActive: false, sortOrder: 0, hasValues: true }),
    );
    expectOk(reply, 201);
    expect(metricOf(reply)).toMatchObject({ isActive: true, hasValues: false });
    expect(metricOf(reply).sortOrder).toBeGreaterThan(3);
  });

  test("BR-REC-62 the same name can be used in another assessment", async () => {
    const a = await makeType({ name: T("A") });
    const b = await makeType({ name: T("B") });
    await makeMetric(a.id, { name: "Weight", sortOrder: 7 });
    const reply = await create(b.id, createBody({ name: "Weight" }));
    expectOk(reply, 201);
    expect(await dbMetricCount(b.id)).toBe(1);
  });

  describe("C3 / BR-REC-10 a Time (duration) measurement is always min:sec with 0 decimals", () => {
    test("nothing about unit or decimals sent", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({ name: "Fran", datatype: "duration", better: "lower" }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        datatype: "duration",
        unit: "min:sec",
        decimals: 0,
      });
    });

    test('unit "kg" and 2 decimals sent are accepted and answered as min:sec and 0', async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({
          name: "Fran",
          datatype: "duration",
          better: "lower",
          unit: "kg",
          decimals: 2,
        }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({ unit: "min:sec", decimals: 0 });
      expect(await dbMetric(metricOf(reply).id)).toMatchObject({
        unit: "min:sec",
        decimals: 0,
      });
    });

    test("the check range of a Time measurement is in seconds and comes back as it was sent", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({
          name: "Fran",
          datatype: "duration",
          better: "lower",
          plausibleMin: 90,
          plausibleMax: 1800,
        }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        plausibleMin: 90,
        plausibleMax: 1800,
      });
    });

    test("a unit over 12 characters is still 400 VALIDATION_ERROR on unit", async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(
          type.id,
          createBody({ datatype: "duration", unit: "x".repeat(13) }),
        ),
        "unit",
      );
    });

    test("3 decimals is still 400 VALIDATION_ERROR on decimals", async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(
          type.id,
          createBody({ datatype: "duration", decimals: 3 }),
        ),
        "decimals",
      );
    });
  });

  describe("BR-REC-64 / 69 a number measurement keeps its unit and decimals, and units are labels only", () => {
    for (const decimals of [0, 1, 2]) {
      test(`a number with ${decimals} decimal(s) keeps them`, async () => {
        const type = await makeType({ name: T("Fit") });
        const reply = await create(type.id, createBody({ decimals }));
        expect(metricOf(reply).decimals).toBe(decimals);
      });
    }

    test('BR-REC-69 unit "lb" on a new item is stored as the label "lb" and the check range is not converted', async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({
          name: "Pound lift",
          unit: "lb",
          plausibleMin: 100,
          plausibleMax: 300,
        }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        unit: "lb",
        plausibleMin: 100,
        plausibleMax: 300,
      });
      expect(await dbMetric(metricOf(reply).id)).toMatchObject({
        unit: "lb",
        plausibleMin: 100,
        plausibleMax: 300,
      });
    });

    test("BR-REC-62 the unit may be empty", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(type.id, createBody({ unit: "" }));
      expectOk(reply, 201);
      expect(metricOf(reply).unit).toBe("");
    });

    test("BR-REC-62 a unit of 12 characters is accepted", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(type.id, createBody({ unit: "x".repeat(12) }));
      expectOk(reply, 201);
      expect(metricOf(reply).unit).toBe("x".repeat(12));
    });

    test("BR-REC-62 a unit of 13 characters is 400 VALIDATION_ERROR on unit and nothing is created", async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(type.id, createBody({ unit: "x".repeat(13) })),
        "unit",
        "Use at most 12 characters",
      );
      expect(await dbMetricCount(type.id)).toBe(0);
    });

    for (const decimals of [-1, 3, 1.5, "1", null]) {
      test(`BR-REC-64 decimals ${JSON.stringify(decimals)} is 400 VALIDATION_ERROR on decimals`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectInvalid(
          await create(type.id, createBody({ decimals })),
          "decimals",
        );
        expect(await dbMetricCount(type.id)).toBe(0);
      });
    }

    test('BR-REC-64 decimals 3 says "Use 0, 1 or 2"', async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(type.id, createBody({ decimals: 3 })),
        "decimals",
        "Use 0, 1 or 2",
      );
    });
  });

  describe("BR-REC-62 the name is 2 to 40 characters", () => {
    for (const name of ["ab", "x".repeat(40), "  ab  "]) {
      test(`a name of ${name.trim().length} characters is accepted`, async () => {
        const type = await makeType({ name: T("Fit") });
        const reply = await create(type.id, createBody({ name }));
        expectOk(reply, 201);
        expect(metricOf(reply).name).toBe(name.trim());
      });
    }

    for (const [label, name] of [
      ["empty", ""],
      ["1 character", "a"],
      ["only spaces", "    "],
      ["1 character between spaces", "  a  "],
      ["41 characters", "x".repeat(41)],
      ["a number", 7],
      ["null", null],
    ] as [string, unknown][]) {
      test(`a name that is ${label} is 400 VALIDATION_ERROR on name and creates nothing`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectInvalid(await create(type.id, createBody({ name })), "name");
        expect(await dbMetricCount(type.id)).toBe(0);
      });
    }

    test("C2 the name is trimmed before it is saved", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(type.id, createBody({ name: "  Burpees  " }));
      expect(metricOf(reply).name).toBe("Burpees");
      expect((await dbMetric(metricOf(reply).id)).name).toBe("Burpees");
    });
  });

  describe("required fields and fixed lists", () => {
    for (const missing of ["name", "datatype", "better"]) {
      test(`a body without ${missing} is 400 VALIDATION_ERROR on ${missing}`, async () => {
        const type = await makeType({ name: T("Fit") });
        const body: Record<string, unknown> = createBody();
        delete body[missing];
        expectInvalid(await create(type.id, body), missing);
        expect(await dbMetricCount(type.id)).toBe(0);
      });
    }

    for (const datatype of ["text", "time", "Number", "", null]) {
      test(`datatype ${JSON.stringify(datatype)} is 400 VALIDATION_ERROR on datatype`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectInvalid(
          await create(type.id, createBody({ datatype })),
          "datatype",
        );
      });
    }

    for (const better of ["equal", "Higher", "", null]) {
      test(`better ${JSON.stringify(better)} is 400 VALIDATION_ERROR on better`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectInvalid(await create(type.id, createBody({ better })), "better");
      });
    }

    for (const better of ["higher", "lower", "none"] as const) {
      test(`BR-REC-63 better "${better}" is accepted`, async () => {
        const type = await makeType({ name: T("Fit") });
        const reply = await create(type.id, createBody({ better }));
        expectOk(reply, 201);
        expect(metricOf(reply).better).toBe(better);
      });
    }

    for (const datatype of ["number", "duration"] as const) {
      test(`datatype "${datatype}" is accepted`, async () => {
        const type = await makeType({ name: T("Fit") });
        const reply = await create(type.id, createBody({ datatype }));
        expectOk(reply, 201);
        expect(metricOf(reply).datatype).toBe(datatype);
      });
    }

    test("BR-REC-63 Height: number, cm, No direction", async () => {
      const type = await makeType({ name: T("Body") });
      const reply = await create(type.id, {
        name: "Height",
        datatype: "number",
        unit: "cm",
        decimals: 1,
        better: "none",
        plausibleMin: 120,
        plausibleMax: 220,
      });
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({ better: "none", unit: "cm" });
    });
  });

  describe('BR-REC-62 the "please check" range: below must be smaller than above', () => {
    test("both given and in order is saved", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({ plausibleMin: 10, plausibleMax: 50 }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        plausibleMin: 10,
        plausibleMax: 50,
      });
    });

    test('Min 50, max 10 is 400 VALIDATION_ERROR on plausibleMin: "Below must be smaller than above"', async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(
          type.id,
          createBody({ plausibleMin: 50, plausibleMax: 10 }),
        ),
        "plausibleMin",
        "Below must be smaller than above",
      );
      expect(await dbMetricCount(type.id)).toBe(0);
    });

    test("equal below and above is 400 VALIDATION_ERROR on plausibleMin", async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(
          type.id,
          createBody({ plausibleMin: 10, plausibleMax: 10 }),
        ),
        "plausibleMin",
      );
    });

    test("only below, only above, or null on either side is not checked", async () => {
      const type = await makeType({ name: T("Fit") });
      for (const [i, range] of [
        { plausibleMin: 50 },
        { plausibleMax: 10 },
        { plausibleMin: 50, plausibleMax: null },
        { plausibleMin: null, plausibleMax: 10 },
        { plausibleMin: null, plausibleMax: null },
      ].entries()) {
        const reply = await create(
          type.id,
          createBody({ name: `Range ${i}`, ...range }),
        );
        expectOk(reply, 201);
      }
    });

    test("a negative range is fine (Flexibility -30 to 60 cm)", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({
          name: "Flexibility",
          plausibleMin: -30,
          plausibleMax: 60,
        }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        plausibleMin: -30,
        plausibleMax: 60,
      });
    });

    test("the largest values the database holds (999,999,999.999 either way) are accepted", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({
          plausibleMin: -999999999.999,
          plausibleMax: 999999999.999,
        }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        plausibleMin: -999999999.999,
        plausibleMax: 999999999.999,
      });
    });

    for (const [field, value] of [
      ["plausibleMin", -1000000000],
      ["plausibleMax", 1000000000],
      ["plausibleMax", "ten"],
    ] as [string, unknown][]) {
      test(`${field} ${JSON.stringify(value)} is 400 VALIDATION_ERROR on ${field}`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectInvalid(
          await create(type.id, createBody({ [field]: value })),
          field,
        );
        expect(await dbMetricCount(type.id)).toBe(0);
      });
    }

    test('a value over the limit says "Use a number up to 999,999,999.999 either way"', async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(type.id, createBody({ plausibleMax: 1000000000 })),
        "plausibleMax",
        "Use a number up to 999,999,999.999 either way",
      );
    });
  });

  describe("BR-REC-14 an own repeat interval is a count and a unit together", () => {
    test("both set is saved", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({ name: "Fran", intervalCount: 3, intervalUnit: "month" }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        intervalCount: 3,
        intervalUnit: "month",
      });
    });

    test("both null is the same as none", async () => {
      const type = await makeType({ name: T("Fit") });
      const reply = await create(
        type.id,
        createBody({ intervalCount: null, intervalUnit: null }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        intervalCount: null,
        intervalUnit: null,
      });
    });

    for (const [label, pair] of [
      ["a count without a unit", { intervalCount: 3 }],
      ["a unit without a count", { intervalUnit: "week" }],
      ["a count with a null unit", { intervalCount: 3, intervalUnit: null }],
      [
        "a unit with a null count",
        { intervalCount: null, intervalUnit: "week" },
      ],
    ] as [string, Record<string, unknown>][]) {
      test(`${label} is 400 VALIDATION_ERROR on intervalCount: "Set both the repeat number and unit, or neither"`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectInvalid(
          await create(type.id, createBody(pair)),
          "intervalCount",
          "Set both the repeat number and unit, or neither",
        );
        expect(await dbMetricCount(type.id)).toBe(0);
      });
    }

    for (const count of [0, 25, 1.5]) {
      test(`an own repeat count of ${count} is 400 VALIDATION_ERROR on intervalCount ("Use 1 to 24")`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectInvalid(
          await create(
            type.id,
            createBody({ intervalCount: count, intervalUnit: "month" }),
          ),
          "intervalCount",
        );
      });
    }

    test("an own repeat unit that is not week or month is 400 VALIDATION_ERROR on intervalUnit", async () => {
      const type = await makeType({ name: T("Fit") });
      expectInvalid(
        await create(
          type.id,
          createBody({ intervalCount: 2, intervalUnit: "day" }),
        ),
        "intervalUnit",
      );
    });

    for (const count of [1, 24]) {
      test(`an own repeat of ${count} weeks is accepted`, async () => {
        const type = await makeType({ name: T("Fit") });
        expectOk(
          await create(
            type.id,
            createBody({ intervalCount: count, intervalUnit: "week" }),
          ),
          201,
        );
      });
    }

    test("the assessment's own interval is not touched by a measurement's own repeat", async () => {
      const type = await makeType({
        name: T("Fit"),
        intervalCount: 2,
        intervalUnit: "month",
      });
      await create(
        type.id,
        createBody({ intervalCount: 3, intervalUnit: "month" }),
      );
      const listed = typesOf(await api.get(PATH.types))[0];
      expect(listed).toMatchObject({ intervalCount: 2, intervalUnit: "month" });
    });
  });

  describe("BR-REC-65 a report-table place is a group and a body part together", () => {
    for (const part of ["whole_body", "arms", "trunk", "legs"]) {
      test(`group "Skeletal muscle %" with part ${part} is saved`, async () => {
        const type = await makeType({ name: T("Body") });
        const reply = await create(
          type.id,
          createBody({
            name: `Skeletal muscle ${part}`,
            tableGroup: "Skeletal muscle %",
            tablePart: part,
          }),
        );
        expectOk(reply, 201);
        expect(metricOf(reply)).toMatchObject({
          tableGroup: "Skeletal muscle %",
          tablePart: part,
        });
      });
    }

    test("both null is the same as none", async () => {
      const type = await makeType({ name: T("Body") });
      const reply = await create(
        type.id,
        createBody({ tableGroup: null, tablePart: null }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply)).toMatchObject({
        tableGroup: null,
        tablePart: null,
      });
    });

    for (const [label, pair] of [
      ["a group without a part", { tableGroup: "Skeletal muscle %" }],
      ["a part without a group", { tablePart: "arms" }],
      ["a group with a null part", { tableGroup: "Group", tablePart: null }],
      ["a part with a null group", { tableGroup: null, tablePart: "legs" }],
    ] as [string, Record<string, unknown>][]) {
      test(`${label} is 400 VALIDATION_ERROR on tableGroup: "Set both the report group and part, or neither"`, async () => {
        const type = await makeType({ name: T("Body") });
        expectInvalid(
          await create(type.id, createBody(pair)),
          "tableGroup",
          "Set both the report group and part, or neither",
        );
        expect(await dbMetricCount(type.id)).toBe(0);
      });
    }

    test("C2 the report group is trimmed", async () => {
      const type = await makeType({ name: T("Body") });
      const reply = await create(
        type.id,
        createBody({ tableGroup: "  Skeletal muscle %  ", tablePart: "arms" }),
      );
      expectOk(reply, 201);
      expect(metricOf(reply).tableGroup).toBe("Skeletal muscle %");
    });

    for (const [label, group] of [
      ["1 character", "a"],
      ["41 characters", "x".repeat(41)],
      ["only spaces", "   "],
    ] as [string, string][]) {
      test(`C2 a report group of ${label} is 400 VALIDATION_ERROR on tableGroup`, async () => {
        const type = await makeType({ name: T("Body") });
        expectInvalid(
          await create(
            type.id,
            createBody({ tableGroup: group, tablePart: "arms" }),
          ),
          "tableGroup",
        );
      });
    }

    test("a report group of 2 and of 40 characters is accepted", async () => {
      const type = await makeType({ name: T("Body") });
      for (const group of ["ab", "x".repeat(40)]) {
        expectOk(
          await create(
            type.id,
            createBody({
              name: `In ${group.length}`,
              tableGroup: group,
              tablePart: "trunk",
            }),
          ),
          201,
        );
      }
    });

    test("a part that is not whole_body, arms, trunk or legs is 400 VALIDATION_ERROR on tablePart", async () => {
      const type = await makeType({ name: T("Body") });
      expectInvalid(
        await create(
          type.id,
          createBody({ tableGroup: "Group", tablePart: "head" }),
        ),
        "tablePart",
      );
    });
  });

  describe("BR-REC-62 the name is unique inside its assessment", () => {
    test("the same name in the same assessment is 409 NAME_TAKEN and creates nothing", async () => {
      const type = await makeType({ name: T("Fit") });
      await makeMetric(type.id, { name: "Weight" });
      expectError(
        await create(type.id, createBody({ name: "Weight" })),
        409,
        "NAME_TAKEN",
      );
      expect(await dbMetricCount(type.id)).toBe(1);
    });

    test("other letter case is the same name", async () => {
      const type = await makeType({ name: T("Fit") });
      await makeMetric(type.id, { name: "Weight" });
      for (const name of ["weight", "WEIGHT", "wEiGhT"]) {
        expectError(
          await create(type.id, createBody({ name })),
          409,
          "NAME_TAKEN",
        );
      }
    });

    test("C2 names are compared after trimming", async () => {
      const type = await makeType({ name: T("Fit") });
      await makeMetric(type.id, { name: "Weight" });
      expectError(
        await create(type.id, createBody({ name: "   weight   " })),
        409,
        "NAME_TAKEN",
      );
    });

    test("BR-REC-66 a measurement that is off still holds its name", async () => {
      const type = await makeType({ name: T("Fit") });
      await makeMetric(type.id, { name: "Plank", isActive: false });
      expectError(
        await create(type.id, createBody({ name: "plank" })),
        409,
        "NAME_TAKEN",
      );
    });

    test("the same name in a different assessment is fine", async () => {
      const a = await makeType({ name: T("A") });
      const b = await makeType({ name: T("B") });
      await makeMetric(a.id, { name: "Weight" });
      expectOk(await create(b.id, createBody({ name: "Weight" })), 201);
    });

    test("a name used by an assessment (not a measurement) is fine", async () => {
      const type = await makeType({ name: T("Fit") });
      expectOk(await create(type.id, createBody({ name: T("Fit") })), 201);
    });
  });

  describe("the assessment id", () => {
    test("an unknown assessment is 404 NOT_FOUND", async () => {
      expectError(await create(UNKNOWN_ID, createBody()), 404, "NOT_FOUND");
    });

    test("an id that is not a uuid is 400 VALIDATION_ERROR", async () => {
      expectInvalid(await create("not-an-id", createBody()));
    });

    test("a bad body is 400 even when the assessment does not exist", async () => {
      expectInvalid(
        await create(UNKNOWN_ID, createBody({ decimals: 9 })),
        "decimals",
      );
    });

    test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
      const type = await makeType({ name: T("Fit") });
      expectError(
        await api.post(PATH.typeMetrics(type.id), { rawBody: "{nope" }),
        400,
        "INVALID_JSON",
      );
    });
  });
});

// ---------------------------------------------------------------------------

describe("E14 change or turn off a measurement", () => {
  describe("BR-REC-10 only the fields sent change", () => {
    test("a rename leaves every other field as it was", async () => {
      const { metric } = await weight();
      const before = await dbMetric(metric.id);
      const reply = await update(metric.id, { name: "Body weight" });
      expectOk(reply);
      expect(Object.keys(metricOf(reply)).sort()).toEqual(METRIC_KEYS);
      expect(metricOf(reply)).toMatchObject({
        id: metric.id,
        name: "Body weight",
        unit: "kg",
        datatype: "number",
        decimals: 1,
        better: "lower",
        plausibleMin: 30,
        plausibleMax: 250,
        isActive: true,
        sortOrder: before.sortOrder,
      });
      expect(await dbMetric(metric.id)).toMatchObject({
        name: "Body weight",
        unit: "kg",
        better: "lower",
        plausibleMin: 30,
        plausibleMax: 250,
      });
    });

    test("several fields in one request are all saved", async () => {
      const { metric } = await weight();
      const reply = await update(metric.id, {
        name: "Mass",
        decimals: 2,
        better: "none",
        plausibleMin: 20,
        plausibleMax: 300,
        intervalCount: 6,
        intervalUnit: "week",
        tableGroup: "Group",
        tablePart: "legs",
        isActive: false,
      });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        name: "Mass",
        decimals: 2,
        better: "none",
        plausibleMin: 20,
        plausibleMax: 300,
        intervalCount: 6,
        intervalUnit: "week",
        tableGroup: "Group",
        tablePart: "legs",
        isActive: false,
      });
      expect(await dbMetric(metric.id)).toMatchObject({
        name: "Mass",
        decimals: 2,
        better: "none",
        isActive: false,
      });
    });

    test("the answer's check range comes back as JSON numbers", async () => {
      const { metric } = await weight();
      const reply = await update(metric.id, {
        plausibleMin: 12.5,
        plausibleMax: 99.75,
      });
      expect(metricOf(reply).plausibleMin).toBe(12.5);
      expect(metricOf(reply).plausibleMax).toBe(99.75);
    });
  });

  describe("BR-REC-11 / 64 / 71 name, decimals, better, range, repeat, place and On/Off can change even when values exist", () => {
    const changes: [string, Record<string, unknown>][] = [
      ["name", { name: "Body weight" }],
      ["decimals", { decimals: 2 }],
      ["better (lower to higher)", { better: "higher" }],
      ["better (to No direction)", { better: "none" }],
      ["check range", { plausibleMin: 20, plausibleMax: 300 }],
      ["own repeat", { intervalCount: 3, intervalUnit: "month" }],
      ["report-table place", { tableGroup: "Group", tablePart: "arms" }],
      ["On/Off", { isActive: false }],
    ];
    for (const [label, body] of changes) {
      test(`${label} is saved`, async () => {
        const { metric } = await weight();
        await addValue(metric.id, 80);
        const reply = await update(metric.id, body);
        expectOk(reply);
        expect(metricOf(reply)).toMatchObject({ ...body, hasValues: true });
        expect(await dbMetric(metric.id)).toMatchObject(body);
      });
    }

    test("BR-REC-71 changing better on a measurement with values needs no extra field: it is simply saved", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 80);
      const reply = await update(metric.id, { better: "higher" });
      expectOk(reply);
      expect(metricOf(reply).better).toBe("higher");
    });
  });

  describe("C9 / BR-REC-64 changing decimals changes how values are shown, never the stored values", () => {
    test("stored values are exactly what they were after decimals go 1 -> 0 -> 2", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 95.56);
      await addValue(metric.id, 95.5);
      const before = (await dbStoredValues(metric.id))
        .map((row) => row.value)
        .sort();
      expect(before).toEqual([95.5, 95.56]);

      expectOk(await update(metric.id, { decimals: 0 }));
      expect(
        (await dbStoredValues(metric.id)).map((row) => row.value).sort(),
      ).toEqual(before);
      expectOk(await update(metric.id, { decimals: 2 }));
      expect(
        (await dbStoredValues(metric.id)).map((row) => row.value).sort(),
      ).toEqual(before);
      expect((await dbMetric(metric.id)).decimals).toBe(2);
    });
  });

  describe("BR-REC-11 datatype and unit are locked once any value exists (409 METRIC_LOCKED)", () => {
    test("a number measurement's unit cannot change once it has a value", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 80);
      expectError(
        await update(metric.id, { unit: "lb" }),
        409,
        "METRIC_LOCKED",
      );
      expect((await dbMetric(metric.id)).unit).toBe("kg");
    });

    test("a unit cannot be emptied once there is a value", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 80);
      expectError(await update(metric.id, { unit: "" }), 409, "METRIC_LOCKED");
      expect((await dbMetric(metric.id)).unit).toBe("kg");
    });

    test("the datatype cannot change once there is a value (number to duration)", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 80);
      expectError(
        await update(metric.id, { datatype: "duration" }),
        409,
        "METRIC_LOCKED",
      );
      expect(await dbMetric(metric.id)).toMatchObject({
        datatype: "number",
        unit: "kg",
        decimals: 1,
      });
    });

    test("the datatype cannot change once there is a value (duration to number)", async () => {
      const { metric } = await fran();
      await addValue(metric.id, 122);
      expectError(
        await update(metric.id, { datatype: "number" }),
        409,
        "METRIC_LOCKED",
      );
      expect(await dbMetric(metric.id)).toMatchObject({
        datatype: "duration",
        unit: "min:sec",
      });
    });

    test("a refused change saves nothing, not even the other fields sent along", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 80);
      expectError(
        await update(metric.id, { name: "Renamed", unit: "lb", decimals: 2 }),
        409,
        "METRIC_LOCKED",
      );
      expect(await dbMetric(metric.id)).toMatchObject({
        name: "Weight",
        unit: "kg",
        decimals: 1,
      });
    });

    test("C4 sending the stored datatype and unit again is fine", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 80);
      const reply = await update(metric.id, {
        datatype: "number",
        unit: "kg",
        name: "Body weight",
      });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        name: "Body weight",
        datatype: "number",
        unit: "kg",
        hasValues: true,
      });
    });

    test("C4 the stored values of a Time measurement can be sent again (min:sec)", async () => {
      const { metric } = await fran();
      await addValue(metric.id, 122);
      const reply = await update(metric.id, {
        datatype: "duration",
        unit: "min:sec",
        decimals: 0,
      });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        datatype: "duration",
        unit: "min:sec",
        decimals: 0,
      });
    });

    test("C4 a unit sent for a Time measurement with values is 200 and the unit stays min:sec", async () => {
      const { metric } = await fran();
      await addValue(metric.id, 122);
      const reply = await update(metric.id, { unit: "kg" });
      expectOk(reply);
      expect(metricOf(reply).unit).toBe("min:sec");
      expect((await dbMetric(metric.id)).unit).toBe("min:sec");
    });

    test("C3 decimals sent for a Time measurement with values are 200 and stay 0", async () => {
      const { metric } = await fran();
      await addValue(metric.id, 122);
      const reply = await update(metric.id, { decimals: 2 });
      expectOk(reply);
      expect(metricOf(reply).decimals).toBe(0);
    });

    test("BR-REC-66 a measurement that is off with values is still locked", async () => {
      const { metric } = await weight();
      await addValue(metric.id, 80);
      expectOk(await update(metric.id, { isActive: false }));
      expectError(
        await update(metric.id, { unit: "lb" }),
        409,
        "METRIC_LOCKED",
      );
    });

    test("C6 only this measurement's own values lock it: a sibling without values can still change unit and datatype", async () => {
      const { type, metric } = await weight();
      const sibling = await makeMetric(type.id, {
        name: "Sibling",
        unit: "kg",
      });
      await addValue(metric.id, 80);
      const reply = await update(sibling.id, { unit: "lb" });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({ unit: "lb", hasValues: false });
      expectOk(await update(sibling.id, { datatype: "duration" }));
    });

    test("BR-REC-11 the lock shows in the answer and the catalog: hasValues is true", async () => {
      const { type, metric } = await weight();
      await addValue(metric.id, 80);
      expect((await catalogMetrics(type.id))[0]?.hasValues).toBe(true);
    });
  });

  describe("C3 without values, kind and unit can change", () => {
    test("a unit can change on a number measurement with no values (labels only, no maths)", async () => {
      const { metric } = await weight();
      const reply = await update(metric.id, { unit: "lb" });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        unit: "lb",
        plausibleMin: 30,
        plausibleMax: 250,
      });
    });

    test("number to Time sets min:sec and 0 decimals, whatever is sent", async () => {
      const { metric } = await weight();
      const reply = await update(metric.id, {
        datatype: "duration",
        unit: "kg",
        decimals: 2,
      });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        datatype: "duration",
        unit: "min:sec",
        decimals: 0,
      });
      expect(await dbMetric(metric.id)).toMatchObject({
        datatype: "duration",
        unit: "min:sec",
        decimals: 0,
      });
    });

    test("number to Time with nothing else sent sets min:sec and 0 decimals", async () => {
      const { metric } = await weight();
      const reply = await update(metric.id, { datatype: "duration" });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        datatype: "duration",
        unit: "min:sec",
        decimals: 0,
      });
    });

    test("Time to Number without a unit in the body leaves the unit empty", async () => {
      const { metric } = await fran();
      const reply = await update(metric.id, { datatype: "number" });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({ datatype: "number", unit: "" });
      expect((await dbMetric(metric.id)).unit).toBe("");
    });

    test("Time to Number with a unit and decimals keeps what is sent", async () => {
      const { metric } = await fran();
      const reply = await update(metric.id, {
        datatype: "number",
        unit: "kg",
        decimals: 2,
      });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        datatype: "number",
        unit: "kg",
        decimals: 2,
      });
    });

    test("a unit or decimals sent for a Time measurement without values are ignored (always min:sec, 0)", async () => {
      const { metric } = await fran();
      const reply = await update(metric.id, { unit: "kg", decimals: 2 });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({ unit: "min:sec", decimals: 0 });
    });

    test("a number measurement's decimals can change to 0, 1 and 2", async () => {
      const { metric } = await weight();
      for (const decimals of [0, 2, 1]) {
        const reply = await update(metric.id, { decimals });
        expectOk(reply);
        expect(metricOf(reply).decimals).toBe(decimals);
      }
    });
  });

  describe("BR-REC-14 / 65 optional fields are cleared with null", () => {
    test("plausibleMin and plausibleMax can be cleared one at a time", async () => {
      const { metric } = await weight();
      const first = await update(metric.id, { plausibleMin: null });
      expectOk(first);
      expect(metricOf(first)).toMatchObject({
        plausibleMin: null,
        plausibleMax: 250,
      });
      const second = await update(metric.id, { plausibleMax: null });
      expect(metricOf(second)).toMatchObject({
        plausibleMin: null,
        plausibleMax: null,
      });
      expect(await dbMetric(metric.id)).toMatchObject({
        plausibleMin: null,
        plausibleMax: null,
      });
    });

    test("an own repeat is set, kept apart from the assessment's, and cleared with both null", async () => {
      const type = await makeType({
        name: T("Fit"),
        intervalCount: 2,
        intervalUnit: "month",
      });
      const metric = await makeMetric(type.id, { name: "Fran" });
      const set = await update(metric.id, {
        intervalCount: 3,
        intervalUnit: "month",
      });
      expect(metricOf(set)).toMatchObject({
        intervalCount: 3,
        intervalUnit: "month",
      });
      expect(typesOf(await api.get(PATH.types))[0]).toMatchObject({
        intervalCount: 2,
        intervalUnit: "month",
      });
      const cleared = await update(metric.id, {
        intervalCount: null,
        intervalUnit: null,
      });
      expectOk(cleared);
      expect(metricOf(cleared)).toMatchObject({
        intervalCount: null,
        intervalUnit: null,
      });
      expect(await dbMetric(metric.id)).toMatchObject({
        intervalCount: null,
        intervalUnit: null,
      });
    });

    test("a report-table place is set and cleared with both null", async () => {
      const { metric } = await weight();
      expectOk(
        await update(metric.id, { tableGroup: "Group", tablePart: "trunk" }),
      );
      const cleared = await update(metric.id, {
        tableGroup: null,
        tablePart: null,
      });
      expectOk(cleared);
      expect(metricOf(cleared)).toMatchObject({
        tableGroup: null,
        tablePart: null,
      });
      expect(await dbMetric(metric.id)).toMatchObject({
        tableGroup: null,
        tablePart: null,
      });
    });
  });

  describe("C8 a pair or range checked against the stored values when only one side is sent (400 VALIDATION_ERROR, nothing changes)", () => {
    test("only plausibleMin sent and not below the stored plausibleMax", async () => {
      const { metric } = await weight(); // 30 .. 250
      for (const min of [250, 300]) {
        expectInvalid(await update(metric.id, { plausibleMin: min }));
      }
      expect(await dbMetric(metric.id)).toMatchObject({
        plausibleMin: 30,
        plausibleMax: 250,
      });
    });

    test("only plausibleMax sent and not above the stored plausibleMin", async () => {
      const { metric } = await weight(); // 30 .. 250
      for (const max of [30, 20]) {
        expectInvalid(await update(metric.id, { plausibleMax: max }));
      }
      expect(await dbMetric(metric.id)).toMatchObject({
        plausibleMin: 30,
        plausibleMax: 250,
      });
    });

    test("only one side sent and still in order is saved", async () => {
      const { metric } = await weight(); // 30 .. 250
      expectOk(await update(metric.id, { plausibleMin: 249 }));
      expectOk(await update(metric.id, { plausibleMax: 250 }));
      const reply = await update(metric.id, {
        plausibleMin: 31,
        plausibleMax: 32,
      });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        plausibleMin: 31,
        plausibleMax: 32,
      });
    });

    test("only one side sent while the other side is empty is not checked", async () => {
      const type = await makeType({ name: T("Fit") });
      const metric = await makeMetric(type.id, { name: "Open range" });
      const reply = await update(metric.id, { plausibleMin: 1000 });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        plausibleMin: 1000,
        plausibleMax: null,
      });
      expectOk(await update(metric.id, { plausibleMax: 2000 }));
    });

    test("clearing one side with null is always fine", async () => {
      const { metric } = await weight();
      expectOk(await update(metric.id, { plausibleMax: null }));
      expectOk(await update(metric.id, { plausibleMin: null }));
    });

    test("only intervalCount sent, with no own repeat stored", async () => {
      const { metric } = await weight();
      expectInvalid(await update(metric.id, { intervalCount: 3 }));
      expect(await dbMetric(metric.id)).toMatchObject({
        intervalCount: null,
        intervalUnit: null,
      });
    });

    test("only intervalUnit sent, with no own repeat stored", async () => {
      const { metric } = await weight();
      expectInvalid(await update(metric.id, { intervalUnit: "week" }));
      expect(await dbMetric(metric.id)).toMatchObject({
        intervalCount: null,
        intervalUnit: null,
      });
    });

    test("intervalCount null alone while a unit is stored", async () => {
      const type = await makeType({ name: T("Fit") });
      const metric = await makeMetric(type.id, {
        name: "Own",
        intervalCount: 3,
        intervalUnit: "month",
      });
      expectInvalid(await update(metric.id, { intervalCount: null }));
      expect(await dbMetric(metric.id)).toMatchObject({
        intervalCount: 3,
        intervalUnit: "month",
      });
    });

    test("intervalUnit null alone while a count is stored", async () => {
      const type = await makeType({ name: T("Fit") });
      const metric = await makeMetric(type.id, {
        name: "Own",
        intervalCount: 3,
        intervalUnit: "month",
      });
      expectInvalid(await update(metric.id, { intervalUnit: null }));
      expect(await dbMetric(metric.id)).toMatchObject({
        intervalCount: 3,
        intervalUnit: "month",
      });
    });

    test("one side of the own repeat can change when the other is stored", async () => {
      const type = await makeType({ name: T("Fit") });
      const metric = await makeMetric(type.id, {
        name: "Own",
        intervalCount: 3,
        intervalUnit: "month",
      });
      const count = await update(metric.id, { intervalCount: 5 });
      expectOk(count);
      expect(metricOf(count)).toMatchObject({
        intervalCount: 5,
        intervalUnit: "month",
      });
      const unit = await update(metric.id, { intervalUnit: "week" });
      expectOk(unit);
      expect(metricOf(unit)).toMatchObject({
        intervalCount: 5,
        intervalUnit: "week",
      });
    });

    test("only tableGroup sent, with no place stored", async () => {
      const { metric } = await weight();
      expectInvalid(await update(metric.id, { tableGroup: "Group" }));
      expect(await dbMetric(metric.id)).toMatchObject({
        tableGroup: null,
        tablePart: null,
      });
    });

    test("only tablePart sent, with no place stored", async () => {
      const { metric } = await weight();
      expectInvalid(await update(metric.id, { tablePart: "arms" }));
      expect(await dbMetric(metric.id)).toMatchObject({
        tableGroup: null,
        tablePart: null,
      });
    });

    test("tableGroup null alone while a part is stored", async () => {
      const type = await makeType({ name: T("Fit") });
      const metric = await makeMetric(type.id, {
        name: "Placed",
        tableGroup: "Group",
        tablePart: "arms",
      });
      expectInvalid(await update(metric.id, { tableGroup: null }));
      expect(await dbMetric(metric.id)).toMatchObject({
        tableGroup: "Group",
        tablePart: "arms",
      });
    });

    test("tablePart null alone while a group is stored", async () => {
      const type = await makeType({ name: T("Fit") });
      const metric = await makeMetric(type.id, {
        name: "Placed",
        tableGroup: "Group",
        tablePart: "arms",
      });
      expectInvalid(await update(metric.id, { tablePart: null }));
      expect(await dbMetric(metric.id)).toMatchObject({
        tableGroup: "Group",
        tablePart: "arms",
      });
    });

    test("one side of the report-table place can change when the other is stored", async () => {
      const type = await makeType({ name: T("Fit") });
      const metric = await makeMetric(type.id, {
        name: "Placed",
        tableGroup: "Group",
        tablePart: "arms",
      });
      const part = await update(metric.id, { tablePart: "legs" });
      expectOk(part);
      expect(metricOf(part)).toMatchObject({
        tableGroup: "Group",
        tablePart: "legs",
      });
      const group = await update(metric.id, { tableGroup: "Other group" });
      expectOk(group);
      expect(metricOf(group)).toMatchObject({
        tableGroup: "Other group",
        tablePart: "legs",
      });
    });
  });

  describe("BR-REC-62 limits on a change (same as on adding)", () => {
    const refused: [string, Record<string, unknown>, string][] = [
      ["a name of 1 character", { name: "a" }, "name"],
      ["a name of 41 characters", { name: "x".repeat(41) }, "name"],
      ["a name of only spaces", { name: "   " }, "name"],
      ["a unit of 13 characters", { unit: "x".repeat(13) }, "unit"],
      ["decimals 3", { decimals: 3 }, "decimals"],
      ["decimals -1", { decimals: -1 }, "decimals"],
      ["decimals 1.5", { decimals: 1.5 }, "decimals"],
      [
        "a datatype that is neither number nor duration",
        { datatype: "text" },
        "datatype",
      ],
      ["a better that is none of the three", { better: "equal" }, "better"],
      ["isActive that is not true or false", { isActive: "yes" }, "isActive"],
      [
        "a check range over the limit",
        { plausibleMax: 1000000000 },
        "plausibleMax",
      ],
      [
        "a check range under the limit",
        { plausibleMin: -1000000000 },
        "plausibleMin",
      ],
      [
        "below not smaller than above",
        { plausibleMin: 50, plausibleMax: 10 },
        "plausibleMin",
      ],
      [
        "equal below and above",
        { plausibleMin: 10, plausibleMax: 10 },
        "plausibleMin",
      ],
      [
        "an own repeat count of 0",
        { intervalCount: 0, intervalUnit: "week" },
        "intervalCount",
      ],
      [
        "an own repeat count of 25",
        { intervalCount: 25, intervalUnit: "week" },
        "intervalCount",
      ],
      [
        "an own repeat unit of day",
        { intervalCount: 3, intervalUnit: "day" },
        "intervalUnit",
      ],
      [
        "an own repeat count with a null unit in the same body",
        { intervalCount: 3, intervalUnit: null },
        "intervalCount",
      ],
      [
        "a report group with a null part in the same body",
        { tableGroup: "Group", tablePart: null },
        "tableGroup",
      ],
      [
        "a report group of 1 character",
        { tableGroup: "a", tablePart: "arms" },
        "tableGroup",
      ],
      [
        "a report group of 41 characters",
        { tableGroup: "x".repeat(41), tablePart: "arms" },
        "tableGroup",
      ],
      [
        "a part that is not one of the four",
        { tableGroup: "Group", tablePart: "head" },
        "tablePart",
      ],
    ];
    for (const [label, body, path] of refused) {
      test(`${label} is 400 VALIDATION_ERROR on ${path} and changes nothing`, async () => {
        const { metric } = await weight();
        const before = await dbMetric(metric.id);
        expectInvalid(await update(metric.id, body), path);
        expect(await dbMetric(metric.id)).toEqual(before);
      });
    }

    test('below not smaller than above says "Below must be smaller than above"', async () => {
      const { metric } = await weight();
      expectInvalid(
        await update(metric.id, { plausibleMin: 50, plausibleMax: 10 }),
        "plausibleMin",
        "Below must be smaller than above",
      );
    });

    test('a unit of 13 characters says "Use at most 12 characters"', async () => {
      const { metric } = await weight();
      expectInvalid(
        await update(metric.id, { unit: "x".repeat(13) }),
        "unit",
        "Use at most 12 characters",
      );
    });

    test("C2 name and report group are trimmed", async () => {
      const { metric } = await weight();
      const reply = await update(metric.id, {
        name: "  Body weight  ",
        tableGroup: "  Group  ",
        tablePart: "arms",
      });
      expectOk(reply);
      expect(metricOf(reply)).toMatchObject({
        name: "Body weight",
        tableGroup: "Group",
      });
    });

    test("BR-REC-157 an unknown field is 400 VALIDATION_ERROR and changes nothing", async () => {
      const { metric } = await weight();
      expectInvalid(await update(metric.id, { name: "Renamed", sortOrder: 5 }));
      expectInvalid(
        await update(metric.id, { name: "Renamed", hasValues: true }),
      );
      expectInvalid(
        await update(metric.id, { name: "Renamed", typeId: UNKNOWN_ID }),
      );
      expect((await dbMetric(metric.id)).name).toBe("Weight");
    });

    test("BR-REC-157 an empty body is 400 VALIDATION_ERROR (at least one field)", async () => {
      const { metric } = await weight();
      expectInvalid(await update(metric.id, {}));
    });

    test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
      const { metric } = await weight();
      expectError(
        await api.patch(PATH.metric(metric.id), { rawBody: "nope" }),
        400,
        "INVALID_JSON",
      );
    });
  });

  describe("BR-REC-62 the name stays unique inside its assessment", () => {
    test("renaming to a sibling's name (other case) is 409 NAME_TAKEN and changes nothing", async () => {
      const { type, metric } = await weight();
      await makeMetric(type.id, { name: "Height" });
      expectError(
        await update(metric.id, { name: "HEIGHT", decimals: 0 }),
        409,
        "NAME_TAKEN",
      );
      expect(await dbMetric(metric.id)).toMatchObject({
        name: "Weight",
        decimals: 1,
      });
    });

    test("a sibling that is off still holds its name", async () => {
      const { type, metric } = await weight();
      await makeMetric(type.id, { name: "Height", isActive: false });
      expectError(
        await update(metric.id, { name: "height" }),
        409,
        "NAME_TAKEN",
      );
    });

    test("C2 the trimmed new name is what is compared", async () => {
      const { type, metric } = await weight();
      await makeMetric(type.id, { name: "Height" });
      expectError(
        await update(metric.id, { name: "  Height  " }),
        409,
        "NAME_TAKEN",
      );
    });

    test("keeping the measurement's own name, or only re-casing it, is fine", async () => {
      const { metric } = await weight();
      expectOk(await update(metric.id, { name: "Weight", decimals: 2 }));
      const recased = await update(metric.id, { name: "WEIGHT" });
      expectOk(recased);
      expect(metricOf(recased).name).toBe("WEIGHT");
    });

    test("the same name as a measurement of another assessment is fine", async () => {
      const { metric } = await weight();
      const other = await makeType({ name: T("Other") });
      await makeMetric(other.id, { name: "Height" });
      expectOk(await update(metric.id, { name: "Height" }));
    });
  });

  describe("BR-REC-66 turning a measurement off and on, never deleting", () => {
    test("off hides it from the catalog's default list; the history stays", async () => {
      const { type, metric } = await weight();
      const keep = await makeMetric(type.id, { name: "Keep" });
      await addValue(metric.id, 80);

      const off = await update(metric.id, { isActive: false });
      expectOk(off);
      expect(metricOf(off)).toMatchObject({ isActive: false, hasValues: true });

      const normal = typesOf(await api.get(PATH.types))[0];
      expect(idsOf(normal?.metrics ?? [])).toEqual([keep.id]);
      const all = await catalogMetrics(type.id);
      expect(all.map((m) => [m.id, m.isActive, m.hasValues])).toEqual([
        [metric.id, false, true],
        [keep.id, true, false],
      ]);
      expect(await dbStoredValues(metric.id)).toHaveLength(1);
    });

    test("on again shows it back in its old place", async () => {
      const { type, metric } = await weight();
      const second = await makeMetric(type.id, { name: "Second" });
      await update(metric.id, { isActive: false });
      expectOk(await update(metric.id, { isActive: true }));
      expect(
        idsOf(typesOf(await api.get(PATH.types))[0]?.metrics ?? []),
      ).toEqual([metric.id, second.id]);
    });

    test("turning one measurement off does not touch the others", async () => {
      const { type, metric } = await weight();
      const other = await makeMetric(type.id, { name: "Other" });
      await update(metric.id, { isActive: false });
      expect((await dbMetric(other.id)).isActive).toBe(true);
    });

    test("there is no DELETE for a measurement: it stays", async () => {
      const { type, metric } = await weight();
      const reply = await api.delete(PATH.metric(metric.id));
      expect([404, 405]).toContain(reply.status);
      expect(await dbMetricCount(type.id)).toBe(1);
    });
  });

  describe("the measurement id", () => {
    test("an unknown measurement is 404 NOT_FOUND", async () => {
      expectError(
        await update(UNKNOWN_ID, { name: "Nobody" }),
        404,
        "NOT_FOUND",
      );
    });

    test("an id that is not a uuid is 400 VALIDATION_ERROR", async () => {
      expectInvalid(await update("not-an-id", { name: "Nobody" }));
    });

    test("a bad body is 400 even when the measurement does not exist", async () => {
      expectInvalid(await update(UNKNOWN_ID, { decimals: 9 }), "decimals");
    });

    test("an unknown measurement wins over a pair that would be broken by the stored values (404 first)", async () => {
      expectError(
        await update(UNKNOWN_ID, { intervalCount: 3 }),
        404,
        "NOT_FOUND",
      );
    });
  });
});

// ---------------------------------------------------------------------------

describe("E15 order the measurements of an assessment", () => {
  async function four() {
    const type = await makeType({ name: T("Fit") });
    const a = await makeMetric(type.id, { name: "5K run", sortOrder: 1 });
    const b = await makeMetric(type.id, { name: "Fran", sortOrder: 2 });
    const c = await makeMetric(type.id, { name: "Plank", sortOrder: 3 });
    const d = await makeMetric(type.id, { name: "Push-ups", sortOrder: 4 });
    return { type, a, b, c, d };
  }

  test("BR-REC-67 Move Fran above 5K: the answer is {}, E09 lists Fran first, sortOrder 1..n in that order", async () => {
    const { type, a, b, c, d } = await four();
    const reply = await api.put(PATH.typeMetricOrder(type.id), {
      body: { metricIds: [b.id, a.id, c.id, d.id] },
    });
    expectOk(reply);
    expect(reply.body?.data).toEqual({});
    expect(idsOf(typesOf(await api.get(PATH.types))[0]?.metrics ?? [])).toEqual(
      [b.id, a.id, c.id, d.id],
    );
    expect(
      (await dbMetricsInOrder(type.id)).map((m) => [m.id, m.sortOrder]),
    ).toEqual([
      [b.id, 1],
      [a.id, 2],
      [c.id, 3],
      [d.id, 4],
    ]);
  });

  test("BR-REC-67 sortOrder values become exactly 1..n even when they had gaps", async () => {
    const type = await makeType({ name: T("Fit") });
    const a = await makeMetric(type.id, { name: "A", sortOrder: 10 });
    const b = await makeMetric(type.id, { name: "B", sortOrder: 40 });
    const c = await makeMetric(type.id, { name: "C", sortOrder: 41 });
    expectOk(
      await api.put(PATH.typeMetricOrder(type.id), {
        body: { metricIds: [c.id, b.id, a.id] },
      }),
    );
    expect((await dbMetricsInOrder(type.id)).map((m) => m.sortOrder)).toEqual([
      1, 2, 3,
    ]);
  });

  test("C7 the list covers every measurement, on and off; an off one keeps its place and the default list leaves it out", async () => {
    const type = await makeType({ name: T("Fit") });
    const a = await makeMetric(type.id, { name: "A", sortOrder: 1 });
    const off = await makeMetric(type.id, {
      name: "B (off)",
      sortOrder: 2,
      isActive: false,
    });
    const c = await makeMetric(type.id, { name: "C", sortOrder: 3 });
    expectOk(
      await api.put(PATH.typeMetricOrder(type.id), {
        body: { metricIds: [off.id, c.id, a.id] },
      }),
    );
    expect(idsOf(await catalogMetrics(type.id))).toEqual([off.id, c.id, a.id]);
    expect(idsOf(typesOf(await api.get(PATH.types))[0]?.metrics ?? [])).toEqual(
      [c.id, a.id],
    );
  });

  test("BR-REC-67 another assessment's measurements keep their order", async () => {
    const { type, a, b, c, d } = await four();
    const other = await makeType({ name: T("Other") });
    const o1 = await makeMetric(other.id, { name: "O1", sortOrder: 10 });
    const o2 = await makeMetric(other.id, { name: "O2", sortOrder: 20 });
    expectOk(
      await api.put(PATH.typeMetricOrder(type.id), {
        body: { metricIds: [d.id, c.id, b.id, a.id] },
      }),
    );
    expect(
      (await dbMetricsInOrder(other.id)).map((m) => [m.id, m.sortOrder]),
    ).toEqual([
      [o1.id, 10],
      [o2.id, 20],
    ]);
  });

  test("BR-REC-67 an assessment with one measurement takes a list of one", async () => {
    const type = await makeType({ name: T("Fit") });
    const only = await makeMetric(type.id, { name: "Only", sortOrder: 6 });
    expectOk(
      await api.put(PATH.typeMetricOrder(type.id), {
        body: { metricIds: [only.id] },
      }),
    );
    expect((await dbMetric(only.id)).sortOrder).toBe(1);
  });

  describe("C7 a list that is not every measurement of the assessment once is 400 VALIDATION_ERROR and changes nothing", () => {
    async function expectRefused(
      build: (ids: {
        a: string;
        b: string;
        c: string;
        d: string;
        foreign: string;
      }) => unknown,
      path?: string,
    ) {
      const { type, a, b, c, d } = await four();
      const other = await makeType({ name: T("Other") });
      const foreign = await makeMetric(other.id, { name: "Foreign" });
      const reply = await api.put(PATH.typeMetricOrder(type.id), {
        body: {
          metricIds: build({
            a: a.id,
            b: b.id,
            c: c.id,
            d: d.id,
            foreign: foreign.id,
          }),
        },
      });
      expectInvalid(reply, path);
      expect(
        (await dbMetricsInOrder(type.id)).map((m) => [m.id, m.sortOrder]),
      ).toEqual([
        [a.id, 1],
        [b.id, 2],
        [c.id, 3],
        [d.id, 4],
      ]);
    }

    test("a missing measurement", () => expectRefused((x) => [x.d, x.c, x.b]));
    test("a missing measurement that is off", async () => {
      const type = await makeType({ name: T("Fit") });
      const a = await makeMetric(type.id, { name: "A", sortOrder: 1 });
      const off = await makeMetric(type.id, {
        name: "Off",
        sortOrder: 2,
        isActive: false,
      });
      expectInvalid(
        await api.put(PATH.typeMetricOrder(type.id), {
          body: { metricIds: [a.id] },
        }),
      );
      expect((await dbMetric(off.id)).sortOrder).toBe(2);
    });
    test("an extra id nobody has", () =>
      expectRefused((x) => [x.a, x.b, x.c, x.d, UNKNOWN_ID]));
    test("a measurement of another assessment instead of one of this", () =>
      expectRefused((x) => [x.a, x.b, x.c, x.foreign]));
    test("a measurement of another assessment in addition", () =>
      expectRefused((x) => [x.a, x.b, x.c, x.d, x.foreign]));
    test("an id twice", () =>
      expectRefused((x) => [x.a, x.b, x.c, x.d, x.a], "metricIds"));
    test("an id twice, once in upper case", () =>
      expectRefused(
        (x) => [x.a.toUpperCase(), x.b, x.c, x.d, x.a.toLowerCase()],
        "metricIds",
      ));
    test("an empty list", () => expectRefused(() => [], "metricIds"));
    test("an id that is not a uuid", () =>
      expectRefused((x) => [x.a, x.b, x.c, "not-an-id"], "metricIds"));
    test("metricIds that is not a list", () =>
      expectRefused(() => "everything", "metricIds"));
  });

  test("BR-REC-154 an unknown assessment with a well-formed body is 404 NOT_FOUND", async () => {
    expectError(
      await api.put(PATH.typeMetricOrder(UNKNOWN_ID), {
        body: { metricIds: [OTHER_UNKNOWN_ID] },
      }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-154 an assessment id that is not a uuid is 400 VALIDATION_ERROR", async () => {
    expectInvalid(
      await api.put(PATH.typeMetricOrder("not-an-id"), {
        body: { metricIds: [UNKNOWN_ID] },
      }),
    );
  });

  test("BR-REC-154 a bad body is 400 even when the assessment does not exist", async () => {
    expectInvalid(
      await api.put(PATH.typeMetricOrder(UNKNOWN_ID), {
        body: { metricIds: [] },
      }),
      "metricIds",
    );
  });

  test("BR-REC-154 a body without metricIds is 400 VALIDATION_ERROR", async () => {
    const { type } = await four();
    expectInvalid(
      await api.put(PATH.typeMetricOrder(type.id), { body: {} }),
      "metricIds",
    );
  });

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    const { type } = await four();
    expectError(
      await api.put(PATH.typeMetricOrder(type.id), { rawBody: "[" }),
      400,
      "INVALID_JSON",
    );
  });
});

describe("writes at the same time (BR-REC-62, BR-REC-67, C7)", () => {
  test("BR-REC-62 two requests adding the same name (other letter case) to one assessment at once: one is created, the other is 409 NAME_TAKEN, never an error", async () => {
    const type = await makeType({ name: T("Fit") });
    const replies = await Promise.all([
      create(type.id, createBody({ name: "Burpees" })),
      create(type.id, createBody({ name: "BURPEES" })),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
    expect(replies.find((reply) => reply.status === 409)?.body?.code).toBe(
      "NAME_TAKEN",
    );
    expect(await dbMetricCount(type.id)).toBe(1);
  });

  test("BR-REC-62 two renames to the same name at once: one wins, the other is 409 NAME_TAKEN", async () => {
    const type = await makeType({ name: T("Fit") });
    const a = await makeMetric(type.id, { name: "Alpha" });
    const b = await makeMetric(type.id, { name: "Beta" });
    const replies = await Promise.all([
      update(a.id, { name: "Target" }),
      update(b.id, { name: "TARGET" }),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409]);
    expect(replies.find((reply) => reply.status === 409)?.body?.code).toBe(
      "NAME_TAKEN",
    );
  });

  test("C7 measurements added at the same time all get their own place in the order", async () => {
    const type = await makeType({ name: T("Fit") });
    const replies = await Promise.all(
      ["one", "two", "three", "four", "five"].map((name) =>
        create(type.id, createBody({ name: `Parallel ${name}` })),
      ),
    );
    for (const reply of replies) expectOk(reply, 201);
    const orders = (await dbMetricsInOrder(type.id)).map((m) => m.sortOrder);
    expect(orders).toHaveLength(5);
    expect(new Set(orders).size).toBe(5);
  });
});
