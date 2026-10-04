import { beforeAll, describe, expect, test } from "bun:test";

import {
  type Detail,
  dataOf,
  expectError,
  type SaveResult,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// E26 POST /api/assessments: record, edit and remove values (upsert on member + type + date).
// BR-REC-12 (durations in seconds), BR-REC-19 (one per member + type + date, partial entry, estimated),
// BR-REC-77 (clearing a saved value), BR-REC-78 (a save that would leave no value at all is refused), BR-REC-83 (before the join date saves),
// BR-REC-86 (saving twice never makes two), BR-REC-163 / 164 (a day is a day, values are numbers),
// BR-REC-166 (values copy member and date), build clarifications D1, D2, D4, D6.

const s = useAssessmentsSuite();

/** weight (1 decimal), visceral fat (0), plank (duration), waist (1) */
let body: SeededType;

beforeAll(async () => {
  body = await s.seedType();
});

describe("E26 create and edit (BR-REC-19, 86)", () => {
  test("BR-REC-19 the first save of a member + type + date creates the assessment: created true, one row, one value row each", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, body, "2025-12-30", [
      [body.metric("Weight"), 94],
      [body.metric("Visceral fat"), 8],
    ]);
    const result = dataOf<SaveResult>(reply);
    expect(result.created).toBe(true);
    expect(result.saved).toBe(2);
    expect(result.removed).toBe(0);
    const rows = await s.assessmentRows(m.id, body.id);
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(result.assessmentId);
    expect(rows[0]?.assessedOn).toBe("2025-12-30");
    expect(rows[0]?.isEstimated).toBe(false);
    expect(await s.storedValues(result.assessmentId)).toEqual({
      [body.metric("Weight").id]: 94,
      [body.metric("Visceral fat").id]: 8,
    });
  });

  test("BR-REC-19 saving body composition twice on 2025-12-30 gives one record, the second answer says created false", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    const second = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.assessmentId).toBe(first.assessmentId);
    expect((await s.assessmentRows(m.id)).length).toBe(1);
    expect((await s.measurementRows(first.assessmentId)).length).toBe(1);
  });

  test("BR-REC-19 saving again with other values edits the same assessment: still one row per measurement", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [
        [body.metric("Weight"), 94],
        [body.metric("Waist"), 90],
      ]),
    );
    const second = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [
        [body.metric("Weight"), 93.5],
        [body.metric("Visceral fat"), 8],
      ]),
    );
    expect(second.created).toBe(false);
    expect(second.assessmentId).toBe(first.assessmentId);
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [body.metric("Weight").id]: 93.5,
      [body.metric("Waist").id]: 90,
      [body.metric("Visceral fat").id]: 8,
    });
    expect((await s.assessmentRows(m.id)).length).toBe(1);
  });

  test("BR-REC-19 partial entry is allowed: blank fields are simply not recorded", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [
        [body.metric("Weight"), 94],
        [body.metric("Plank"), 122],
      ]),
    );
    expect(result.saved).toBe(2);
    const detail = dataOf<Detail>(await s.detail(result.assessmentId));
    expect(detail.values.map((v) => v.name)).toEqual(["Weight", "Plank"]);
  });

  test("BR-REC-19 a one-value entry is a complete save", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Waist"), 88]]),
    );
    expect(result.saved).toBe(1);
    expect((await s.measurementRows(result.assessmentId)).length).toBe(1);
  });

  test("BR-REC-19 the date can be marked estimated: the flag is stored and shown", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(
        m,
        body,
        "2025-09-01",
        [[body.metric("Weight"), 96]],
        true,
      ),
    );
    expect((await s.assessmentRow(result.assessmentId))?.isEstimated).toBe(
      true,
    );
    const detail = dataOf<Detail>(await s.detail(result.assessmentId));
    expect(detail.isEstimated).toBe(true);
  });

  test("D2 the body's isEstimated always replaces the stored flag", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(
        m,
        body,
        "2025-09-01",
        [[body.metric("Weight"), 96]],
        true,
      ),
    );
    await s.saveValues(
      m,
      body,
      "2025-09-01",
      [[body.metric("Weight"), 96]],
      false,
    );
    expect((await s.assessmentRow(first.assessmentId))?.isEstimated).toBe(
      false,
    );
    await s.saveValues(
      m,
      body,
      "2025-09-01",
      [[body.metric("Weight"), 96]],
      true,
    );
    expect((await s.assessmentRow(first.assessmentId))?.isEstimated).toBe(true);
  });

  test("BR-REC-19 the same type on another date is another assessment", async () => {
    const m = await s.seedMember();
    const a = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-09-30", [
        [body.metric("Weight"), 95.5],
      ]),
    );
    const b = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(b.assessmentId).not.toBe(a.assessmentId);
    expect((await s.assessmentRows(m.id)).length).toBe(2);
  });

  test("BR-REC-19 another assessment type on the same date is another assessment", async () => {
    const m = await s.seedMember();
    const fitness = await s.seedType({
      metrics: [{ name: "Fran", datatype: "duration", better: "lower" }],
    });
    const a = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    const b = dataOf<SaveResult>(
      await s.saveValues(m, fitness, "2025-12-30", [
        [fitness.metric("Fran"), 300],
      ]),
    );
    expect(b.created).toBe(true);
    expect(b.assessmentId).not.toBe(a.assessmentId);
    expect((await s.assessmentRows(m.id)).length).toBe(2);
  });

  test("BR-REC-19 another member's assessment of the same type and date is untouched", async () => {
    const m = await s.seedMember();
    const other = await s.seedMember();
    const theirs = dataOf<SaveResult>(
      await s.saveValues(other, body, "2025-12-30", [
        [body.metric("Weight"), 80],
      ]),
    );
    const mine = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    expect(mine.created).toBe(true);
    expect(mine.assessmentId).not.toBe(theirs.assessmentId);
    expect(await s.storedValues(theirs.assessmentId)).toEqual({
      [body.metric("Weight").id]: 80,
    });
  });

  test("BR-REC-83 a date before the join date saves (the warning is only shown)", async () => {
    const m = await s.seedMember({ joinedOn: "2025-06-01" });
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2024-01-15", [[body.metric("Weight"), 99]]),
    );
    expect(result.created).toBe(true);
    expect((await s.assessmentRow(result.assessmentId))?.assessedOn).toBe(
      "2024-01-15",
    );
  });

  test("BR-REC-58 an archived member can be recorded for", async () => {
    const m = await s.seedMember({ archived: true });
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    expect(result.created).toBe(true);
    expect((await s.assessmentRows(m.id)).length).toBe(1);
  });

  test("BR-REC-83 today (the gym's day) saves", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, s.today(), [[body.metric("Weight"), 94]]),
    );
    expect(result.created).toBe(true);
    expect((await s.assessmentRow(result.assessmentId))?.assessedOn).toBe(
      s.today(),
    );
  });

  test("BR-REC-163 the saved day is the typed calendar day, whatever the gym's time zone", async () => {
    const m = await s.seedMember();
    try {
      const cases: [tz: string, date: string][] = [
        ["Pacific/Kiritimati", "2025-01-15"],
        ["Pacific/Pago_Pago", "2025-02-15"],
        ["Asia/Kolkata", "2025-03-15"],
      ];
      for (const [tz, date] of cases) {
        await s.setTimezone(tz);
        const result = dataOf<SaveResult>(
          await s.saveValues(m, body, date, [[body.metric("Weight"), 94]]),
        );
        expect((await s.assessmentRow(result.assessmentId))?.assessedOn).toBe(
          date,
        );
        const detail = dataOf<Detail>(await s.detail(result.assessmentId));
        expect(detail.date).toBe(date);
      }
    } finally {
      await s.setTimezone("Asia/Kolkata");
    }
  });

  test("BR-REC-166 each value copies its assessment's member and date", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [
        [body.metric("Weight"), 94],
        [body.metric("Plank"), 122],
      ]),
    );
    // a later edit that adds a value copies member and date onto the new value too
    await s.saveValues(m, body, "2025-12-30", [[body.metric("Waist"), 90]]);
    const rows = await s.measurementRows(result.assessmentId);
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.memberId).toBe(m.id);
      expect(row.measuredOn).toBe("2025-12-30");
    }
  });

  test("BR-REC-153 BR-REC-164 what E28 returns for a saved value is a JSON number", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ]),
    );
    const detail = dataOf<Detail>(await s.detail(result.assessmentId));
    expect(detail.values.map((v) => [v.name, v.value])).toEqual([
      ["Weight", 95.5],
      ["Plank", 122],
    ]);
    for (const v of detail.values) expect(typeof v.value).toBe("number");
  });

  test("BR-REC-88 a save shows in E16 lastAssessedOn at once: the latest date wins, an older back-filled one does not lower it", async () => {
    const m = await s.seedMember();
    expect((await s.memberListItem(m))?.lastAssessedOn).toBeNull();
    await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]);
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2025-12-30");
    await s.saveValues(m, body, "2025-09-30", [[body.metric("Weight"), 95.5]]);
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2025-12-30");
    await s.saveValues(m, body, "2026-03-01", [[body.metric("Weight"), 93]]);
    expect((await s.memberListItem(m))?.lastAssessedOn).toBe("2026-03-01");
  });

  test("BR-REC-153 the answer holds exactly assessmentId, created, saved and removed", async () => {
    const m = await s.seedMember();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    expect(Object.keys(result).sort()).toEqual([
      "assessmentId",
      "created",
      "removed",
      "saved",
    ]);
  });

  test("BR-REC-157 unknown keys in an E26 body are ignored, not refused", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: body.id,
      date: "2025-12-30",
      isEstimated: false,
      nickname: "x",
      values: [{ metricId: body.metric("Weight").id, value: 94 }],
    });
    expect(dataOf<SaveResult>(reply).created).toBe(true);
  });
});

