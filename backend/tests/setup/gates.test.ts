import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { forgedToken } from "../helpers/http";
import {
  api,
  assertCatalogOnlyOurs,
  auditRows,
  catalogSnapshot,
  cleanupAll,
  expectError,
  makeMetric,
  makeType,
  newActor,
  PATH,
  resetSettings,
  snapshotSingletons,
  wipeCatalog,
} from "./helpers";

// What every setup endpoint (E07-E15) asks of a request before it does anything:
// BR-REC-159 (sign-in on every route; cookie or bearer), BR-REC-37 (a write needs the app's own
// Origin), BR-REC-154 (INVALID_JSON), no Idempotency-Key needed (BR-REC-156 covers E17, E22 only).
// A refused request changes nothing and writes no change-log row.

let restoreSingletons: () => Promise<void>;

beforeAll(async () => {
  restoreSingletons = await snapshotSingletons();
  await assertCatalogOnlyOurs();
});
beforeEach(async () => {
  await wipeCatalog();
  await resetSettings();
});
afterAll(async () => {
  await cleanupAll();
  await restoreSingletons();
});

const T = (suffix: string) => `TEST_setup_${suffix}`;

type Fixture = {
  typeId: string;
  otherTypeId: string;
  metricId: string;
  otherMetricId: string;
};

async function fixture(): Promise<Fixture> {
  const type = await makeType({ name: T("Gate A") });
  const other = await makeType({ name: T("Gate B") });
  const metric = await makeMetric(type.id, { name: "First" });
  const otherMetric = await makeMetric(type.id, { name: "Second" });
  return {
    typeId: type.id,
    otherTypeId: other.id,
    metricId: metric.id,
    otherMetricId: otherMetric.id,
  };
}

type Write = {
  id: string;
  method: "POST" | "PUT" | "PATCH";
  path: (f: Fixture) => string;
  /** a valid body that really changes something */
  body: (f: Fixture) => unknown;
  /** status of the valid request */
  ok: 200 | 201;
};

const WRITES: Write[] = [
  {
    id: "E08",
    method: "PATCH",
    path: () => PATH.settings,
    body: () => ({ gymName: T("Gate gym") }),
    ok: 200,
  },
  {
    id: "E10",
    method: "POST",
    path: () => PATH.types,
    body: () => ({
      name: T("Gate new"),
      intervalCount: 1,
      intervalUnit: "month",
    }),
    ok: 201,
  },
  {
    id: "E11",
    method: "PATCH",
    path: (f) => PATH.type(f.typeId),
    body: () => ({ name: T("Gate renamed") }),
    ok: 200,
  },
  {
    id: "E12",
    method: "PUT",
    path: () => PATH.typeOrder,
    body: (f) => ({ typeIds: [f.otherTypeId, f.typeId] }),
    ok: 200,
  },
  {
    id: "E13",
    method: "POST",
    path: (f) => PATH.typeMetrics(f.typeId),
    body: () => ({ name: "Gate metric", datatype: "number", better: "higher" }),
    ok: 201,
  },
  {
    id: "E14",
    method: "PATCH",
    path: (f) => PATH.metric(f.metricId),
    body: () => ({ name: "Gate renamed" }),
    ok: 200,
  },
  {
    id: "E15",
    method: "PUT",
    path: (f) => PATH.typeMetricOrder(f.typeId),
    body: (f) => ({ metricIds: [f.otherMetricId, f.metricId] }),
    ok: 200,
  },
];

const send = (
  write: Write,
  f: Fixture,
  options: Parameters<typeof api.post>[1] = {},
) => {
  const call =
    write.method === "POST"
      ? api.post
      : write.method === "PUT"
        ? api.put
        : api.patch;
  return call(write.path(f), { body: write.body(f), ...options });
};

