import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { seed } from "../../scripts/seed";
import { db } from "../../src/db/client";
import { gymSettings, loginAttempts } from "../../src/db/schemas";
import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  addValue,
  api,
  assertCatalogOnlyOurs,
  cleanupAll,
  dbMetric,
  dbType,
  dbTypeCount,
  dbTypesInOrder,
  expectError,
  expectInvalid,
  expectOk,
  METRIC_KEYS,
  makeMetric,
  makeType,
  metaOf,
  PATH,
  snapshotSingletons,
  TYPE_KEYS,
  type TypeOut,
  typeOf,
  typesOf,
  UUID_SHAPE,
  wipeCatalog,
} from "./helpers";

// member-records/setup E09 (catalog), E10 (add assessment), E11 (change / turn off), E12 (order):
// BR-REC-10, 13 (intervals), 61 (name and repeat limits), 66 (never deleted, off hides),
// 67 (order), 70 (interval change at once), 72 (ETag / 304), C5-C7.

let restoreSingletons: () => Promise<void>;

beforeAll(async () => {
  restoreSingletons = await snapshotSingletons();
  await assertCatalogOnlyOurs();
});
beforeEach(wipeCatalog);
afterAll(async () => {
  await cleanupAll();
  await restoreSingletons();
});

const T = (suffix: string) => `TEST_setup_${suffix}`;
const idsOf = (list: { id: string }[]) => list.map((item) => item.id);
const etagOf = (headers: Headers) => headers.get("etag") ?? "";
const newType = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  intervalCount: 1,
  intervalUnit: "month",
  ...extra,
});

/** Seeds the real catalog (Body composition, Fitness test) into the empty test catalog. */
async function seedCatalog() {
  await wipeCatalog();
  await db.delete(gymSettings);
  await db.delete(loginAttempts);
  await seed();
}