describe("E26 set, leave out, remove (BR-REC-77, D2)", () => {
  test("BR-REC-77 the spec example: Weight 94 sets, Plank null removes, Waist null with nothing stored does nothing", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ]),
    );
    const edit = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 94],
        [body.metric("Plank"), null],
        [body.metric("Waist"), null],
      ]),
    );
    expect(edit.assessmentId).toBe(first.assessmentId);
    expect(edit.created).toBe(false);
    expect(edit.saved).toBe(1);
    expect(edit.removed).toBe(1);
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [body.metric("Weight").id]: 94,
    });
  });

  test("BR-REC-77 clearing Plank on 12 Mar makes Plank gone from that date (E25 and E28)", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ]),
    );
    await s.saveValues(m, body, "2025-03-12", [
      [body.metric("Weight"), 95.5],
      [body.metric("Plank"), null],
    ]);
    const form = await s.formOf(m.id, body.id, "2025-03-12");
    expect(Object.keys(form.existing?.values ?? {})).toEqual([
      body.metric("Weight").id,
    ]);
    const detail = dataOf<Detail>(await s.detail(first.assessmentId));
    expect(detail.values.map((v) => v.name)).toEqual(["Weight"]);
  });

  test("D2 a measurement left out of the body is not touched", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
        [body.metric("Waist"), 91],
      ]),
    );
    const edit = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [[body.metric("Weight"), 93]]),
    );
    expect(edit.saved).toBe(1);
    expect(edit.removed).toBe(0);
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [body.metric("Weight").id]: 93,
      [body.metric("Plank").id]: 122,
      [body.metric("Waist").id]: 91,
    });
  });

  test("D2 a null for a measurement that holds no value is a no-op: removed 0, nothing changes", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
      ]),
    );
    const edit = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), null],
        [body.metric("Waist"), null],
      ]),
    );
    expect(edit.removed).toBe(0);
    expect(edit.saved).toBe(1);
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [body.metric("Weight").id]: 95.5,
    });
  });

  test("D2 saved counts every non-null entry written, even one with an unchanged value", async () => {
    const m = await s.seedMember();
    await s.saveValues(m, body, "2025-03-12", [
      [body.metric("Weight"), 95.5],
      [body.metric("Waist"), 91],
    ]);
    const again = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Waist"), 90],
      ]),
    );
    expect(again.saved).toBe(2);
    expect(again.removed).toBe(0);
  });

  test("D2 removed counts only the stored values that went, saved only the non-null entries", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
        [body.metric("Waist"), 91],
      ]),
    );
    const edit = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 94],
        [body.metric("Visceral fat"), 8],
        [body.metric("Plank"), null],
        [body.metric("Waist"), null],
      ]),
    );
    expect(edit.saved).toBe(2);
    expect(edit.removed).toBe(2);
    expect(await s.storedValues(first.assessmentId)).toEqual({
      [body.metric("Weight").id]: 94,
      [body.metric("Visceral fat").id]: 8,
    });
  });

  test("D2 a removed value can be entered again later", async () => {
    const m = await s.seedMember();
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ]),
    );
    await s.saveValues(m, body, "2025-03-12", [
      [body.metric("Weight"), 95.5],
      [body.metric("Plank"), null],
    ]);
    const back = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [[body.metric("Plank"), 130]]),
    );
    expect(back.created).toBe(false);
    expect(back.assessmentId).toBe(first.assessmentId);
    expect(
      (await s.storedValues(first.assessmentId))[body.metric("Plank").id],
    ).toBe(130);
  });

  test("D2 a removal only touches the given date: the same measurement on another date keeps its value", async () => {
    const m = await s.seedMember();
    const march = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), 95.5],
        [body.metric("Plank"), 122],
      ]),
    );
    const june = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-06-12", [
        [body.metric("Weight"), 94],
        [body.metric("Plank"), 130],
      ]),
    );
    await s.saveValues(m, body, "2025-03-12", [
      [body.metric("Weight"), 95.5],
      [body.metric("Plank"), null],
    ]);
    expect(await s.storedValues(june.assessmentId)).toEqual({
      [body.metric("Weight").id]: 94,
      [body.metric("Plank").id]: 130,
    });
    expect(Object.keys(await s.storedValues(march.assessmentId))).toEqual([
      body.metric("Weight").id,
    ]);
  });
});

