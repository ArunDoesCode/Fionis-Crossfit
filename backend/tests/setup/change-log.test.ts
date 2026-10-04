import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { UNKNOWN_ID } from "../helpers/http";
import {
  type Actor,
  addValue,
  api,
  assertCatalogOnlyOurs,
  auditRows,
  catalogSnapshot,
  cleanupAll,
  makeMetric,
  makeType,
  newActor,
  PATH,
  resetSettings,
  snapshotSingletons,
  wipeCatalog,
} from "./helpers";

// BR-REC-158 + setup.md C10: every successful write leaves exactly one change-log row (audit_log)
// written in the same transaction, with the signed-in session, the action name, and the changed
// fields as before -> after. A refused write (4xx) leaves no row and changes nothing.

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

type Send = (actor: Actor) => Promise<{ status: number }>;

/** Runs one write as a fresh session and returns that session's change-log rows. */
async function logOf(run: Send) {
  const actor = await newActor();
  const reply = await run(actor);
  return { actor, reply, rows: await auditRows(actor.sid) };
}

describe("BR-REC-158 / C10 one change-log row per successful write", () => {
  test("E08 settings.update: the changed field only, before -> after, with the session", async () => {
    const { actor, reply, rows } = await logOf((a) =>
      api.patch(PATH.settings, {
        token: a.token,
        body: { gymName: T("Gym") },
      }),
    );
    expect(reply.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "settings.update",
      before: { gymName: "Fionis CrossFit" },
      after: { gymName: T("Gym") },
    });
  });

  test("E08 settings that are sent but did not change are not in before or after", async () => {
    const { rows } = await logOf((a) =>
      api.patch(PATH.settings, {
        token: a.token,
        body: { gymName: T("Gym"), upcomingLeadDays: 7, expiryLeadDays: 30 },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]?.before ?? {}).sort()).toEqual([
      "expiryLeadDays",
      "gymName",
    ]);
    expect(Object.keys(rows[0]?.after ?? {}).sort()).toEqual([
      "expiryLeadDays",
      "gymName",
    ]);
    expect(rows[0]?.before).toMatchObject({ expiryLeadDays: 14 });
    expect(rows[0]?.after).toMatchObject({ expiryLeadDays: 30 });
  });

  test("E10 assessment_type.create: the new assessment is in after", async () => {
    const { actor, reply, rows } = await logOf((a) =>
      api.post(PATH.types, {
        token: a.token,
        body: { name: T("Logged"), intervalCount: 2, intervalUnit: "week" },
      }),
    );
    expect(reply.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "assessment_type.create",
      after: { name: T("Logged"), intervalCount: 2, intervalUnit: "week" },
    });
  });

  test("E11 assessment_type.update: a rename logs the old and the new name only", async () => {
    const type = await makeType({ name: T("Old") });
    const { actor, reply, rows } = await logOf((a) =>
      api.patch(PATH.type(type.id), {
        token: a.token,
        body: { name: T("New"), intervalCount: 1 },
      }),
    );
    expect(reply.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "assessment_type.update",
      before: { name: T("Old") },
      after: { name: T("New") },
    });
    expect(Object.keys(rows[0]?.after ?? {})).toEqual(["name"]);
  });

  test("E11 assessment_type.update is also the action for turning an assessment off and on", async () => {
    const type = await makeType({ name: T("Toggle") });
    const off = await logOf((a) =>
      api.patch(PATH.type(type.id), {
        token: a.token,
        body: { isActive: false },
      }),
    );
    expect(off.rows).toHaveLength(1);
    expect(off.rows[0]).toMatchObject({
      action: "assessment_type.update",
      before: { isActive: true },
      after: { isActive: false },
    });
    const on = await logOf((a) =>
      api.patch(PATH.type(type.id), {
        token: a.token,
        body: { isActive: true },
      }),
    );
    expect(on.rows).toHaveLength(1);
    expect(on.rows[0]).toMatchObject({
      action: "assessment_type.update",
      before: { isActive: false },
      after: { isActive: true },
    });
  });

  test("E12 assessment_type.reorder: one row for the whole new order", async () => {
    const a = await makeType({ name: T("A") });
    const b = await makeType({ name: T("B") });
    const { actor, reply, rows } = await logOf((x) =>
      api.put(PATH.typeOrder, {
        token: x.token,
        body: { typeIds: [b.id, a.id] },
      }),
    );
    expect(reply.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "assessment_type.reorder",
    });
  });

  test("E13 metric.create: the new measurement is in after", async () => {
    const type = await makeType({ name: T("Fit") });
    const { actor, reply, rows } = await logOf((a) =>
      api.post(PATH.typeMetrics(type.id), {
        token: a.token,
        body: {
          name: "Burpees 1 min",
          datatype: "number",
          unit: "count",
          decimals: 0,
          better: "higher",
        },
      }),
    );
    expect(reply.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "metric.create",
      after: {
        name: "Burpees 1 min",
        datatype: "number",
        unit: "count",
        better: "higher",
      },
    });
  });

  test("E14 metric.update: a change logs the old and the new value only", async () => {
    const type = await makeType({ name: T("Fit") });
    const metric = await makeMetric(type.id, {
      name: "Weight",
      unit: "kg",
      better: "lower",
    });
    const { actor, reply, rows } = await logOf((a) =>
      api.patch(PATH.metric(metric.id), {
        token: a.token,
        body: { better: "higher", unit: "kg" },
      }),
    );
    expect(reply.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "metric.update",
      before: { better: "lower" },
      after: { better: "higher" },
    });
    expect(Object.keys(rows[0]?.after ?? {})).toEqual(["better"]);
  });

  test("E14 metric.update is also the action for turning a measurement off and on", async () => {
    const type = await makeType({ name: T("Fit") });
    const metric = await makeMetric(type.id, { name: "Plank" });
    const off = await logOf((a) =>
      api.patch(PATH.metric(metric.id), {
        token: a.token,
        body: { isActive: false },
      }),
    );
    expect(off.rows).toHaveLength(1);
    expect(off.rows[0]).toMatchObject({
      action: "metric.update",
      before: { isActive: true },
      after: { isActive: false },
    });
    const on = await logOf((a) =>
      api.patch(PATH.metric(metric.id), {
        token: a.token,
        body: { isActive: true },
      }),
    );
    expect(on.rows).toHaveLength(1);
    expect(on.rows[0]).toMatchObject({
      action: "metric.update",
      before: { isActive: false },
      after: { isActive: true },
    });
  });

  test("E15 metric.reorder: one row for the whole new order", async () => {
    const type = await makeType({ name: T("Fit") });
    const a = await makeMetric(type.id, { name: "5K run" });
    const b = await makeMetric(type.id, { name: "Fran" });
    const { actor, reply, rows } = await logOf((x) =>
      api.put(PATH.typeMetricOrder(type.id), {
        token: x.token,
        body: { metricIds: [b.id, a.id] },
      }),
    );
    expect(reply.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: actor.sid,
      action: "metric.reorder",
    });
  });

  test("BR-REC-158 two writes by one session leave two rows, in order, with their own actions", async () => {
    const actor = await newActor();
    await api.patch(PATH.settings, {
      token: actor.token,
      body: { gymName: T("Two writes") },
    });
    await api.post(PATH.types, {
      token: actor.token,
      body: { name: T("Second"), intervalCount: 1, intervalUnit: "month" },
    });
    const rows = await auditRows(actor.sid);
    expect(rows.map((row) => row.action)).toEqual([
      "settings.update",
      "assessment_type.create",
    ]);
  });

  test("BR-REC-158 the row belongs to the signed-in session, not to another session's request", async () => {
    const one = await newActor();
    const two = await newActor();
    await api.patch(PATH.settings, {
      token: one.token,
      body: { gymName: T("By one") },
    });
    expect(await auditRows(one.sid)).toHaveLength(1);
    expect(await auditRows(two.sid)).toHaveLength(0);
  });

  test("BR-REC-158 reads leave no row", async () => {
    const actor = await newActor();
    await api.get(PATH.settings, { token: actor.token });
    await api.get(PATH.types, { token: actor.token });
    expect(await auditRows(actor.sid)).toHaveLength(0);
  });
});

