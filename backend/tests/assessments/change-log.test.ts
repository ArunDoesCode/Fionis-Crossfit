import { beforeAll, describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  type SaveResult,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// Change log for E26, E29, E30.
// BR-REC-92 (every change is in the change log with old and new values), BR-REC-158 (every write has its
// change-log row; a refused write has none), build clarification D7 (entity `assessment`, actions
// assessment.save / assessment.move / assessment.delete, before/after = date, isEstimated, values by measurement id).

const s = useAssessmentsSuite();

let body: SeededType;

beforeAll(async () => {
  body = await s.seedType();
});

/** How many assessment.* change-log rows this file's sign-in has written so far. */
async function assessmentLogCount(): Promise<number> {
  const rows = await s.audit();
  return rows.filter((r) => r.action.startsWith("assessment.")).length;
}

describe("E26 change log (BR-REC-92, 158, D7)", () => {
  test("BR-REC-92 a create writes one assessment.save row: entity assessment, the assessment's id, no before, the whole new state after", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(
        m,
        body,
        "2025-12-30",
        [
          [body.metric("Weight"), 94],
          [body.metric("Plank"), 122],
        ],
        true,
      ),
    );
    const rows = await s.audit({ entityId: result.assessmentId });
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row?.action).toBe("assessment.save");
    expect(row?.entity).toBe("assessment");
    expect(row?.entityId).toBe(result.assessmentId);
    expect(row?.sessionId).toBe(s.sessionId);
    expect(row?.before).toBeNull();
    expect(row?.after).toEqual({
      date: "2025-12-30",
      isEstimated: true,
      values: {
        [body.metric("Weight").id]: 94,
        [body.metric("Plank").id]: 122,
      },
    });
  });

  test("BR-REC-92 fixing a typo from last year is saved and logged with the old and the new value", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 59.5],
        [body.metric("Waist"), 91],
      ]),
    );
    await s.saveValues(m, body, "2025-03-12", [[body.metric("Weight"), 95.5]]);
    const rows = await s.audit({ entityId: first.assessmentId });
    expect(rows.map((r) => r.action)).toEqual([
      "assessment.save",
      "assessment.save",
    ]);
    // an edit holds the whole stored state before and after: the untouched Waist is in both
    expect(rows[1]?.before).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values: {
        [body.metric("Weight").id]: 59.5,
        [body.metric("Waist").id]: 91,
      },
    });
    expect(rows[1]?.after).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values: {
        [body.metric("Weight").id]: 95.5,
        [body.metric("Waist").id]: 91,
      },
    });
  });

  test("BR-REC-92 an edit that sets, removes and flips the flag is logged as one row with the whole old and new state", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(
        m,
        body,
        "2025-03-12",
        [
          [body.metric("Weight"), 95.5],
          [body.metric("Plank"), 122],
        ],
        false,
      ),
    );
    await s.saveValues(
      m,
      body,
      "2025-03-12",
      [
        [body.metric("Weight"), 94],
        [body.metric("Plank"), null],
        [body.metric("Waist"), 91],
      ],
      true,
    );
    const rows = await s.audit({ entityId: first.assessmentId });
    expect(rows.length).toBe(2);
    expect(rows[1]?.before).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values: {
        [body.metric("Weight").id]: 95.5,
        [body.metric("Plank").id]: 122,
      },
    });
    expect(rows[1]?.after).toEqual({
      date: "2025-03-12",
      isEstimated: true,
      values: {
        [body.metric("Weight").id]: 94,
        [body.metric("Waist").id]: 91,
      },
    });
  });

  test("D7 saving the same thing again is an edit and writes its own row", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]);
    await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]);
    const rows = await s.audit({ entityId: first.assessmentId });
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.action)).toEqual([
      "assessment.save",
      "assessment.save",
      "assessment.save",
    ]);
    expect(rows[0]?.before).toBeNull();
    expect(rows[1]?.before).not.toBeNull();
    expect(rows[2]?.before).not.toBeNull();
  });

  test("D7 the log holds the stored (rounded) numbers, not the typed ones", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [
        [body.metric("Weight"), 95.56],
        [body.metric("Plank"), 122.4],
      ]),
    );
    const [row] = await s.audit({ entityId: result.assessmentId });
    expect(row?.after).toEqual({
      date: "2025-12-30",
      isEstimated: false,
      values: {
        [body.metric("Weight").id]: 95.6,
        [body.metric("Plank").id]: 122,
      },
    });
  });

  test("D7 an empty values list on a saved assessment (only About changes) writes one assessment.save row: the flag flips, the values are the same before and after", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      isEstimated: false,
      values: [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ],
    });
    expect(
      dataOf<SaveResult>(await s.saveValues(m, body, "2025-03-12", [], true))
        .saved,
    ).toBe(0);
    const rows = await s.audit({ entityId: a.id });
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe("assessment.save");
    expect(rows[0]?.before).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values: {
        [body.metric("Weight").id]: 95.5,
        [body.metric("Plank").id]: 122,
      },
    });
    expect(rows[0]?.after).toEqual({
      date: "2025-03-12",
      isEstimated: true,
      values: {
        [body.metric("Weight").id]: 95.5,
        [body.metric("Plank").id]: 122,
      },
    });
  });

  test("D7 nulls that remove only some values are one assessment.save row: before holds all values, after only the rest", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
        [body.metric("Waist"), 91],
      ],
    });
    await s.saveValues(m, body, "2025-03-12", [
      [body.metric("Plank"), null],
      [body.metric("Waist"), null],
    ]);
    const rows = await s.audit({ entityId: a.id });
    expect(rows.length).toBe(1);
    expect(Object.keys(rows[0]?.before?.values as object).length).toBe(3);
    expect(rows[0]?.after).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values: { [body.metric("Weight").id]: 95.5 },
    });
  });

  test("BR-REC-158 an edit refused as NO_VALUES (its nulls would remove every remaining value) writes no row", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const before = await assessmentLogCount();
    const reply = await s.saveValues(
      m,
      body,
      "2025-03-12",
      [[body.metric("Weight"), null]],
      true,
    );
    expect(reply.status).toBe(400);
    expect(reply.body?.code).toBe("NO_VALUES");
    expect(await assessmentLogCount()).toBe(before);
    expect((await s.audit({ entityId: a.id })).length).toBe(0);
  });

  test("BR-REC-158 five racing saves write five rows, exactly one of them a create", async () => {
    const m = await s.seedMember();
    const replies = await Promise.all(
      [90, 91, 92, 93, 94].map((value) =>
        s.saveValues(m, body, "2025-12-30", [[body.metric("Waist"), value]]),
      ),
    );
    const results = replies.map((r) => dataOf<SaveResult>(r));
    const rows = await s.audit({
      entityId: results[0]?.assessmentId as string,
    });
    expect(rows.length).toBe(5);
    expect(rows.filter((r) => r.before === null).length).toBe(1);
  });

  test("BR-REC-158 a refused save writes no row (NO_VALUES, a future date, a foreign measurement, a limit, unknown ids, a bad shape)", async () => {
    const m = await s.seedMember();
    const fitness = await s.seedType({
      metrics: [{ name: "Fran", datatype: "duration", better: "lower" }],
    });
    const base = {
      memberId: m.id,
      typeId: body.id,
      date: "2025-12-30",
      isEstimated: false,
    };
    const weight = body.metric("Weight").id;
    const before = await assessmentLogCount();
    const attempts: unknown[] = [
      { ...base, values: [] },
      { ...base, values: [{ metricId: weight, value: null }] },
      { ...base, date: s.day(1), values: [{ metricId: weight, value: 94 }] },
      {
        ...base,
        values: [{ metricId: fitness.metric("Fran").id, value: 300 }],
      },
      {
        ...base,
        values: [{ metricId: body.metric("Plank").id, value: 40_000 }],
      },
      {
        ...base,
        memberId: UNKNOWN_ID,
        values: [{ metricId: weight, value: 94 }],
      },
      {
        ...base,
        typeId: OTHER_UNKNOWN_ID,
        values: [{ metricId: weight, value: 94 }],
      },
      {
        ...base,
        date: "2026-02-30",
        values: [{ metricId: weight, value: 94 }],
      },
    ];
    for (const attempt of attempts) {
      const reply = await s.save(attempt);
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(reply.status).toBeLessThan(500);
    }
    expect(await assessmentLogCount()).toBe(before);
  });
});

