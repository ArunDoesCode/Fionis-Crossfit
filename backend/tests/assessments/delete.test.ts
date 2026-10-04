import { beforeAll, describe, expect, test } from "bun:test";

import { UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  expectError,
  expectInvalid,
  type ListItem,
  type SaveResult,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E30 DELETE /api/assessments/:assessmentId: delete an assessment with its values.
// BR-REC-88 (delete asks how many results go; due dates update at once), BR-REC-165 (the one hard delete),
// BR-REC-58 (archived members), BR-REC-92 (any time), build clarification D9.

const s = useAssessmentsSuite();

let body: SeededType;

beforeAll(async () => {
  body = await s.seedType();
});

describe("E30 delete (BR-REC-88, 165, D9)", () => {
  test("BR-REC-88 deleting an assessment with 9 results says removed 9 (here 4)", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [
        [body.metric("Weight"), 95.5],
        [body.metric("Visceral fat"), 8],
        [body.metric("Plank"), 122],
        [body.metric("Waist"), 91],
      ],
    });
    const result = dataOf<{ removed: number }>(await s.remove(a.id));
    expect(result).toEqual({ removed: 4 });
  });

  test("BR-REC-165 the assessment and its values are gone from the database (a hard delete)", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ],
    });
    expect((await s.remove(a.id)).status).toBe(200);
    expect(await s.assessmentRow(a.id)).toBeUndefined();
    expect((await s.measurementRows(a.id)).length).toBe(0);
    expect((await s.memberMeasurementRows(m.id)).length).toBe(0);
  });

  test("BR-REC-88 afterwards E28 and a second E30 are 404 NOT_FOUND", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    await s.remove(a.id);
    expectError(await s.detail(a.id), 404, "NOT_FOUND");
    expectError(await s.remove(a.id), 404, "NOT_FOUND");
  });

  test("BR-REC-88 the form of that date no longer shows an existing assessment, and the list drops the row", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expect(
      (await s.formOf(m.id, body.id, "2025-03-12")).existing,
    ).not.toBeNull();
    await s.remove(a.id);
    expect((await s.formOf(m.id, body.id, "2025-03-12")).existing).toBeNull();
    expect(dataOf<ListItem[]>(await s.list({ memberId: m.id }))).toEqual([]);
  });

  test("BR-REC-81 the deleted values are no longer anyone's 'previous'", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const later = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-06-12",
      values: [[body.metric("Weight"), 94]],
    });
    await s.remove(later.id);
    const form = await s.formOf(m.id, body.id, "2025-12-30");
    const weight = form.metrics.find((x) => x.name === "Weight");
    expect(weight?.previous).toEqual({
      value: 95.5,
      on: "2025-03-12",
      isEstimated: false,
    });
  });

  test("BR-REC-88 deleting the latest assessment makes E16 lastAssessedOn fall back to the one before", async () => {
    const m = await s.seedMember();
    await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const latest = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-09-12",
      values: [[body.metric("Weight"), 94]],
    });
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2025-09-12");
    await s.remove(latest.id);
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2025-03-12");
  });

  test("BR-REC-88 deleting the only assessment makes E16 lastAssessedOn null (never assessed)", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2025-03-12");
    await s.remove(a.id);
    expect((await s.memberListItem(m))?.lastAssessedOn).toBeNull();
  });

  test("BR-REC-88 the member's other assessments are untouched", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const keep = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-06-12",
      values: [
        [body.metric("Weight"), 94],
        [body.metric("Waist"), 90],
      ],
    });
    expect((await s.remove(a.id)).status).toBe(200);
    expect((await s.assessmentRow(keep.id))?.assessedOn).toBe("2025-06-12");
    expect(await s.storedValues(keep.id)).toEqual({
      [body.metric("Weight").id]: 94,
      [body.metric("Waist").id]: 90,
    });
  });

  test("BR-REC-88 another member's assessment of the same type and date is untouched", async () => {
    const m = await s.seedMember();
    const other = await s.seedMember();
    const mine = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const theirs = await s.seedAssessment({
      member: other,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 80]],
    });
    expect((await s.remove(mine.id)).status).toBe(200);
    expect(await s.storedValues(theirs.id)).toEqual({
      [body.metric("Weight").id]: 80,
    });
  });

  test("BR-REC-19 after a delete the same date can be recorded again as a new assessment", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    await s.remove(a.id);
    const again = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [[body.metric("Weight"), 96]]),
    );
    expect(again.created).toBe(true);
    expect(again.assessmentId).not.toBe(a.id);
  });

  test("D9 an assessment with no stored values deletes with removed 0", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [],
    });
    expect(dataOf<{ removed: number }>(await s.remove(a.id)).removed).toBe(0);
    expect(await s.assessmentRow(a.id)).toBeUndefined();
  });

  test("D9 removed counts values of turned-off measurements too", async () => {
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
    expect(dataOf<{ removed: number }>(await s.remove(a.id)).removed).toBe(2);
  });

  test("BR-REC-58 an archived member's assessment can be deleted", async () => {
    const m = await s.seedMember({ archived: true });
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expect(dataOf<{ removed: number }>(await s.remove(a.id)).removed).toBe(1);
  });

  test("D4 an assessment of a turned-off type can be deleted", async () => {
    const t = await s.seedType({ isActive: false });
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [[t.metric("Weight"), 95]],
    });
    expect(dataOf<{ removed: number }>(await s.remove(a.id)).removed).toBe(1);
  });

  test("BR-REC-153 the answer holds exactly removed, a JSON number", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const result = dataOf<{ removed: number }>(await s.remove(a.id));
    expect(Object.keys(result)).toEqual(["removed"]);
    expect(typeof result.removed).toBe("number");
  });
});

describe("E30 errors (BR-REC-154)", () => {
  test("BR-REC-154 an assessment that exists nowhere is 404 NOT_FOUND", async () => {
    expectError(await s.remove(UNKNOWN_ID), 404, "NOT_FOUND");
  });

  test("BR-REC-154 an id that is not an id is 400 VALIDATION_ERROR", async () => {
    expectInvalid(await s.remove("not-an-id"));
  });
});
