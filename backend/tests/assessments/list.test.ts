import { beforeAll, describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  addDays,
  dataOf,
  expectError,
  expectInvalid,
  type ListItem,
  metaOf,
  type SaveResult,
  type SeededMember,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E27 GET /api/assessments?memberId=&typeId=&page=&pageSize=&sortDir=
// BR-REC-89 (a member's assessments newest first, filter by assessment, 25 per page),
// BR-REC-155 (pagination contract), BR-REC-153 (shapes), build clarification D10 and D18 (Recent block, pageSize 3).

const s = useAssessmentsSuite();

let body: SeededType;
let fitness: SeededType;

beforeAll(async () => {
  body = await s.seedType();
  fitness = await s.seedType({
    metrics: [
      { name: "Fran", datatype: "duration", better: "lower" },
      { name: "Plank", datatype: "duration", better: "higher" },
    ],
  });
});

/** A member with 3 body-composition assessments (one estimated) and 1 fitness test. */
async function seedHistory(): Promise<{
  m: SeededMember;
  ids: Record<"dec25" | "mar26" | "aug26" | "sep26", string>;
}> {
  const m = await s.seedMember();
  const dec25 = await s.seedAssessment({
    member: m,
    type: body,
    date: "2025-12-30",
    isEstimated: true,
    values: [
      [body.metric("Weight"), 95.5],
      [body.metric("Visceral fat"), 8],
      [body.metric("Plank"), 110],
    ],
  });
  const mar26 = await s.seedAssessment({
    member: m,
    type: body,
    date: "2026-03-01",
    values: [[body.metric("Weight"), 93]],
  });
  const aug26 = await s.seedAssessment({
    member: m,
    type: fitness,
    date: "2026-08-10",
    values: [
      [fitness.metric("Fran"), 300],
      [fitness.metric("Plank"), 120],
    ],
  });
  const sep26 = await s.seedAssessment({
    member: m,
    type: body,
    date: "2026-09-12",
    values: [
      [body.metric("Weight"), 92],
      [body.metric("Visceral fat"), 7],
      [body.metric("Plank"), 125],
      [body.metric("Waist"), 88],
    ],
  });
  return {
    m,
    ids: {
      dec25: dec25.id,
      mar26: mar26.id,
      aug26: aug26.id,
      sep26: sep26.id,
    },
  };
}

describe("E27 a member's assessments (BR-REC-89, D10)", () => {
  test("BR-REC-89 the list is newest first by default", async () => {
    const { m, ids } = await seedHistory();
    const reply = await s.list({ memberId: m.id });
    const items = dataOf<ListItem[]>(reply);
    expect(items.map((i) => i.id)).toEqual([
      ids.sep26,
      ids.aug26,
      ids.mar26,
      ids.dec25,
    ]);
    expect(items.map((i) => i.date)).toEqual([
      "2026-09-12",
      "2026-08-10",
      "2026-03-01",
      "2025-12-30",
    ]);
  });

  test("BR-REC-89 each row has the date, the assessment, the number of results and the estimated flag", async () => {
    const { m, ids } = await seedHistory();
    const items = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    expect(items).toEqual([
      {
        id: ids.sep26,
        typeId: body.id,
        typeName: body.name,
        date: "2026-09-12",
        isEstimated: false,
        valueCount: 4,
      },
      {
        id: ids.aug26,
        typeId: fitness.id,
        typeName: fitness.name,
        date: "2026-08-10",
        isEstimated: false,
        valueCount: 2,
      },
      {
        id: ids.mar26,
        typeId: body.id,
        typeName: body.name,
        date: "2026-03-01",
        isEstimated: false,
        valueCount: 1,
      },
      {
        id: ids.dec25,
        typeId: body.id,
        typeName: body.name,
        date: "2025-12-30",
        isEstimated: true,
        valueCount: 3,
      },
    ]);
  });

  test("BR-REC-89 sortDir=asc lists the oldest first", async () => {
    const { m, ids } = await seedHistory();
    const items = dataOf<ListItem[]>(
      await s.list({ memberId: m.id, sortDir: "asc" }),
    );
    expect(items.map((i) => i.id)).toEqual([
      ids.dec25,
      ids.mar26,
      ids.aug26,
      ids.sep26,
    ]);
  });

  test("BR-REC-89 sortDir=desc is the same as leaving it out", async () => {
    const { m } = await seedHistory();
    const plain = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    const desc = dataOf<ListItem[]>(
      await s.list({ memberId: m.id, sortDir: "desc" }),
    );
    expect(desc).toEqual(plain);
  });

  test("BR-REC-89 filtering by assessment lists only that assessment's rows (Filter 'Fitness test' -> only fitness rows)", async () => {
    const { m, ids } = await seedHistory();
    const fit = dataOf<ListItem[]>(
      await s.list({ memberId: m.id, typeId: fitness.id }),
    );
    expect(fit.map((i) => i.id)).toEqual([ids.aug26]);
    const bodyOnly = await s.list({ memberId: m.id, typeId: body.id });
    expect(dataOf<ListItem[]>(bodyOnly).map((i) => i.id)).toEqual([
      ids.sep26,
      ids.mar26,
      ids.dec25,
    ]);
    expect(metaOf(bodyOnly).total).toBe(3);
  });

  test("BR-REC-89 meta.total counts the rows of the member (after the filter)", async () => {
    const { m } = await seedHistory();
    expect(metaOf(await s.list({ memberId: m.id })).total).toBe(4);
    expect(
      metaOf(await s.list({ memberId: m.id, typeId: fitness.id })).total,
    ).toBe(1);
  });

  test("BR-REC-89 another member's assessments are not in the list", async () => {
    const { m } = await seedHistory();
    const other = await s.seedMember();
    await s.seedAssessment({
      member: other,
      type: body,
      date: "2026-10-01",
      values: [[body.metric("Weight"), 80]],
    });
    const items = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    expect(items.length).toBe(4);
    const theirs = dataOf<ListItem[]>(await s.list({ memberId: other.id }));
    expect(theirs.length).toBe(1);
  });

  test("D10 valueCount follows the stored values: a removed value lowers it, an added one raises it", async () => {
    const m = await s.seedMember();
    const saved = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [
        [body.metric("Weight"), 94],
        [body.metric("Plank"), 122],
      ]),
    );
    expect(
      dataOf<ListItem[]>(await s.list({ memberId: m.id }))[0]?.valueCount,
    ).toBe(2);
    await s.saveValues(m, body, "2025-12-30", [
      [body.metric("Plank"), null],
      [body.metric("Waist"), 90],
      [body.metric("Visceral fat"), 8],
    ]);
    const [item] = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    expect(item?.id).toBe(saved.assessmentId);
    expect(item?.valueCount).toBe(3);
  });

  test("BR-REC-80 an estimated date is flagged isEstimated in the list", async () => {
    const m = await s.seedMember();
    await s.saveValues(
      m,
      body,
      "2025-09-01",
      [[body.metric("Weight"), 96]],
      true,
    );
    const [item] = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    expect(item?.isEstimated).toBe(true);
  });

  test("D4 the history of a turned-off assessment is still listed", async () => {
    const t = await s.seedType({ isActive: false });
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [[t.metric("Weight"), 95]],
    });
    const items = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    expect(items.map((i) => i.typeName)).toEqual([t.name]);
  });

  test("BR-REC-58 an archived member's assessments are listed", async () => {
    const m = await s.seedMember({ archived: true });
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95]],
    });
    expect(dataOf<ListItem[]>(await s.list({ memberId: m.id })).length).toBe(1);
  });

  test("BR-REC-153 each item holds exactly id, typeId, typeName, date, isEstimated and valueCount", async () => {
    const { m } = await seedHistory();
    const [item] = dataOf<ListItem[]>(await s.list({ memberId: m.id }));
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "date",
      "id",
      "isEstimated",
      "typeId",
      "typeName",
      "valueCount",
    ]);
  });
});