describe("E29 change log (BR-REC-92, 158, D7)", () => {
  test("D7 a move writes one assessment.move row: before has the old date, after the new, same values", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      isEstimated: false,
      values: [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ],
    });
    expect((await s.patch(a.id, { date: "2025-03-15" })).status).toBe(200);
    const rows = await s.audit({ entityId: a.id });
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe("assessment.move");
    expect(rows[0]?.entity).toBe("assessment");
    expect(rows[0]?.sessionId).toBe(s.sessionId);
    const values = {
      [body.metric("Weight").id]: 95.5,
      [body.metric("Plank").id]: 122,
    };
    expect(rows[0]?.before).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values,
    });
    expect(rows[0]?.after).toEqual({
      date: "2025-03-15",
      isEstimated: false,
      values,
    });
  });

  test("D7 marking a date as estimated alone is logged as assessment.move too", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expect((await s.patch(a.id, { isEstimated: true })).status).toBe(200);
    const rows = await s.audit({ entityId: a.id });
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe("assessment.move");
    expect(rows[0]?.before).toMatchObject({ isEstimated: false });
    expect(rows[0]?.after).toMatchObject({
      date: "2025-03-12",
      isEstimated: true,
    });
  });

  test("BR-REC-158 a refused move writes no row (a taken date, a future date, an unknown id, a bad body)", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-15",
      values: [[body.metric("Weight"), 94]],
    });
    const before = await assessmentLogCount();
    expect((await s.patch(a.id, { date: "2025-03-15" })).status).toBe(409);
    expect((await s.patch(a.id, { date: s.day(1) })).status).toBe(400);
    expect((await s.patch(UNKNOWN_ID, { date: "2025-03-20" })).status).toBe(
      404,
    );
    expect((await s.patch(a.id, {})).status).toBe(400);
    expect(await assessmentLogCount()).toBe(before);
  });
});