describe("E26 nothing filled in a new assessment (BR-REC-78, D2)", () => {
  test("BR-REC-78 an empty values list for a new assessment is refused 400 NO_VALUES and no assessment is made", async () => {
    const m = await s.seedMember();
    const reply = await s.save({
      memberId: m.id,
      typeId: body.id,
      date: "2025-12-30",
      isEstimated: false,
      values: [],
    });
    expectError(reply, 400, "NO_VALUES");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("BR-REC-78 values that are all null for a new assessment are refused 400 NO_VALUES and no assessment is made", async () => {
    const m = await s.seedMember();
    const reply = await s.saveValues(m, body, "2025-12-30", [
      [body.metric("Weight"), null],
      [body.metric("Plank"), null],
    ]);
    expectError(reply, 400, "NO_VALUES");
    expect((await s.assessmentRows(m.id)).length).toBe(0);
  });

  test("BR-REC-78 a refused new assessment does not leave the estimated flag or a half-made row behind: the next save is a create", async () => {
    const m = await s.seedMember();
    expectError(
      await s.saveValues(m, body, "2025-12-30", [], true),
      400,
      "NO_VALUES",
    );
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-12-30", [[body.metric("Weight"), 94]]),
    );
    expect(result.created).toBe(true);
    expect((await s.assessmentRow(result.assessmentId))?.isEstimated).toBe(
      false,
    );
  });
});

describe("E26 an edit that would leave no value at all is refused (BR-REC-78, D2)", () => {
  test("D2 nulls that remove every remaining value are refused 400 NO_VALUES: nothing is removed, the flag is not changed, no log row", async () => {
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
    const reply = await s.saveValues(
      m,
      body,
      "2025-03-12",
      [
        [body.metric("Weight"), null],
        [body.metric("Plank"), null],
      ],
      true,
    );
    expectError(reply, 400, "NO_VALUES");
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
      [body.metric("Plank").id]: 122,
    });
    expect((await s.assessmentRow(a.id))?.isEstimated).toBe(false);
    expect((await s.assessmentRows(m.id)).length).toBe(1);
    expect((await s.audit({ entityId: a.id })).length).toBe(0);
  });

  test("D2 nulls for measurements that hold nothing, listed next to the nulls that remove everything, do not save it", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const reply = await s.saveValues(m, body, "2025-03-12", [
      [body.metric("Weight"), null],
      [body.metric("Plank"), null],
      [body.metric("Waist"), null],
    ]);
    expectError(reply, 400, "NO_VALUES");
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
    });
  });

  test("D2 the last remaining value cannot be removed through E26, even after earlier removals (use E30)", async () => {
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
    const first = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [[body.metric("Plank"), null]]),
    );
    expect(first.removed).toBe(1);
    const second = await s.saveValues(m, body, "2025-03-12", [
      [body.metric("Weight"), null],
    ]);
    expectError(second, 400, "NO_VALUES");
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
    });
    expect(await s.assessmentRow(a.id)).toBeDefined();
  });
});