describe("E27 pages (BR-REC-89, 155, D18)", () => {
  let busy: SeededMember;
  let allDatesDesc: string[];

  beforeAll(async () => {
    busy = await s.seedMember();
    // 30 body-composition assessments on 30 different days, one value each
    const dates = Array.from({ length: 30 }, (_, i) =>
      addDays("2025-01-01", i * 7),
    );
    for (const date of dates) {
      await s.seedAssessment({
        member: busy,
        type: body,
        date,
        values: [[body.metric("Weight"), 90]],
      });
    }
    allDatesDesc = [...dates].sort().reverse();
  });

  test("BR-REC-155 the default page holds 10 rows and meta says page 1, pageSize 10, total, totalPages", async () => {
    const reply = await s.list({ memberId: busy.id });
    expect(dataOf<ListItem[]>(reply).length).toBe(10);
    expect(metaOf(reply)).toEqual({
      page: 1,
      pageSize: 10,
      total: 30,
      totalPages: 3,
    });
  });

  test("BR-REC-89 25 per page: page 1 holds the 25 newest, page 2 the other 5", async () => {
    const first = await s.list({ memberId: busy.id, pageSize: 25, page: 1 });
    const second = await s.list({ memberId: busy.id, pageSize: 25, page: 2 });
    expect(dataOf<ListItem[]>(first).map((i) => i.date)).toEqual(
      allDatesDesc.slice(0, 25),
    );
    expect(dataOf<ListItem[]>(second).map((i) => i.date)).toEqual(
      allDatesDesc.slice(25),
    );
    expect(metaOf(first)).toEqual({
      page: 1,
      pageSize: 25,
      total: 30,
      totalPages: 2,
    });
    expect(metaOf(second).page).toBe(2);
  });

  test("BR-REC-155 the pages never repeat or skip a row", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const items = dataOf<ListItem[]>(
        await s.list({ memberId: busy.id, pageSize: 10, page }),
      );
      seen.push(...items.map((i) => i.date));
    }
    expect(seen).toEqual(allDatesDesc);
  });

  test("BR-REC-155 the oldest-first order pages the same rows the other way round", async () => {
    const items = dataOf<ListItem[]>(
      await s.list({ memberId: busy.id, pageSize: 100, sortDir: "asc" }),
    );
    expect(items.map((i) => i.date)).toEqual([...allDatesDesc].reverse());
  });

  test("D18 pageSize=3 gives the latest three (the member page's Recent block)", async () => {
    const reply = await s.list({ memberId: busy.id, pageSize: 3 });
    expect(dataOf<ListItem[]>(reply).map((i) => i.date)).toEqual(
      allDatesDesc.slice(0, 3),
    );
    expect(metaOf(reply).totalPages).toBe(10);
  });

  test("BR-REC-155 a page past the end is an empty list, not an error; total stays", async () => {
    const reply = await s.list({ memberId: busy.id, pageSize: 25, page: 9 });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
    expect(metaOf(reply).total).toBe(30);
    expect(metaOf(reply).totalPages).toBe(2);
  });

  test("BR-REC-155 pageSize 100 is allowed", async () => {
    const reply = await s.list({ memberId: busy.id, pageSize: 100 });
    expect(dataOf<ListItem[]>(reply).length).toBe(30);
  });

  for (const pageSize of ["500", "101", "0", "-5", "abc", "2.5"]) {
    test(`BR-REC-155 pageSize=${pageSize} is 400 VALIDATION_ERROR`, async () => {
      expectInvalid(await s.list({ memberId: busy.id, pageSize }), "pageSize");
    });
  }

  for (const page of ["0", "-1", "abc", "1.5"]) {
    test(`BR-REC-155 page=${page} is 400 VALIDATION_ERROR`, async () => {
      expectInvalid(await s.list({ memberId: busy.id, page }), "page");
    });
  }

  test("BR-REC-155 an unknown sort field is ignored: the order stays date, newest first", async () => {
    const reply = await s.list({
      memberId: busy.id,
      pageSize: 100,
      sortBy: "valueCount",
    });
    expect(dataOf<ListItem[]>(reply).map((i) => i.date)).toEqual(allDatesDesc);
  });
});

