// Spec: docs/specs/member-records/ux.md BR-REC-230: "a partial save's toast says 'Saved 3 for Naveen Kumar ·
// 12 still due'" — example: 3 of 15 saved -> "12 still due". Still due = the assessment's measurements that hold no
// value once this save is done (a value removed by the save is due again; BR-REC-16: blanks stay due).
// Interface: `stillDueAfter(metricIds: string[], stored: Iterable<string>, values: { metricId; value: number | null }[]): number`
//   metricIds = the assessment's measurements; stored = ids that already hold a value; values = the save's values
//   (`value: null` removes that value).
import { describe, expect, test } from 'bun:test';
import { stillDueAfter } from '@/lib/assessments/saveBody';

const ids = Array.from({ length: 15 }, (_, i) => `m${i + 1}`);
const put = (metricId: string, value: number | null = 1) => ({ metricId, value });

describe('BR-REC-230 stillDueAfter', () => {
  test('BR-REC-230 3 of 15 saved on a new assessment -> 12 still due (spec example)', () => {
    expect(stillDueAfter(ids, [], [put('m1'), put('m2'), put('m3')])).toBe(12);
  });

  test('BR-REC-230 every measurement filled -> 0 still due', () => {
    expect(
      stillDueAfter(
        ids,
        [],
        ids.map((id) => put(id)),
      ),
    ).toBe(0);
  });

  test('BR-REC-230 nothing stored and nothing sent -> all still due', () => {
    expect(stillDueAfter(ids, [], [])).toBe(15);
  });

  test('BR-REC-230 values stored earlier still count as held when this save sends other ones', () => {
    expect(stillDueAfter(ids, ['m1', 'm2', 'm3'], [put('m4')])).toBe(11);
  });

  test('BR-REC-230 stored values the save does not touch (not in values) stay held', () => {
    expect(stillDueAfter(ids, ['m1', 'm2'], [])).toBe(13);
  });

  test('BR-REC-230 re-saving a stored measurement is not counted twice', () => {
    expect(stillDueAfter(ids, ['m1', 'm2', 'm3'], [put('m1', 9), put('m2', 9), put('m3', 9)])).toBe(
      12,
    );
  });

  test('BR-REC-230 a value the save removes (null) is due again', () => {
    expect(stillDueAfter(ids, ['m1', 'm2', 'm3'], [put('m2', null)])).toBe(13);
  });

  test('BR-REC-230 removing a value that was never stored changes nothing', () => {
    expect(stillDueAfter(ids, ['m1'], [put('m5', null)])).toBe(14);
  });

  test('BR-REC-230 one save that adds some and removes others', () => {
    // stored m1,m2,m3 ; remove m1 ; add m4,m5 -> held m2,m3,m4,m5 -> 11 due
    expect(stillDueAfter(ids, ['m1', 'm2', 'm3'], [put('m1', null), put('m4'), put('m5')])).toBe(
      11,
    );
  });

  test('BR-REC-230 a value of 0 is a value (still held, not due)', () => {
    expect(stillDueAfter(ids, [], [put('m1', 0)])).toBe(14);
  });

  test('BR-REC-230 accepts any iterable of stored ids (a Set)', () => {
    expect(stillDueAfter(ids, new Set(['m1', 'm2']), [put('m3')])).toBe(12);
  });

  test('BR-REC-230 a one-measurement assessment saved in full -> 0', () => {
    expect(stillDueAfter(['only'], [], [put('only')])).toBe(0);
  });
});