describe("E26 an edit that leaves a value stored is fine (BR-REC-77, 78, D2)", () => {
  test("BR-REC-78 an empty values list on a saved assessment is 200: saved 0, removed 0, created false, the same assessment, values untouched", async () => {
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
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [], true),
    );
    expect(result).toEqual({
      assessmentId: a.id,
      created: false,
      saved: 0,
      removed: 0,
    });
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
      [body.metric("Plank").id]: 122,
    });
    for (const row of await s.measurementRows(a.id)) {
      expect(row.measuredOn).toBe("2025-03-12");
    }
    expect((await s.assessmentRows(m.id)).length).toBe(1);
  });

  test("D2 an empty values list replaces the estimated flag: false to true and back", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      isEstimated: false,
      values: [[body.metric("Weight"), 95.5]],
    });
    dataOf<SaveResult>(await s.saveValues(m, body, "2025-03-12", [], true));
    expect((await s.assessmentRow(a.id))?.isEstimated).toBe(true);
    expect(dataOf<Detail>(await s.detail(a.id)).isEstimated).toBe(true);
    dataOf<SaveResult>(await s.saveValues(m, body, "2025-03-12", [], false));
    expect((await s.assessmentRow(a.id))?.isEstimated).toBe(false);
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
    });
  });

  test("D2 an empty values list on a saved assessment writes exactly one assessment.save change-log row", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    await s.saveValues(m, body, "2025-03-12", [], true);
    const rows = await s.audit({ entityId: a.id });
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe("assessment.save");
  });

  test("BR-REC-77 nulls that remove only some of the stored values are 200: the removed ones go, the others stay", async () => {
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
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Plank"), null],
        [body.metric("Waist"), null],
      ]),
    );
    expect(result).toEqual({
      assessmentId: a.id,
      created: false,
      saved: 0,
      removed: 2,
    });
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
    });
  });

  test("D2 a null for a measurement that holds nothing, on an assessment that keeps its other values, is a no-op: 200, removed 0", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [[body.metric("Plank"), null]]),
    );
    expect(result.created).toBe(false);
    expect(result.saved).toBe(0);
    expect(result.removed).toBe(0);
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
    });
  });

  test("D2 removing every stored value is fine when the same save sets another measurement", async () => {
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
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [
        [body.metric("Weight"), null],
        [body.metric("Plank"), null],
        [body.metric("Waist"), 90],
      ]),
    );
    expect(result.saved).toBe(1);
    expect(result.removed).toBe(2);
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Waist").id]: 90,
    });
  });

  test("D2 an edit may send only the changed measurement: the others stay as they are", async () => {
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
    const result = dataOf<SaveResult>(
      await s.saveValues(m, body, "2025-03-12", [[body.metric("Waist"), 90]]),
    );
    expect(result.saved).toBe(1);
    expect(result.removed).toBe(0);
    expect(await s.storedValues(a.id)).toEqual({
      [body.metric("Weight").id]: 95.5,
      [body.metric("Plank").id]: 122,
      [body.metric("Waist").id]: 90,
    });
  });
});