describe("E27 empty answers and bad queries (D10, BR-REC-154)", () => {
  test("D10 a member with no assessments gets an empty list (200, total 0, one page)", async () => {
    const m = await s.seedMember();
    const reply = await s.list({ memberId: m.id });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
    expect(metaOf(reply)).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
  });

  test("D10 an unknown memberId gets an empty list, not 404", async () => {
    const reply = await s.list({ memberId: UNKNOWN_ID });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
    expect(metaOf(reply).total).toBe(0);
    expect(metaOf(reply).totalPages).toBe(1);
  });

  test("D20 an unknown typeId gets an empty list, not 404", async () => {
    const { m } = await seedHistory();
    const reply = await s.list({ memberId: m.id, typeId: OTHER_UNKNOWN_ID });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
    expect(metaOf(reply).total).toBe(0);
    expect(metaOf(reply).totalPages).toBe(1);
  });

  test("D10 a filter that matches nothing for this member is an empty list", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-12-30",
      values: [[body.metric("Weight"), 94]],
    });
    const reply = await s.list({ memberId: m.id, typeId: fitness.id });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
    expect(metaOf(reply).total).toBe(0);
  });

  test("BR-REC-154 a missing memberId is 400 VALIDATION_ERROR on memberId", async () => {
    expectInvalid(await s.list({}), "memberId");
  });

  test("BR-REC-154 a malformed memberId is 400 VALIDATION_ERROR on memberId", async () => {
    expectInvalid(await s.list({ memberId: "not-an-id" }), "memberId");
  });

  test("BR-REC-154 a malformed typeId is 400 VALIDATION_ERROR on typeId", async () => {
    const m = await s.seedMember();
    expectInvalid(await s.list({ memberId: m.id, typeId: "nope" }), "typeId");
  });

  test("BR-REC-154 sortDir=sideways is 400 VALIDATION_ERROR on sortDir", async () => {
    const m = await s.seedMember();
    expectInvalid(
      await s.list({ memberId: m.id, sortDir: "sideways" }),
      "sortDir",
    );
  });

  test("BR-REC-159 without a sign-in the list is 401 UNAUTHORIZED", async () => {
    const m = await s.seedMember();
    const reply = await s.get("/api/assessments", { memberId: m.id }, null);
    expectError(reply, 401, "UNAUTHORIZED");
  });
});