describe("E09 the assessment catalog", () => {
  test("BR-REC-13 after the seed: Body composition every 1 month, then Fitness test every 2 months", async () => {
    await seedCatalog();
    const reply = await api.get(PATH.types);
    expectOk(reply);
    const types = typesOf(reply);
    expect(types.map((t) => t.name)).toEqual([
      "Body composition",
      "Fitness test",
    ]);
    expect(types[0]).toMatchObject({
      intervalCount: 1,
      intervalUnit: "month",
      sortOrder: 1,
      isActive: true,
      hasValues: false,
    });
    expect(types[1]).toMatchObject({
      intervalCount: 2,
      intervalUnit: "month",
      sortOrder: 2,
      isActive: true,
      hasValues: false,
    });
    expect(reply.body?.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
      totalPages: 1,
    });
  });

  test("BR-REC-10 after the seed each assessment lists its measurements in the paper-form order", async () => {
    await seedCatalog();
    const types = typesOf(await api.get(PATH.types));
    const [body, fitness] = types as [TypeOut, TypeOut];
    expect(body.metrics).toHaveLength(15);
    expect(fitness.metrics).toHaveLength(14);
    for (const type of types) {
      const orders = type.metrics.map((m) => m.sortOrder);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size).toBe(orders.length);
    }
    expect(body.metrics[0]?.name).toBe("Height");
    expect(fitness.metrics[0]?.name).toBe("Push-ups");
  });

  test("BR-REC-10 / 63 / 153 after the seed Height has no direction and Fran is a duration with its check range in seconds", async () => {
    await seedCatalog();
    const [body, fitness] = typesOf(await api.get(PATH.types)) as [
      TypeOut,
      TypeOut,
    ];
    const height = body.metrics.find((m) => m.name === "Height");
    expect(height).toMatchObject({
      better: "none",
      datatype: "number",
      unit: "cm",
      plausibleMin: 120,
      plausibleMax: 220,
    });
    const fran = fitness.metrics.find((m) => m.name === "Fran");
    expect(fran).toMatchObject({
      datatype: "duration",
      better: "lower",
      plausibleMin: 90,
      plausibleMax: 1800,
      isActive: true,
      hasValues: false,
    });
    expect(typeof fran?.plausibleMin).toBe("number");
  });

  test("BR-REC-65 after the seed the 8 segmental measurements show a report-table group and part", async () => {
    await seedCatalog();
    const types = typesOf(await api.get(PATH.types));
    const placed = types.flatMap((type) =>
      type.metrics
        .filter((m) => m.tableGroup !== null || m.tablePart !== null)
        .map((m) => ({ type: type.name, ...m })),
    );
    expect(placed).toHaveLength(8);
    for (const metric of placed) {
      expect(metric.type).toBe("Body composition");
      expect(metric.tableGroup).not.toBeNull();
      expect(["whole_body", "arms", "trunk", "legs"]).toContain(
        metric.tablePart as string,
      );
    }
  });

  test("BR-REC-153 an assessment and its measurements have exactly the contract fields, numbers as JSON numbers", async () => {
    const type = await makeType({ name: T("shape") });
    await makeMetric(type.id, {
      name: "Weight",
      unit: "kg",
      decimals: 1,
      better: "lower",
      plausibleMin: 30.5,
      plausibleMax: 250,
    });
    const reply = await api.get(PATH.types);
    const [listed] = typesOf(reply) as [TypeOut];
    expect(Object.keys(listed).sort()).toEqual(TYPE_KEYS);
    const [metric] = listed.metrics;
    expect(Object.keys(metric ?? {}).sort()).toEqual(METRIC_KEYS);
    expect(metric?.id).toMatch(UUID_SHAPE);
    expect(metric?.plausibleMin).toBe(30.5);
    expect(metric?.plausibleMax).toBe(250);
    expect(typeof metric?.decimals).toBe("number");
    expect(typeof metric?.sortOrder).toBe("number");
    expect(typeof listed.intervalCount).toBe("number");
  });

  test("BR-REC-67 assessments come in setup order (sortOrder), their measurements likewise, whatever the names", async () => {
    const third = await makeType({ name: T("aaa third"), sortOrder: 30 });
    const first = await makeType({ name: T("zzz first"), sortOrder: 10 });
    const second = await makeType({ name: T("mmm second"), sortOrder: 20 });
    const c = await makeMetric(first.id, { name: "C metric", sortOrder: 3 });
    const a = await makeMetric(first.id, { name: "Z metric", sortOrder: 1 });
    const b = await makeMetric(first.id, { name: "A metric", sortOrder: 2 });

    const types = typesOf(await api.get(PATH.types));
    expect(idsOf(types)).toEqual([first.id, second.id, third.id]);
    expect(idsOf(types[0]?.metrics ?? [])).toEqual([a.id, b.id, c.id]);
  });

  test("BR-REC-66 without includeInactive, off assessments (with all their measurements) and off measurements are left out", async () => {
    const on = await makeType({ name: T("on") });
    await makeType({ name: T("off"), isActive: false });
    const shown = await makeMetric(on.id, { name: "Shown" });
    await makeMetric(on.id, { name: "Hidden", isActive: false });

    for (const query of ["", "?includeInactive=false"]) {
      const reply = await api.get(`${PATH.types}${query}`);
      expectOk(reply);
      const types = typesOf(reply);
      expect(idsOf(types)).toEqual([on.id]);
      expect(idsOf(types[0]?.metrics ?? [])).toEqual([shown.id]);
      expect(metaOf(reply).total).toBe(1);
    }
  });

  test("BR-REC-66 with includeInactive=true everything comes back, each with its own isActive", async () => {
    const on = await makeType({ name: T("on"), sortOrder: 1 });
    const off = await makeType({
      name: T("off"),
      isActive: false,
      sortOrder: 2,
    });
    const shown = await makeMetric(on.id, { name: "Shown", isActive: true });
    const hidden = await makeMetric(on.id, { name: "Hidden", isActive: false });
    const insideOff = await makeMetric(off.id, {
      name: "Inside off",
      isActive: true,
    });

    const reply = await api.get(`${PATH.types}?includeInactive=true`);
    expectOk(reply);
    const types = typesOf(reply);
    expect(types.map((t) => [t.id, t.isActive])).toEqual([
      [on.id, true],
      [off.id, false],
    ]);
    expect(types[0]?.metrics.map((m) => [m.id, m.isActive])).toEqual([
      [shown.id, true],
      [hidden.id, false],
    ]);
    expect(types[1]?.metrics.map((m) => [m.id, m.isActive])).toEqual([
      [insideOff.id, true],
    ]);
    expect(metaOf(reply).total).toBe(2);
  });

  test("C5 turning an assessment off hides its measurements without changing their own On/Off", async () => {
    const type = await makeType({ name: T("c5") });
    const live = await makeMetric(type.id, { name: "Live", isActive: true });
    const dead = await makeMetric(type.id, { name: "Dead", isActive: false });

    expectOk(
      await api.patch(PATH.type(type.id), { body: { isActive: false } }),
    );
    expect(typesOf(await api.get(PATH.types))).toEqual([]);

    const all = typesOf(await api.get(`${PATH.types}?includeInactive=true`));
    expect(all).toHaveLength(1);
    expect(all[0]?.isActive).toBe(false);
    expect(all[0]?.metrics.map((m) => [m.id, m.isActive])).toEqual([
      [live.id, true],
      [dead.id, false],
    ]);
    expect((await dbMetric(live.id)).isActive).toBe(true);
    expect((await dbMetric(dead.id)).isActive).toBe(false);

    expectOk(await api.patch(PATH.type(type.id), { body: { isActive: true } }));
    const back = typesOf(await api.get(PATH.types));
    expect(back).toHaveLength(1);
    expect(idsOf(back[0]?.metrics ?? [])).toEqual([live.id]);
  });

  test("BR-REC-155 pages: pageSize 2 over 3 assessments gives 2 then 1, with the meta", async () => {
    const a = await makeType({ name: T("a"), sortOrder: 1 });
    const b = await makeType({ name: T("b"), sortOrder: 2 });
    const c = await makeType({ name: T("c"), sortOrder: 3 });

    const first = await api.get(`${PATH.types}?page=1&pageSize=2`);
    expect(idsOf(typesOf(first))).toEqual([a.id, b.id]);
    expect(first.body?.meta).toEqual({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    const second = await api.get(`${PATH.types}?page=2&pageSize=2`);
    expect(idsOf(typesOf(second))).toEqual([c.id]);
    expect(second.body?.meta).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  test("BR-REC-155 meta.total counts the assessments after the includeInactive filter", async () => {
    await makeType({ name: T("on 1") });
    await makeType({ name: T("on 2") });
    await makeType({ name: T("off 1"), isActive: false });
    const filtered = await api.get(PATH.types);
    expect(metaOf(filtered).total).toBe(2);
    const everything = await api.get(`${PATH.types}?includeInactive=true`);
    expect(metaOf(everything).total).toBe(3);
  });

  for (const text of ["yes", "1", "TRUE", ""]) {
    test(`BR-REC-154 includeInactive="${text}" is 400 VALIDATION_ERROR`, async () => {
      expectInvalid(
        await api.get(`${PATH.types}?includeInactive=${text}`),
        "includeInactive",
      );
    });
  }

  test("C6 hasValues: an assessment is true when any of its measurements, on or off, has a stored value; a measurement when it has one", async () => {
    const withValue = await makeType({ name: T("with value"), sortOrder: 1 });
    const onlyOff = await makeType({ name: T("only off"), sortOrder: 2 });
    const empty = await makeType({ name: T("empty"), sortOrder: 3 });
    const filled = await makeMetric(withValue.id, { name: "Filled" });
    const blank = await makeMetric(withValue.id, { name: "Blank" });
    const offFilled = await makeMetric(onlyOff.id, {
      name: "Off filled",
      isActive: false,
    });
    await addValue(filled.id, 42);
    await addValue(offFilled.id, 7);

    const types = typesOf(await api.get(`${PATH.types}?includeInactive=true`));
    const by = new Map(types.map((t) => [t.id, t]));
    expect(by.get(withValue.id)?.hasValues).toBe(true);
    expect(by.get(onlyOff.id)?.hasValues).toBe(true);
    expect(by.get(empty.id)?.hasValues).toBe(false);
    const metricFlag = (typeId: string, metricId: string) =>
      by.get(typeId)?.metrics.find((m) => m.id === metricId)?.hasValues;
    expect(metricFlag(withValue.id, filled.id)).toBe(true);
    expect(metricFlag(withValue.id, blank.id)).toBe(false);
    expect(metricFlag(onlyOff.id, offFilled.id)).toBe(true);
  });

  test("BR-REC-159 E09 without a sign-in is 401 UNAUTHORIZED", async () => {
    expectError(
      await api.get(PATH.types, { token: null }),
      401,
      "UNAUTHORIZED",
    );
  });

  test("BR-REC-161 E09 is not cached by the browser or a proxy and carries Server-Timing", async () => {
    await makeType({ name: T("headers") });
    const reply = await api.get(PATH.types);
    const cacheControl = reply.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-store");
    const timing = reply.headers.get("server-timing") ?? "";
    expect(timing).toContain("db");
    expect(timing).toContain("total");
  });
});

describe("E09 revalidation with the ETag (BR-REC-72, BR-REC-160)", () => {
  test("BR-REC-160 E09 sends a quoted ETag; the same data gives the same one", async () => {
    await makeType({ name: T("etag") });
    const first = await api.get(PATH.types);
    const second = await api.get(PATH.types);
    expect(etagOf(first.headers)).toMatch(/^(W\/)?"[^"]+"$/);
    expect(etagOf(second.headers)).toBe(etagOf(first.headers));
  });

  test("BR-REC-72 nothing changed: a matching If-None-Match gets 304 and no body", async () => {
    await makeType({ name: T("etag") });
    const first = await api.get(PATH.types);
    const second = await api.get(PATH.types, {
      headers: { "If-None-Match": etagOf(first.headers) },
    });
    expect(second.status).toBe(304);
    expect(await second.res.text()).toBe("");
  });

  test("BR-REC-72 Coach adds Burpees on the tablet: the phone's next request with its old tag gets 200 and Burpees", async () => {
    const type = await makeType({ name: T("burpees") });
    const phone = await api.get(PATH.types);

    const added = await api.post(PATH.typeMetrics(type.id), {
      body: {
        name: "Burpees 1 min",
        datatype: "number",
        unit: "count",
        decimals: 0,
        better: "higher",
      },
    });
    expectOk(added, 201);

    const next = await api.get(PATH.types, {
      headers: { "If-None-Match": etagOf(phone.headers) },
    });
    expect(next.status).toBe(200);
    expect(typesOf(next)[0]?.metrics.map((m) => m.name)).toEqual([
      "Burpees 1 min",
    ]);
    expect(etagOf(next.headers)).not.toBe(etagOf(phone.headers));
  });

  test("BR-REC-72 a new assessment, a rename, an interval change, turning one off and a new order each change the tag", async () => {
    const a = await makeType({ name: T("a") });
    const b = await makeType({ name: T("b") });
    const everything = `${PATH.types}?includeInactive=true`;
    let tag = etagOf((await api.get(everything)).headers);
    const changes: [string, () => Promise<unknown>][] = [
      ["new assessment", () => api.post(PATH.types, { body: newType(T("c")) })],
      [
        "rename",
        () => api.patch(PATH.type(a.id), { body: { name: T("a renamed") } }),
      ],
      [
        "interval",
        () => api.patch(PATH.type(a.id), { body: { intervalCount: 5 } }),
      ],
      [
        "turn off",
        () => api.patch(PATH.type(b.id), { body: { isActive: false } }),
      ],
      [
        "new order",
        async () => {
          const ids = idsOf(typesOf(await api.get(everything)));
          return api.put(PATH.typeOrder, {
            body: { typeIds: [...ids].reverse() },
          });
        },
      ],
    ];
    for (const [label, change] of changes) {
      await change();
      const reply = await api.get(everything, {
        headers: { "If-None-Match": tag },
      });
      expect(reply.status, label).toBe(200);
      expect(etagOf(reply.headers), label).not.toBe(tag);
      tag = etagOf(reply.headers);
    }
  });

  test("BR-REC-72 the default list and the includeInactive=true list have their own tags: one never answers 304 for the other", async () => {
    await makeType({ name: T("on") });
    await makeType({ name: T("off"), isActive: false });
    const normal = await api.get(PATH.types);
    const everything = await api.get(`${PATH.types}?includeInactive=true`);
    expect(typesOf(normal)).toHaveLength(1);
    expect(typesOf(everything)).toHaveLength(2);
    expect(etagOf(normal.headers)).not.toBe(etagOf(everything.headers));

    const crossed = await api.get(`${PATH.types}?includeInactive=true`, {
      headers: { "If-None-Match": etagOf(normal.headers) },
    });
    expect(crossed.status).toBe(200);
    expect(typesOf(crossed)).toHaveLength(2);
  });

  test("BR-REC-72 a measurement's rename, order or On/Off reaches the next form (200, not 304)", async () => {
    const type = await makeType({ name: T("form") });
    const first = await makeMetric(type.id, { name: "First" });
    const second = await makeMetric(type.id, { name: "Second" });
    let tag = etagOf((await api.get(PATH.types)).headers);
    const changes: [string, () => Promise<unknown>][] = [
      [
        "rename",
        () =>
          api.patch(PATH.metric(first.id), { body: { name: "First renamed" } }),
      ],
      [
        "order",
        () =>
          api.put(PATH.typeMetricOrder(type.id), {
            body: { metricIds: [second.id, first.id] },
          }),
      ],
      [
        "off",
        () => api.patch(PATH.metric(second.id), { body: { isActive: false } }),
      ],
    ];
    for (const [label, change] of changes) {
      await change();
      const reply = await api.get(PATH.types, {
        headers: { "If-None-Match": tag },
      });
      expect(reply.status, label).toBe(200);
      tag = etagOf(reply.headers);
    }
  });
});

describe("E10 add an assessment", () => {
  test("BR-REC-10 / C7 201: the new assessment is On, empty, without values and carries what was sent", async () => {
    const reply = await api.post(PATH.types, {
      body: { name: T("Strength"), intervalCount: 3, intervalUnit: "week" },
    });
    expectOk(reply, 201);
    const created = typeOf(reply);
    expect(Object.keys(created).sort()).toEqual(TYPE_KEYS);
    expect(created).toMatchObject({
      name: T("Strength"),
      intervalCount: 3,
      intervalUnit: "week",
      isActive: true,
      hasValues: false,
      metrics: [],
    });
    expect(created.id).toMatch(UUID_SHAPE);
  });

  test("BR-REC-10 the new assessment is stored and shows in E09", async () => {
    const created = typeOf(
      await api.post(PATH.types, {
        body: newType(T("Stored"), { intervalCount: 4 }),
      }),
    );
    const row = await dbType(created.id);
    expect(row).toMatchObject({
      name: T("Stored"),
      intervalCount: 4,
      intervalUnit: "month",
      isActive: true,
    });
    expect(idsOf(typesOf(await api.get(PATH.types)))).toContain(created.id);
  });

  test("C7 the new assessment is added last: its sortOrder is above every other, off ones included", async () => {
    await makeType({ name: T("one"), sortOrder: 5 });
    await makeType({ name: T("off"), sortOrder: 9, isActive: false });
    await makeType({ name: T("two"), sortOrder: 3 });
    const created = typeOf(
      await api.post(PATH.types, { body: newType(T("last")) }),
    );
    expect(created.sortOrder).toBeGreaterThan(9);
    const ordered = await dbTypesInOrder();
    expect(ordered[ordered.length - 1]?.id).toBe(created.id);
  });

  test("C7 after the seed the new assessment comes after Fitness test", async () => {
    await seedCatalog();
    const created = typeOf(
      await api.post(PATH.types, { body: newType(T("third")) }),
    );
    expect(created.sortOrder).toBeGreaterThan(2);
    const names = typesOf(await api.get(PATH.types)).map((t) => t.name);
    expect(names).toEqual(["Body composition", "Fitness test", T("third")]);
  });

  test("C7 a sortOrder or isActive in the body does not decide anything: the assessment is still added last and On", async () => {
    await makeType({ name: T("existing"), sortOrder: 4 });
    const reply = await api.post(PATH.types, {
      body: newType(T("pushy"), { sortOrder: 0, isActive: false }),
    });
    expectOk(reply, 201);
    expect(typeOf(reply).isActive).toBe(true);
    expect(typeOf(reply).sortOrder).toBeGreaterThan(4);
  });

  test("C2 the name is trimmed before it is checked and saved", async () => {
    const reply = await api.post(PATH.types, {
      body: newType(`   ${T("Trimmed")}   `),
    });
    expectOk(reply, 201);
    expect(typeOf(reply).name).toBe(T("Trimmed"));
    expect((await dbType(typeOf(reply).id)).name).toBe(T("Trimmed"));
  });

  describe("BR-REC-61 the name is 2 to 40 characters and the repeat is 1 to 24 weeks or months", () => {
    for (const name of ["ab", "x".repeat(40), "  ab  "]) {
      test(`BR-REC-61 name "${name.trim().slice(0, 8)}" of ${name.trim().length} characters is accepted`, async () => {
        expectOk(await api.post(PATH.types, { body: newType(name) }), 201);
      });
    }

    const badNames: [string, unknown][] = [
      ["empty", ""],
      ["1 character", "a"],
      ["only spaces", "      "],
      ["1 character between spaces", "  a  "],
      ["41 characters", "x".repeat(41)],
      ["a number", 42],
      ["null", null],
    ];
    for (const [label, name] of badNames) {
      test(`BR-REC-61 a name that is ${label} is 400 VALIDATION_ERROR on name and creates nothing`, async () => {
        const reply = await api.post(PATH.types, {
          body: newType(name as string),
        });
        expectInvalid(reply, "name");
        expect(await dbTypeCount()).toBe(0);
      });
    }

    for (const count of [1, 2, 12, 24]) {
      for (const unit of ["week", "month"]) {
        test(`BR-REC-61 every ${count} ${unit}(s) is accepted`, async () => {
          const reply = await api.post(PATH.types, {
            body: newType(T(`rep ${count} ${unit}`), {
              intervalCount: count,
              intervalUnit: unit,
            }),
          });
          expectOk(reply, 201);
          expect(typeOf(reply)).toMatchObject({
            intervalCount: count,
            intervalUnit: unit,
          });
        });
      }
    }

    for (const count of [0, -1, 25, 100, 1.5, "3", null]) {
      test(`BR-REC-61 a repeat count of ${JSON.stringify(count)} is 400 VALIDATION_ERROR on intervalCount`, async () => {
        const reply = await api.post(PATH.types, {
          body: newType(T("bad count"), { intervalCount: count }),
        });
        expectInvalid(reply, "intervalCount");
        expect(await dbTypeCount()).toBe(0);
      });
    }

    test('BR-REC-61 a repeat count of 25 says "Use 1 to 24"', async () => {
      expectInvalid(
        await api.post(PATH.types, {
          body: newType(T("bad count"), { intervalCount: 25 }),
        }),
        "intervalCount",
        "Use 1 to 24",
      );
    });

    for (const unit of ["day", "year", "", "Month", null]) {
      test(`BR-REC-61 a repeat unit of ${JSON.stringify(unit)} is 400 VALIDATION_ERROR on intervalUnit`, async () => {
        const reply = await api.post(PATH.types, {
          body: newType(T("bad unit"), { intervalUnit: unit }),
        });
        expectInvalid(reply, "intervalUnit");
        expect(await dbTypeCount()).toBe(0);
      });
    }

    for (const missing of ["name", "intervalCount", "intervalUnit"]) {
      test(`BR-REC-61 a body without ${missing} is 400 VALIDATION_ERROR on ${missing}`, async () => {
        const body: Record<string, unknown> = newType(T("missing"));
        delete body[missing];
        const reply = await api.post(PATH.types, { body });
        expectInvalid(reply, missing);
        expect(await dbTypeCount()).toBe(0);
      });
    }
  });

  describe("BR-REC-61 the name is unique ignoring case", () => {
    test('BR-REC-61 a second "body composition" is 409 NAME_TAKEN and creates nothing', async () => {
      await makeType({ name: "Body composition" });
      const reply = await api.post(PATH.types, {
        body: newType("body composition"),
      });
      expectError(reply, 409, "NAME_TAKEN");
      expect(await dbTypeCount()).toBe(1);
    });

    test("BR-REC-61 the same name in other letter case is taken (upper case)", async () => {
      await makeType({ name: T("Strength") });
      expectError(
        await api.post(PATH.types, { body: newType(T("STRENGTH")) }),
        409,
        "NAME_TAKEN",
      );
    });

    test("BR-REC-61 the exact same name is taken", async () => {
      await makeType({ name: T("Same") });
      expectError(
        await api.post(PATH.types, { body: newType(T("Same")) }),
        409,
        "NAME_TAKEN",
      );
    });

    test("C2 the names are compared after trimming", async () => {
      await makeType({ name: T("Padded") });
      expectError(
        await api.post(PATH.types, { body: newType(`  ${T("Padded")}  `) }),
        409,
        "NAME_TAKEN",
      );
    });

    test("BR-REC-66 an assessment that is off still holds its name", async () => {
      await makeType({ name: T("Retired"), isActive: false });
      expectError(
        await api.post(PATH.types, { body: newType(T("retired")) }),
        409,
        "NAME_TAKEN",
      );
    });

    test("BR-REC-61 NAME_TAKEN answers the error envelope", async () => {
      await makeType({ name: T("Envelope") });
      const reply = await api.post(PATH.types, {
        body: newType(T("envelope")),
      });
      expect(reply.body).toMatchObject({
        success: false,
        code: "NAME_TAKEN",
        message: expect.any(String),
      });
    });
  });

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    expectError(
      await api.post(PATH.types, { rawBody: "{not json" }),
      400,
      "INVALID_JSON",
    );
  });

  test("BR-REC-66 there is no DELETE for an assessment: it stays", async () => {
    const type = await makeType({ name: T("keep") });
    const reply = await api.delete(PATH.type(type.id));
    expect([404, 405]).toContain(reply.status);
    expect(await dbTypeCount()).toBe(1);
  });
});

