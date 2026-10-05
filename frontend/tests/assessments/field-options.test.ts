// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-91 — every field opens a number keypad; "Next" moves to the next field in order; the last field's
//               key is "Done".
//   D17       — `NumberField` gets `allowNegative` (a +- button next to the decimal keypad), used when the
//               measurement has no lower check limit or one below 0 (Flexibility); both fields get
//               `enterKeyHint` ("next", "done" on the last field).
// Interface: docs/specs/member-records/assessments.md —
//   `@/lib/assessments/fieldOptions`: `canBeNegative(plausibleMin)`: `null` or below 0 -> true;
//   `enterKeyHintFor(index, count)`: `'done'` for the last of `count` fields, else `'next'`.
import { beforeAll, describe, expect, test } from 'bun:test';

interface FieldOptions {
  canBeNegative(plausibleMin: number | null): boolean;
  enterKeyHintFor(index: number, count: number): 'next' | 'done';
}

let options: FieldOptions;

beforeAll(async () => {
  options = (await import('@/lib/assessments/fieldOptions')) as unknown as FieldOptions;
});

describe('D17 canBeNegative: a minus key only where a negative value can make sense', () => {
  test.each<[number | null, boolean]>([
    [null, true], // no lower check limit
    [-5, true], // Flexibility: a limit below 0
    [-0.1, true],
    [-100, true],
    [0, false], // the limit is 0: nothing below 0 is expected
    [0.5, false],
    [10, false],
    [40, false],
  ])('D17 canBeNegative(%s) is %s', (plausibleMin, expected) => {
    expect(options.canBeNegative(plausibleMin)).toBe(expected);
  });
});

describe('BR-REC-91 enterKeyHintFor: "next" on every field, "done" on the last', () => {
  test('BR-REC-91 the last of 15 fields is "done"', () => {
    expect(options.enterKeyHintFor(14, 15)).toBe('done');
  });

  test('BR-REC-91 every other field of 15 is "next"', () => {
    for (let index = 0; index < 14; index++) {
      expect(options.enterKeyHintFor(index, 15)).toBe('next');
    }
  });

  test.each<[number, number, 'next' | 'done']>([
    [0, 1, 'done'], // a single field is also the last
    [0, 2, 'next'],
    [1, 2, 'done'],
    [0, 3, 'next'],
    [1, 3, 'next'],
    [2, 3, 'done'],
    [8, 9, 'done'],
    [7, 9, 'next'],
  ])('BR-REC-91 enterKeyHintFor(%d, %d) is "%s"', (index, count, expected) => {
    expect(options.enterKeyHintFor(index, count)).toBe(expected);
  });

  test('BR-REC-91 exactly one field of a form gets "done"', () => {
    for (const count of [1, 2, 5, 15, 60]) {
      const hints = Array.from({ length: count }, (_, index) =>
        options.enterKeyHintFor(index, count),
      );
      expect(hints.filter((hint) => hint === 'done')).toHaveLength(1);
      expect(hints[count - 1]).toBe('done');
    }
  });
});