describe("writes E08, E10-E15", () => {
  for (const write of WRITES) {
    describe(`${write.id} ${write.method}`, () => {
      test(`${write.id} the valid request is accepted with a sign-in, the app's Origin and no Idempotency-Key`, async () => {
        const f = await fixture();
        const reply = await send(write, f);
        expect(reply.status, JSON.stringify(reply.body)).toBe(write.ok);
        expect(reply.body?.success).toBe(true);
      });

      test(`BR-REC-159 ${write.id} without a sign-in is 401 UNAUTHORIZED and changes nothing`, async () => {
        const f = await fixture();
        const before = await catalogSnapshot();
        const reply = await send(write, f, { token: null });
        expectError(reply, 401, "UNAUTHORIZED");
        expect(await catalogSnapshot()).toBe(before);
      });

      test(`BR-REC-159 ${write.id} with a forged token is 401 UNAUTHORIZED and changes nothing`, async () => {
        const f = await fixture();
        const before = await catalogSnapshot();
        const reply = await send(write, f, { token: await forgedToken() });
        expectError(reply, 401, "UNAUTHORIZED");
        expect(await catalogSnapshot()).toBe(before);
      });

      test(`BR-REC-37 ${write.id} with no Origin is 403 CSRF_ORIGIN, changes nothing and logs nothing`, async () => {
        const f = await fixture();
        const actor = await newActor();
        const before = await catalogSnapshot();
        const reply = await send(write, f, {
          token: actor.token,
          origin: null,
        });
        expectError(reply, 403, "CSRF_ORIGIN");
        expect(await catalogSnapshot()).toBe(before);
        expect(await auditRows(actor.sid)).toHaveLength(0);
      });

      test(`BR-REC-37 ${write.id} from another Origin is 403 CSRF_ORIGIN, changes nothing and logs nothing`, async () => {
        const f = await fixture();
        const actor = await newActor();
        const before = await catalogSnapshot();
        const reply = await send(write, f, {
          token: actor.token,
          origin: "https://evil.example",
        });
        expectError(reply, 403, "CSRF_ORIGIN");
        expect(await catalogSnapshot()).toBe(before);
        expect(await auditRows(actor.sid)).toHaveLength(0);
      });

      test(`BR-REC-154 ${write.id} with a body that is not JSON is 400 INVALID_JSON and changes nothing`, async () => {
        const f = await fixture();
        const before = await catalogSnapshot();
        const call =
          write.method === "POST"
            ? api.post
            : write.method === "PUT"
              ? api.put
              : api.patch;
        const reply = await call(write.path(f), { rawBody: "{not json" });
        expectError(reply, 400, "INVALID_JSON");
        expect(await catalogSnapshot()).toBe(before);
      });
    });
  }
});

describe("reads E07, E09", () => {
  const READS: [string, string][] = [
    ["E07", PATH.settings],
    ["E09", PATH.types],
  ];

  for (const [id, path] of READS) {
    test(`BR-REC-159 ${id} without a sign-in is 401 UNAUTHORIZED`, async () => {
      expectError(await api.get(path, { token: null }), 401, "UNAUTHORIZED");
    });

    test(`BR-REC-159 ${id} with a forged token is 401 UNAUTHORIZED`, async () => {
      expectError(
        await api.get(path, { token: await forgedToken() }),
        401,
        "UNAUTHORIZED",
      );
    });

    test(`BR-REC-159 ${id} with garbage in the cookie is 401 UNAUTHORIZED`, async () => {
      expectError(
        await api.get(path, { token: "not-a-token" }),
        401,
        "UNAUTHORIZED",
      );
    });

    test(`BR-REC-159 ${id} accepts a bearer token as well as the cookie`, async () => {
      const actor = await newActor();
      const reply = await api.get(path, {
        token: null,
        headers: { Authorization: `Bearer ${actor.token}` },
      });
      expect(reply.status).toBe(200);
      expect(reply.body?.success).toBe(true);
    });

    test(`BR-REC-37 ${id} is a read: it needs no Origin`, async () => {
      const reply = await api.get(path, { origin: null });
      expect(reply.status).toBe(200);
    });
  }
});

describe("BR-REC-154 ids in the path", () => {
  test("a well-formed id that does not exist is 404 NOT_FOUND on E11, E13, E14, E15", async () => {
    const unknown = "00000000-0000-4000-8000-0000000000ff";
    const calls = [
      api.patch(PATH.type(unknown), { body: { name: T("Nobody") } }),
      api.post(PATH.typeMetrics(unknown), {
        body: { name: "Burpees", datatype: "number", better: "higher" },
      }),
      api.patch(PATH.metric(unknown), { body: { name: "Nobody" } }),
      api.put(PATH.typeMetricOrder(unknown), {
        body: { metricIds: [unknown] },
      }),
    ];
    for (const reply of await Promise.all(calls)) {
      expectError(reply, 404, "NOT_FOUND");
    }
  });

  test("an id that is not an 8-4-4-4-12 hex uuid is 400 VALIDATION_ERROR on E11, E13, E14, E15", async () => {
    for (const bad of [
      "abc",
      "12345",
      "00000000-0000-4000-8000-00000000000g",
    ]) {
      const replies = await Promise.all([
        api.patch(PATH.type(bad), { body: { name: T("Nobody") } }),
        api.post(PATH.typeMetrics(bad), {
          body: { name: "Burpees", datatype: "number", better: "higher" },
        }),
        api.patch(PATH.metric(bad), { body: { name: "Nobody" } }),
        api.put(PATH.typeMetricOrder(bad), {
          body: { metricIds: ["00000000-0000-4000-8000-000000000001"] },
        }),
      ]);
      for (const reply of replies) {
        expectError(reply, 400, "VALIDATION_ERROR");
      }
    }
  });
});