describe("E11 change or turn off an assessment", () => {
  test("BR-REC-61 a rename changes the name only", async () => {
    const type = await makeType({
      name: T("Old name"),
      intervalCount: 2,
      intervalUnit: "week",
    });
    const reply = await api.patch(PATH.type(type.id), {
      body: { name: T("New name") },
    });
    expectOk(reply);
    expect(typeOf(reply)).toMatchObject({
      id: type.id,
      name: T("New name"),
      intervalCount: 2,
      intervalUnit: "week",
      isActive: true,
    });
    expect(await dbType(type.id)).toMatchObject({
      name: T("New name"),
      intervalCount: 2,
      intervalUnit: "week",
      isActive: true,
      sortOrder: type.sortOrder,
    });
  });

  test("BR-REC-70 an interval change is saved at once and the catalog shows it (Fitness test 2 -> 3 months)", async () => {
    const type = await makeType({
      name: T("Fitness"),
      intervalCount: 2,
      intervalUnit: "month",
    });
    const reply = await api.patch(PATH.type(type.id), {
      body: { intervalCount: 3 },
    });
    expectOk(reply);
    expect(typeOf(reply)).toMatchObject({
      name: T("Fitness"),
      intervalCount: 3,
      intervalUnit: "month",
    });
    expect(await dbType(type.id)).toMatchObject({
      intervalCount: 3,
      intervalUnit: "month",
    });
    const listed = typesOf(await api.get(PATH.types))[0];
    expect(listed).toMatchObject({ intervalCount: 3, intervalUnit: "month" });
  });

  test("BR-REC-13 the repeat unit can change from months to weeks", async () => {
    const type = await makeType({ name: T("Unit") });
    const reply = await api.patch(PATH.type(type.id), {
      body: { intervalCount: 6, intervalUnit: "week" },
    });
    expectOk(reply);
    expect(await dbType(type.id)).toMatchObject({
      intervalCount: 6,
      intervalUnit: "week",
    });
  });

  test("BR-REC-66 isActive false turns the assessment off, true turns it on again", async () => {
    const type = await makeType({ name: T("Toggle") });
    const off = await api.patch(PATH.type(type.id), {
      body: { isActive: false },
    });
    expectOk(off);
    expect(typeOf(off).isActive).toBe(false);
    expect((await dbType(type.id)).isActive).toBe(false);

    const on = await api.patch(PATH.type(type.id), {
      body: { isActive: true },
    });
    expectOk(on);
    expect(typeOf(on).isActive).toBe(true);
    expect(typeOf(on).name).toBe(T("Toggle"));
  });

  test("BR-REC-66 turning an assessment off keeps its place in the order", async () => {
    const first = await makeType({ name: T("first"), sortOrder: 1 });
    const second = await makeType({ name: T("second"), sortOrder: 2 });
    await api.patch(PATH.type(first.id), { body: { isActive: false } });
    expect((await dbType(first.id)).sortOrder).toBe(1);
    expect((await dbType(second.id)).sortOrder).toBe(2);
  });

  test("C5 the answer lists all of the assessment's measurements, on and off, in setup order, each with its own isActive", async () => {
    const type = await makeType({ name: T("Answer") });
    const a = await makeMetric(type.id, { name: "Z first", isActive: true });
    const b = await makeMetric(type.id, { name: "A second", isActive: false });
    const c = await makeMetric(type.id, { name: "M third", isActive: true });

    for (const body of [
      { name: T("Answer 2") },
      { isActive: false },
      { isActive: true },
    ]) {
      const reply = await api.patch(PATH.type(type.id), { body });
      expectOk(reply);
      expect(typeOf(reply).metrics.map((m) => [m.id, m.isActive])).toEqual([
        [a.id, true],
        [b.id, false],
        [c.id, true],
      ]);
    }
  });

  test("C6 the answer carries hasValues", async () => {
    const type = await makeType({ name: T("Values") });
    const metric = await makeMetric(type.id, { name: "Counted" });
    const before = await api.patch(PATH.type(type.id), {
      body: { name: T("Values 2") },
    });
    expect(typeOf(before).hasValues).toBe(false);
    await addValue(metric.id, 5);
    const after = await api.patch(PATH.type(type.id), {
      body: { name: T("Values 3") },
    });
    expect(typeOf(after).hasValues).toBe(true);
    expect(typeOf(after).metrics[0]?.hasValues).toBe(true);
  });

  test("C2 the name is trimmed", async () => {
    const type = await makeType({ name: T("Before") });
    const reply = await api.patch(PATH.type(type.id), {
      body: { name: `  ${T("After")}  ` },
    });
    expect(typeOf(reply).name).toBe(T("After"));
    expect((await dbType(type.id)).name).toBe(T("After"));
  });

  describe("BR-REC-61 NAME_TAKEN", () => {
    test("BR-REC-61 renaming to another assessment's name (other case) is 409 NAME_TAKEN and changes nothing", async () => {
      const a = await makeType({ name: T("Alpha") });
      await makeType({ name: T("Beta") });
      const reply = await api.patch(PATH.type(a.id), {
        body: { name: T("BETA"), intervalCount: 9 },
      });
      expectError(reply, 409, "NAME_TAKEN");
      expect(await dbType(a.id)).toMatchObject({
        name: T("Alpha"),
        intervalCount: 1,
      });
    });

    test("BR-REC-61 the name of an assessment that is off is taken too", async () => {
      const a = await makeType({ name: T("Alpha") });
      await makeType({ name: T("Retired"), isActive: false });
      expectError(
        await api.patch(PATH.type(a.id), { body: { name: T("retired") } }),
        409,
        "NAME_TAKEN",
      );
    });

    test("C2 the trimmed new name is what is compared", async () => {
      const a = await makeType({ name: T("Alpha") });
      await makeType({ name: T("Beta") });
      expectError(
        await api.patch(PATH.type(a.id), { body: { name: `  ${T("Beta")} ` } }),
        409,
        "NAME_TAKEN",
      );
    });

    test("BR-REC-61 keeping the assessment's own name is not a conflict", async () => {
      const a = await makeType({ name: T("Alpha") });
      expectOk(
        await api.patch(PATH.type(a.id), {
          body: { name: T("Alpha"), intervalCount: 4 },
        }),
      );
      expect((await dbType(a.id)).intervalCount).toBe(4);
    });

    test("BR-REC-61 only re-casing the assessment's own name is not a conflict", async () => {
      const a = await makeType({ name: T("Alpha") });
      const reply = await api.patch(PATH.type(a.id), {
        body: { name: T("ALPHA") },
      });
      expectOk(reply);
      expect(typeOf(reply).name).toBe(T("ALPHA"));
    });

    test("BR-REC-61 an assessment that is off can keep its own name too", async () => {
      const a = await makeType({ name: T("Retired"), isActive: false });
      expectOk(
        await api.patch(PATH.type(a.id), { body: { name: T("Retired") } }),
      );
    });
  });

  describe("request limits", () => {
    const setup = async () => makeType({ name: T("Limits") });

    for (const name of ["ab", "x".repeat(40)]) {
      test(`BR-REC-61 a name of ${name.length} characters is accepted`, async () => {
        const type = await setup();
        expectOk(await api.patch(PATH.type(type.id), { body: { name } }));
      });
    }

    for (const [label, name] of [
      ["empty", ""],
      ["1 character", "a"],
      ["only spaces", "     "],
      ["41 characters", "x".repeat(41)],
      ["null", null],
    ] as [string, unknown][]) {
      test(`BR-REC-61 a name that is ${label} is 400 VALIDATION_ERROR on name and changes nothing`, async () => {
        const type = await setup();
        expectInvalid(
          await api.patch(PATH.type(type.id), { body: { name } }),
          "name",
        );
        expect((await dbType(type.id)).name).toBe(T("Limits"));
      });
    }

    for (const count of [0, 25, 1.5, -3, null]) {
      test(`BR-REC-61 a repeat count of ${JSON.stringify(count)} is 400 VALIDATION_ERROR on intervalCount`, async () => {
        const type = await setup();
        expectInvalid(
          await api.patch(PATH.type(type.id), {
            body: { intervalCount: count },
          }),
          "intervalCount",
        );
        expect((await dbType(type.id)).intervalCount).toBe(1);
      });
    }

    for (const count of [1, 24]) {
      test(`BR-REC-61 a repeat count of ${count} is accepted`, async () => {
        const type = await setup();
        expectOk(
          await api.patch(PATH.type(type.id), {
            body: { intervalCount: count },
          }),
        );
      });
    }

    test("BR-REC-61 a repeat unit that is not week or month is 400 VALIDATION_ERROR on intervalUnit", async () => {
      const type = await setup();
      expectInvalid(
        await api.patch(PATH.type(type.id), { body: { intervalUnit: "day" } }),
        "intervalUnit",
      );
    });

    test("BR-REC-66 isActive that is not true or false is 400 VALIDATION_ERROR on isActive", async () => {
      const type = await setup();
      for (const value of ["no", 0, null]) {
        expectInvalid(
          await api.patch(PATH.type(type.id), { body: { isActive: value } }),
          "isActive",
        );
      }
      expect((await dbType(type.id)).isActive).toBe(true);
    });

    test("BR-REC-157 an unknown field is 400 VALIDATION_ERROR and changes nothing", async () => {
      const type = await setup();
      expectInvalid(
        await api.patch(PATH.type(type.id), {
          body: { name: T("Other"), sortOrder: 99 },
        }),
      );
      expect(await dbType(type.id)).toMatchObject({
        name: T("Limits"),
        sortOrder: type.sortOrder,
      });
    });

    test("BR-REC-157 an empty body is 400 VALIDATION_ERROR (at least one field)", async () => {
      const type = await setup();
      expectInvalid(await api.patch(PATH.type(type.id), { body: {} }));
    });

    test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
      const type = await setup();
      expectError(
        await api.patch(PATH.type(type.id), { rawBody: "nope" }),
        400,
        "INVALID_JSON",
      );
    });

    test("BR-REC-61 a refused change leaves every field as it was, also the valid ones sent along", async () => {
      const type = await setup();
      expectInvalid(
        await api.patch(PATH.type(type.id), {
          body: { name: T("Changed"), intervalCount: 99 },
        }),
        "intervalCount",
      );
      expect(await dbType(type.id)).toMatchObject({
        name: T("Limits"),
        intervalCount: 1,
      });
    });
  });

  describe("ids", () => {
    test("BR-REC-154 an unknown assessment id is 404 NOT_FOUND", async () => {
      expectError(
        await api.patch(PATH.type(UNKNOWN_ID), { body: { name: T("Nobody") } }),
        404,
        "NOT_FOUND",
      );
    });

    test("BR-REC-154 an id that is not a uuid is 400 VALIDATION_ERROR", async () => {
      expectInvalid(
        await api.patch(PATH.type("not-an-id"), {
          body: { name: T("Nobody") },
        }),
      );
    });

    test("BR-REC-154 a bad body is 400 even when the id does not exist (validation before lookup)", async () => {
      expectInvalid(
        await api.patch(PATH.type(UNKNOWN_ID), { body: { intervalCount: 99 } }),
        "intervalCount",
      );
    });
  });
});