describe("BR-REC-158 a refused write leaves no change-log row and changes nothing", () => {
  type Refused = {
    label: string;
    status: number;
    run: (a: Actor) => Promise<{ status: number }>;
  };

  async function cases(): Promise<Refused[]> {
    const type = await makeType({ name: T("Taken") });
    const other = await makeType({ name: T("Other") });
    const weight = await makeMetric(type.id, {
      name: "Weight",
      unit: "kg",
      plausibleMin: 30,
      plausibleMax: 250,
    });
    const height = await makeMetric(type.id, { name: "Height" });
    await addValue(weight.id, 80);
    const patch = (path: string, body: unknown) => (a: Actor) =>
      api.patch(path, { token: a.token, body });
    const post = (path: string, body: unknown) => (a: Actor) =>
      api.post(path, { token: a.token, body });
    const put = (path: string, body: unknown) => (a: Actor) =>
      api.put(path, { token: a.token, body });
    return [
      {
        label: "E08 a lead window out of range",
        status: 400,
        run: patch(PATH.settings, { upcomingLeadDays: 99 }),
      },
      {
        label: "E10 a name that is too short",
        status: 400,
        run: post(PATH.types, {
          name: "a",
          intervalCount: 1,
          intervalUnit: "month",
        }),
      },
      {
        label: "E10 a name that is taken",
        status: 409,
        run: post(PATH.types, {
          name: T("TAKEN"),
          intervalCount: 1,
          intervalUnit: "month",
        }),
      },
      {
        label: "E11 an unknown assessment",
        status: 404,
        run: patch(PATH.type(UNKNOWN_ID), { name: T("Nobody") }),
      },
      {
        label: "E11 a name that is taken",
        status: 409,
        run: patch(PATH.type(other.id), { name: T("TAKEN") }),
      },
      {
        label: "E12 an order that leaves an assessment out",
        status: 400,
        run: put(PATH.typeOrder, { typeIds: [type.id] }),
      },
      {
        label: "E13 an unknown assessment",
        status: 404,
        run: post(PATH.typeMetrics(UNKNOWN_ID), {
          name: "Burpees",
          datatype: "number",
          better: "higher",
        }),
      },
      {
        label: "E13 a name that is taken",
        status: 409,
        run: post(PATH.typeMetrics(type.id), {
          name: "WEIGHT",
          datatype: "number",
          better: "higher",
        }),
      },
      {
        label: "E14 a unit change on a measurement with values (METRIC_LOCKED)",
        status: 409,
        run: patch(PATH.metric(weight.id), { unit: "lb", name: "Renamed" }),
      },
      {
        label: "E14 a name that is taken",
        status: 409,
        run: patch(PATH.metric(height.id), { name: "weight" }),
      },
      {
        label: "E14 a range that would be broken by the stored values",
        status: 400,
        run: patch(PATH.metric(weight.id), { plausibleMin: 500 }),
      },
      {
        label: "E14 an unknown measurement",
        status: 404,
        run: patch(PATH.metric(UNKNOWN_ID), { name: "Nobody" }),
      },
      {
        label: "E15 an order that leaves a measurement out",
        status: 400,
        run: put(PATH.typeMetricOrder(type.id), { metricIds: [weight.id] }),
      },
      {
        label: "E15 an unknown assessment",
        status: 404,
        run: put(PATH.typeMetricOrder(UNKNOWN_ID), { metricIds: [height.id] }),
      },
    ];
  }

  test("every refused write: the status is the refusal, no row is written and the catalog and settings are unchanged", async () => {
    const list = await cases();
    const snapshot = await catalogSnapshot();
    for (const { label, status, run } of list) {
      const actor = await newActor();
      const reply = await run(actor);
      expect(reply.status, label).toBe(status);
      expect(await auditRows(actor.sid), label).toHaveLength(0);
      expect(await catalogSnapshot(), label).toBe(snapshot);
    }
  });
});