describe("E30 change log (BR-REC-92, 158, D7)", () => {
  test("D7 a delete writes one assessment.delete row: the whole old state before, no after", async () => {
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
    expect((await s.remove(a.id)).status).toBe(200);
    const rows = await s.audit({ entityId: a.id });
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe("assessment.delete");
    expect(rows[0]?.entity).toBe("assessment");
    expect(rows[0]?.sessionId).toBe(s.sessionId);
    expect(rows[0]?.before).toEqual({
      date: "2025-03-12",
      isEstimated: true,
      values: {
        [body.metric("Weight").id]: 95.5,
        [body.metric("Plank").id]: 122,
      },
    });
    expect(rows[0]?.after).toBeNull();
  });

  test("BR-REC-158 a refused delete writes no row (unknown id, malformed id, a second delete)", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expect((await s.remove(a.id)).status).toBe(200);
    const before = await assessmentLogCount();
    expect((await s.remove(a.id)).status).toBe(404);
    expect((await s.remove(UNKNOWN_ID)).status).toBe(404);
    expect((await s.remove("not-an-id")).status).toBe(400);
    expect(await assessmentLogCount()).toBe(before);
  });
});

describe("the whole life of one assessment (BR-REC-92)", () => {
  test("BR-REC-92 create, edit, move and delete leave four rows in order, all tied to the assessment's id", async () => {
    const m = await s.seedMember();
    const created = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
      ]),
    );
    await s.saveValues(m, body, "2025-03-12", [[body.metric("Weight"), 94]]);
    await s.patch(created.assessmentId, { date: "2025-03-15" });
    await s.remove(created.assessmentId);
    const rows = await s.audit({ entityId: created.assessmentId });
    expect(rows.map((r) => r.action)).toEqual([
      "assessment.save",
      "assessment.save",
      "assessment.move",
      "assessment.delete",
    ]);
    for (const row of rows) expect(row.entity).toBe("assessment");
  });
});