describe("E12 order the assessments", () => {
  async function three() {
    const a = await makeType({ name: T("A"), sortOrder: 1 });
    const b = await makeType({ name: T("B"), sortOrder: 2 });
    const c = await makeType({ name: T("C"), sortOrder: 3 });
    return { a, b, c };
  }

  test("BR-REC-67 the new order is saved: answer {}, E09 lists the assessments as sent, sortOrder 1..n", async () => {
    const { a, b, c } = await three();
    const reply = await api.put(PATH.typeOrder, {
      body: { typeIds: [c.id, a.id, b.id] },
    });
    expectOk(reply);
    expect(reply.body?.data).toEqual({});
    expect(idsOf(typesOf(await api.get(PATH.types)))).toEqual([
      c.id,
      a.id,
      b.id,
    ]);
    const stored = await dbTypesInOrder();
    expect(stored.map((t) => [t.id, t.sortOrder])).toEqual([
      [c.id, 1],
      [a.id, 2],
      [b.id, 3],
    ]);
  });

  test("BR-REC-67 the sortOrder values become exactly 1..n even when they had gaps", async () => {
    const a = await makeType({ name: T("A"), sortOrder: 10 });
    const b = await makeType({ name: T("B"), sortOrder: 20 });
    const c = await makeType({ name: T("C"), sortOrder: 55 });
    expectOk(
      await api.put(PATH.typeOrder, { body: { typeIds: [b.id, c.id, a.id] } }),
    );
    expect((await dbTypesInOrder()).map((t) => t.sortOrder)).toEqual([1, 2, 3]);
  });

  test("BR-REC-67 sending the same order again is fine and changes nothing", async () => {
    const { a, b, c } = await three();
    expectOk(
      await api.put(PATH.typeOrder, { body: { typeIds: [a.id, b.id, c.id] } }),
    );
    expect(idsOf(typesOf(await api.get(PATH.types)))).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
  });

  test("BR-REC-67 one assessment on its own can be 'moved' (a list of one)", async () => {
    const only = await makeType({ name: T("Only"), sortOrder: 7 });
    expectOk(await api.put(PATH.typeOrder, { body: { typeIds: [only.id] } }));
    expect((await dbType(only.id)).sortOrder).toBe(1);
  });

  test("C7 the list covers every assessment, on and off; an off one keeps its place in the order", async () => {
    const a = await makeType({ name: T("A"), sortOrder: 1 });
    const b = await makeType({
      name: T("B (off)"),
      sortOrder: 2,
      isActive: false,
    });
    const c = await makeType({ name: T("C"), sortOrder: 3 });
    expectOk(
      await api.put(PATH.typeOrder, { body: { typeIds: [b.id, c.id, a.id] } }),
    );
    const all = typesOf(await api.get(`${PATH.types}?includeInactive=true`));
    expect(idsOf(all)).toEqual([b.id, c.id, a.id]);
    // the default list leaves the off one out and keeps the rest in the new order
    expect(idsOf(typesOf(await api.get(PATH.types)))).toEqual([c.id, a.id]);
  });

  test("BR-REC-67 reordering assessments leaves the measurements' own order alone", async () => {
    const { a, b, c } = await three();
    const m1 = await makeMetric(a.id, { name: "M1", sortOrder: 4 });
    const m2 = await makeMetric(a.id, { name: "M2", sortOrder: 8 });
    expectOk(
      await api.put(PATH.typeOrder, {
        body: { typeIds: [b.id, a.id, c.id] },
      }),
    );
    const listed = typesOf(await api.get(PATH.types)).find(
      (t) => t.id === a.id,
    );
    expect(listed?.metrics.map((m) => [m.id, m.sortOrder])).toEqual([
      [m1.id, 4],
      [m2.id, 8],
    ]);
  });

  describe("C7 a list that is not every assessment once is 400 VALIDATION_ERROR and changes nothing", () => {
    async function expectRefused(
      build: (ids: { a: string; b: string; c: string }) => unknown,
      path?: string,
    ) {
      const { a, b, c } = await three();
      const reply = await api.put(PATH.typeOrder, {
        body: { typeIds: build({ a: a.id, b: b.id, c: c.id }) },
      });
      expectInvalid(reply, path);
      expect((await dbTypesInOrder()).map((t) => [t.id, t.sortOrder])).toEqual([
        [a.id, 1],
        [b.id, 2],
        [c.id, 3],
      ]);
    }

    test("a missing assessment", () => expectRefused((x) => [x.c, x.a]));
    test("a missing assessment that is off", async () => {
      const a = await makeType({ name: T("A"), sortOrder: 1 });
      const off = await makeType({
        name: T("Off"),
        sortOrder: 2,
        isActive: false,
      });
      const reply = await api.put(PATH.typeOrder, {
        body: { typeIds: [a.id] },
      });
      expectInvalid(reply);
      expect((await dbType(off.id)).sortOrder).toBe(2);
    });
    test("an extra id nobody has", () =>
      expectRefused((x) => [x.a, UNKNOWN_ID, x.b, x.c]));
    test("an id twice", () =>
      expectRefused((x) => [x.a, x.b, x.c, x.a], "typeIds"));
    test("an id twice, once in upper case", () =>
      expectRefused(
        (x) => [x.a.toUpperCase(), x.b, x.c, x.a.toLowerCase()],
        "typeIds",
      ));
    test("an empty list", () => expectRefused(() => [], "typeIds"));
    test("an id that is not a uuid", () =>
      expectRefused((x) => [x.a, x.b, "not-an-id"], "typeIds"));
    test("only unknown ids", () =>
      expectRefused(() => [UNKNOWN_ID, OTHER_UNKNOWN_ID]));
    test("typeIds that is not a list", () =>
      expectRefused(() => "all of them", "typeIds"));
  });

  test("BR-REC-154 a body without typeIds is 400 VALIDATION_ERROR", async () => {
    await three();
    expectInvalid(await api.put(PATH.typeOrder, { body: {} }), "typeIds");
  });

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    expectError(
      await api.put(PATH.typeOrder, { rawBody: "[" }),
      400,
      "INVALID_JSON",
    );
  });

  test("BR-REC-67 the order tells what E09 returns after the seed as well (assessments numbered from 1)", async () => {
    await seedCatalog();
    const [body, fitness] = typesOf(await api.get(PATH.types)) as [
      TypeOut,
      TypeOut,
    ];
    expectOk(
      await api.put(PATH.typeOrder, {
        body: { typeIds: [fitness.id, body.id] },
      }),
    );
    const after = typesOf(await api.get(PATH.types));
    expect(after.map((t) => [t.name, t.sortOrder])).toEqual([
      ["Fitness test", 1],
      ["Body composition", 2],
    ]);
  });
});

