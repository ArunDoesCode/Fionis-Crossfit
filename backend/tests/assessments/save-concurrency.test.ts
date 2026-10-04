import { beforeAll, describe, expect, test } from "bun:test";

import {
  dataOf,
  type SaveResult,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E26 under parallel requests: BR-REC-19 (one per member + type + date), BR-REC-86 (saving twice never
// makes two assessments; a retry is the same upsert), build clarification D6 (the member row is locked,
// so racing saves end as one row and the second answers created false).

const s = useAssessmentsSuite();

let body: SeededType;

beforeAll(async () => {
  body = await s.seedType();
});

describe("E26 parallel saves (BR-REC-86, D6)", () => {
  test("BR-REC-86 eight identical saves at once make one assessment: one created true, no failure", async () => {
    const m = await s.seedMember();
    const replies = await Promise.all(
      Array.from({ length: 8 }, () =>
        s.saveValues(m, body, "2025-12-30", [
          [body.metric("Weight"), 94],
          [body.metric("Plank"), 122],
        ]),
      ),
    );
    const results = replies.map((r) => dataOf<SaveResult>(r));
    expect(results.filter((r) => r.created).length).toBe(1);
    expect(new Set(results.map((r) => r.assessmentId)).size).toBe(1);
    const rows = await s.assessmentRows(m.id, body.id);
    expect(rows.length).toBe(1);
    expect(await s.storedValues(rows[0]?.id as string)).toEqual({
      [body.metric("Weight").id]: 94,
      [body.metric("Plank").id]: 122,
    });
  });

  test("D6 racing saves that fill different measurements end as one assessment holding all of them", async () => {
    const m = await s.seedMember();
    const names = ["Weight", "Visceral fat", "Plank", "Waist"];
    const replies = await Promise.all(
      names.map((name, i) =>
        s.saveValues(m, body, "2025-12-30", [[body.metric(name), 10 + i]]),
      ),
    );
    const results = replies.map((r) => dataOf<SaveResult>(r));
    expect(results.filter((r) => r.created).length).toBe(1);
    const rows = await s.assessmentRows(m.id, body.id);
    expect(rows.length).toBe(1);
    const stored = await s.storedValues(rows[0]?.id as string);
    expect(Object.keys(stored).length).toBe(4);
    names.forEach((name, i) => {
      expect(stored[body.metric(name).id]).toBe(10 + i);
    });
  });

  test("D6 racing saves of the same measurement leave one value row holding one of the sent values", async () => {
    const m = await s.seedMember();
    const sent = [90, 91, 92, 93, 94];
    const replies = await Promise.all(
      sent.map((value) =>
        s.saveValues(m, body, "2025-12-30", [[body.metric("Waist"), value]]),
      ),
    );
    for (const reply of replies) dataOf<SaveResult>(reply);
    const rows = await s.assessmentRows(m.id, body.id);
    expect(rows.length).toBe(1);
    const measurementRows = await s.measurementRows(rows[0]?.id as string);
    expect(measurementRows.length).toBe(1);
    expect(sent).toContain(measurementRows[0]?.value as number);
  });

  test("D6 racing saves on different dates of one member each make their own assessment", async () => {
    const m = await s.seedMember();
    const dates = ["2025-09-30", "2025-10-31", "2025-11-30", "2025-12-30"];
    const replies = await Promise.all(
      dates.map((date) =>
        s.saveValues(m, body, date, [[body.metric("Weight"), 94]]),
      ),
    );
    for (const reply of replies) {
      expect(dataOf<SaveResult>(reply).created).toBe(true);
    }
    const rows = await s.assessmentRows(m.id, body.id);
    expect(rows.map((r) => r.assessedOn)).toEqual(dates);
  });

  test("BR-REC-86 a retry after a lost answer is the same upsert: the same assessment, created false, one row", async () => {
    const m = await s.seedMember();
    const payload = {
      memberId: m.id,
      typeId: body.id,
      date: "2025-12-30",
      isEstimated: false,
      values: [{ metricId: body.metric("Weight").id, value: 94 }],
    };
    const first = dataOf<SaveResult>(await s.save(payload));
    const retry = dataOf<SaveResult>(await s.save(payload));
    const third = dataOf<SaveResult>(await s.save(payload));
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(third.created).toBe(false);
    expect(retry.assessmentId).toBe(first.assessmentId);
    expect(third.assessmentId).toBe(first.assessmentId);
    expect((await s.assessmentRows(m.id)).length).toBe(1);
  });
});