describe("E26 an untouched value is never re-rounded (D2, setup C9)", () => {
  /** Weight shows 2 decimals when 95.55 is stored, then setup lowers it to 1 decimal. */
  async function seedAfterDecimalsChange() {
    const t = await s.seedType({
      metrics: [
        { name: "Weight", unit: "kg", decimals: 2, better: "lower" },
        { name: "Waist", unit: "cm", decimals: 1, better: "lower" },
      ],
    });
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: t,
      date: "2025-03-12",
      values: [
        [t.metric("Weight"), 95.55],
        [t.metric("Waist"), 91],
      ],
    });
    await s.setMetricDecimals(t.metric("Weight").id, 1);
    return { t, m, a };
  }

  test("D2 a stored 95.55 stays 95.55 when decimals is now 1 and the save changes only another measurement", async () => {
    const { t, m, a } = await seedAfterDecimalsChange();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, t, "2025-03-12", [[t.metric("Waist"), 90]]),
    );
    expect(result.assessmentId).toBe(a.id);
    expect(result.saved).toBe(1);
    expect(await s.storedValues(a.id)).toEqual({
      [t.metric("Weight").id]: 95.55,
      [t.metric("Waist").id]: 90,
    });
    const detail = dataOf<Detail>(await s.detail(a.id));
    expect(detail.values.map((v) => [v.name, v.value])).toEqual([
      ["Weight", 95.55],
      ["Waist", 90],
    ]);
  });

  test("D2 the change log's after-snapshot still shows 95.55 (and so does the before-snapshot)", async () => {
    const { t, m, a } = await seedAfterDecimalsChange();
    await s.saveValues(m, t, "2025-03-12", [[t.metric("Waist"), 90]]);
    const rows = await s.audit({ entityId: a.id });
    expect(rows.length).toBe(1);
    expect(rows[0]?.before).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values: {
        [t.metric("Weight").id]: 95.55,
        [t.metric("Waist").id]: 91,
      },
    });
    expect(rows[0]?.after).toEqual({
      date: "2025-03-12",
      isEstimated: false,
      values: {
        [t.metric("Weight").id]: 95.55,
        [t.metric("Waist").id]: 90,
      },
    });
  });

  test("D2 an empty values list (only About changes) leaves the stored 95.55 as it is", async () => {
    const { t, m, a } = await seedAfterDecimalsChange();
    const result = dataOf<SaveResult>(
      await s.saveValues(m, t, "2025-03-12", [], true),
    );
    expect(result.saved).toBe(0);
    expect(await s.storedValues(a.id)).toEqual({
      [t.metric("Weight").id]: 95.55,
      [t.metric("Waist").id]: 91,
    });
    const form = await s.formOf(m.id, t.id, "2025-03-12");
    expect(form.existing?.values[t.metric("Weight").id]).toBe(95.55);
  });

  test("BR-REC-76 a measurement that is sent is rounded to its current decimals: 95.55 sent for a 1-decimal measurement is stored as 95.6", async () => {
    const { t, m, a } = await seedAfterDecimalsChange();
    dataOf<SaveResult>(
      await s.saveValues(m, t, "2025-03-12", [[t.metric("Weight"), 95.55]]),
    );
    expect((await s.storedValues(a.id))[t.metric("Weight").id]).toBe(95.6);
  });
});