describe("writes at the same time (BR-REC-61, BR-REC-67, C7)", () => {
  test("BR-REC-61 two requests adding the same name (other letter case) at once: one is created, the other is 409 NAME_TAKEN, never an error", async () => {
    const replies = await Promise.all([
      api.post(PATH.types, { body: newType(T("Parallel")) }),
      api.post(PATH.types, { body: newType(T("PARALLEL")) }),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
    const refused = replies.find((reply) => reply.status === 409);
    expect(refused?.body?.code).toBe("NAME_TAKEN");
    expect(await dbTypeCount()).toBe(1);
  });

  test("BR-REC-61 two renames to the same name at once: one wins, the other is 409 NAME_TAKEN", async () => {
    const a = await makeType({ name: T("Alpha") });
    const b = await makeType({ name: T("Beta") });
    const replies = await Promise.all([
      api.patch(PATH.type(a.id), { body: { name: T("Target") } }),
      api.patch(PATH.type(b.id), { body: { name: T("TARGET") } }),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409]);
    expect(replies.find((reply) => reply.status === 409)?.body?.code).toBe(
      "NAME_TAKEN",
    );
  });

  test("C7 assessments added at the same time all get their own place in the order", async () => {
    const names = ["one", "two", "three", "four", "five"].map((n) =>
      T(`Parallel ${n}`),
    );
    const replies = await Promise.all(
      names.map((name) => api.post(PATH.types, { body: newType(name) })),
    );
    for (const reply of replies) expectOk(reply, 201);
    const orders = (await dbTypesInOrder()).map((t) => t.sortOrder);
    expect(orders).toHaveLength(5);
    expect(new Set(orders).size).toBe(5);
  });
});
