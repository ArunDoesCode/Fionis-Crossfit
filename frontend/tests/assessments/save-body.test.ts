// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-19 — partial entry is allowed; blank fields are simply not recorded.
//   BR-REC-76 — number fields accept "." or ","; rounded to the measurement's decimals; anything else shows
//               "Enter a number like 95.5".
//   BR-REC-77 — only filled fields are saved; when editing, emptying a saved field removes that value.
//               Example: clear Plank on 12 Mar -> E26 `value: null` -> `removed: 1`.
//   BR-REC-78 — saving with nothing filled is refused ("Enter at least one value").
//   D2        — E26 `values`: a measurement left out is not touched; `{ value: n }` sets it; `{ value: null }`
//               removes the stored value.
// Interface: docs/specs/member-records/assessments.md —
//   `@/lib/assessments/saveBody`: `buildSaveValues(fields)` with `fields` = `{ metricId, datatype, decimals,
//   input, hadValue, unchanged? }[]` in screen order (`input` = typed text for `number`, seconds or `null` for `duration`;
//   `hadValue` = a value is stored on this date) -> `{ ok: true, values: { metricId, value }[], filled, removed }
//   | { ok: false, problems: { metricId, message }[] }`.
//   Fixed line: `ASSESSMENT_TEXT.numberError` = "Enter a number like 95.5" (`@/lib/assessments/text`).
//   `filled === 0` is the screen's `noValues` case, not an error of this function.
import { beforeAll, describe, expect, test } from 'bun:test';

type Decimals = 0 | 1 | 2;
interface Field {
  metricId: string;
  datatype: 'number' | 'duration';
  decimals: Decimals;
  input: string | number | null;
  hadValue: boolean;
  unchanged?: boolean;
}
type Result =
  | {
      ok: true;
      values: { metricId: string; value: number | null }[];
      filled: number;
      removed: number;
    }
  | { ok: false; problems: { metricId: string; message: string }[] };
interface SaveBody {
  buildSaveValues(fields: Field[]): Result;
  leavesNoValue(
    fields: Field[],
    built: { values: { metricId: string; value: number | null }[]; removed: number },
  ): boolean;
}

let saveBody: SaveBody;

beforeAll(async () => {
  saveBody = (await import('@/lib/assessments/saveBody')) as unknown as SaveBody;
});

const WEIGHT = '11111111-1111-4111-8111-111111111111';
const FAT = '22222222-2222-4222-8222-222222222222';
const PLANK = '33333333-3333-4333-8333-333333333333';
const WAIST = '44444444-4444-4444-8444-444444444444';

const NUMBER_ERROR = 'Enter a number like 95.5';

const num = (metricId: string, input: string, hadValue = false, decimals: Decimals = 1): Field => ({
  metricId,
  datatype: 'number',
  decimals,
  input,
  hadValue,
});
const dur = (metricId: string, input: number | null, hadValue = false): Field => ({
  metricId,
  datatype: 'duration',
  decimals: 0,
  input,
  hadValue,
});

describe('BR-REC-19 / 77 buildSaveValues: only filled fields are sent', () => {
  test('BR-REC-19 a filled number is sent as its value', () => {
    expect(saveBody.buildSaveValues([num(WEIGHT, '94')])).toEqual({
      ok: true,
      values: [{ metricId: WEIGHT, value: 94 }],
      filled: 1,
      removed: 0,
    });
  });

  test('BR-REC-19 blank fields with nothing stored are left out of the body', () => {
    expect(
      saveBody.buildSaveValues([
        num(WEIGHT, '94'),
        num(FAT, ''),
        num(WAIST, '   '),
        dur(PLANK, null),
      ]),
    ).toEqual({
      ok: true,
      values: [{ metricId: WEIGHT, value: 94 }],
      filled: 1,
      removed: 0,
    });
  });

  test('BR-REC-19 the values keep the screen order', () => {
    const result = saveBody.buildSaveValues([num(FAT, '17.5'), dur(PLANK, 122), num(WEIGHT, '94')]);
    expect(result).toEqual({
      ok: true,
      values: [
        { metricId: FAT, value: 17.5 },
        { metricId: PLANK, value: 122 },
        { metricId: WEIGHT, value: 94 },
      ],
      filled: 3,
      removed: 0,
    });
  });

  test('BR-REC-19 an empty list of fields gives nothing filled', () => {
    expect(saveBody.buildSaveValues([])).toEqual({ ok: true, values: [], filled: 0, removed: 0 });
  });
});

describe('BR-REC-76 buildSaveValues reads number text like the number field', () => {
  test.each<[string, string, Decimals, number]>([
    ['"95,5" with a comma', '95,5', 1, 95.5], // spec example
    ['a dot', '95.5', 1, 95.5],
    ['rounded to one decimal', '95.56', 1, 95.6],
    ['rounded to no decimals', '2.5', 0, 3],
    ['rounded to two decimals', '1.005', 2, 1.01],
    ['a negative number', '-3,2', 1, -3.2],
    ['outer spaces', '  94 ', 1, 94],
    ['a trailing mark', '95.', 1, 95],
  ])('BR-REC-76 %s', (_name, input, decimals, value) => {
    expect(saveBody.buildSaveValues([num(WEIGHT, input, false, decimals)])).toEqual({
      ok: true,
      values: [{ metricId: WEIGHT, value }],
      filled: 1,
      removed: 0,
    });
  });

  test('BR-REC-76 a value rounded to zero is still a value (not blank, not -0)', () => {
    const result = saveBody.buildSaveValues([num(WEIGHT, '-0.04')]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filled).toBe(1);
      expect(result.values).toHaveLength(1);
      expect(Object.is(result.values[0]?.value, 0)).toBe(true);
    }
  });

  test('BR-REC-76 a typed 0 is a value', () => {
    expect(saveBody.buildSaveValues([num(WAIST, '0', false, 0)])).toEqual({
      ok: true,
      values: [{ metricId: WAIST, value: 0 }],
      filled: 1,
      removed: 0,
    });
  });
});

describe('BR-REC-76 buildSaveValues returns every bad number, nothing else', () => {
  test('BR-REC-76 one bad number is one problem with the "Enter a number" line', () => {
    expect(saveBody.buildSaveValues([num(WEIGHT, 'abc')])).toEqual({
      ok: false,
      problems: [{ metricId: WEIGHT, message: NUMBER_ERROR }],
    });
  });

  test('BR-REC-76 all problems come back, in field order, and valid fields are not listed', () => {
    expect(
      saveBody.buildSaveValues([
        num(WEIGHT, '94'),
        num(FAT, '1e3'),
        dur(PLANK, 122),
        num(WAIST, '9 5'),
      ]),
    ).toEqual({
      ok: false,
      problems: [
        { metricId: FAT, message: NUMBER_ERROR },
        { metricId: WAIST, message: NUMBER_ERROR },
      ],
    });
  });

  test.each(['abc', '1e3', '95.5.5', '9 5', '-', '.', '1,000.5', '95.5kg'])(
    'BR-REC-76 "%s" is a problem',
    (input) => {
      const result = saveBody.buildSaveValues([num(WEIGHT, input)]);
      expect(result.ok).toBe(false);
    },
  );

  test('BR-REC-76 a bad number is a problem even when a value is stored (no silent removal)', () => {
    expect(saveBody.buildSaveValues([num(WEIGHT, 'abc', true)])).toEqual({
      ok: false,
      problems: [{ metricId: WEIGHT, message: NUMBER_ERROR }],
    });
  });

  test('BR-REC-76 a number above the limit is a problem', () => {
    const result = saveBody.buildSaveValues([num(WEIGHT, '1000000000')]);
    expect(result).toEqual({
      ok: false,
      problems: [{ metricId: WEIGHT, message: NUMBER_ERROR }],
    });
  });
});

describe('BR-REC-77 buildSaveValues: emptying a stored value sends null (and counts as removed)', () => {
  test('BR-REC-77 a blank number that had a value becomes `value: null`', () => {
    expect(saveBody.buildSaveValues([num(WEIGHT, '', true)])).toEqual({
      ok: true,
      values: [{ metricId: WEIGHT, value: null }],
      filled: 0,
      removed: 1,
    });
  });

  test('BR-REC-77 a blank time that had a value becomes `value: null`', () => {
    expect(saveBody.buildSaveValues([dur(PLANK, null, true)])).toEqual({
      ok: true,
      values: [{ metricId: PLANK, value: null }],
      filled: 0,
      removed: 1,
    });
  });

  test('BR-REC-77 spaces only count as blank', () => {
    expect(saveBody.buildSaveValues([num(WEIGHT, '   ', true)])).toEqual({
      ok: true,
      values: [{ metricId: WEIGHT, value: null }],
      filled: 0,
      removed: 1,
    });
  });

  test('BR-REC-77 spec example: stored Weight and Plank, new weight typed, plank cleared, waist untouched', () => {
    expect(
      saveBody.buildSaveValues([
        num(WEIGHT, '94', true),
        dur(PLANK, null, true),
        num(WAIST, '', false),
      ]),
    ).toEqual({
      ok: true,
      values: [
        { metricId: WEIGHT, value: 94 },
        { metricId: PLANK, value: null },
      ],
      filled: 1,
      removed: 1,
    });
  });

  test('BR-REC-77 a stored value that is overwritten counts as filled, not removed', () => {
    expect(saveBody.buildSaveValues([num(WEIGHT, '94', true), dur(PLANK, 130, true)])).toEqual({
      ok: true,
      values: [
        { metricId: WEIGHT, value: 94 },
        { metricId: PLANK, value: 130 },
      ],
      filled: 2,
      removed: 0,
    });
  });

  test('BR-REC-77 each emptied stored field is counted', () => {
    const result = saveBody.buildSaveValues([
      num(WEIGHT, '', true),
      num(FAT, '', true),
      dur(PLANK, null, true),
      num(WAIST, '12'),
    ]);
    expect(result).toEqual({
      ok: true,
      values: [
        { metricId: WEIGHT, value: null },
        { metricId: FAT, value: null },
        { metricId: PLANK, value: null },
        { metricId: WAIST, value: 12 },
      ],
      filled: 1,
      removed: 3,
    });
  });
});

describe('BR-REC-75 / 77 buildSaveValues: a time is its seconds', () => {
  test.each([
    [122, 122],
    [45, 45],
    [3930, 3930],
    [35999, 35999],
  ])('BR-REC-75 a time of %d seconds is sent as %d', (seconds, value) => {
    expect(saveBody.buildSaveValues([dur(PLANK, seconds)])).toEqual({
      ok: true,
      values: [{ metricId: PLANK, value }],
      filled: 1,
      removed: 0,
    });
  });

  test('BR-REC-75 a time of 0 seconds is a value, not a blank', () => {
    expect(saveBody.buildSaveValues([dur(PLANK, 0)])).toEqual({
      ok: true,
      values: [{ metricId: PLANK, value: 0 }],
      filled: 1,
      removed: 0,
    });
  });

  test('BR-REC-75 a blank time with nothing stored is left out', () => {
    expect(saveBody.buildSaveValues([dur(PLANK, null)])).toEqual({
      ok: true,
      values: [],
      filled: 0,
      removed: 0,
    });
  });
});

describe('BR-REC-78 buildSaveValues: nothing filled is the screen\'s "Enter at least one value" case', () => {
  test('BR-REC-78 all blank, nothing stored: ok with filled 0 (the screen refuses)', () => {
    expect(saveBody.buildSaveValues([num(WEIGHT, ''), num(FAT, '  '), dur(PLANK, null)])).toEqual({
      ok: true,
      values: [],
      filled: 0,
      removed: 0,
    });
  });

  test('BR-REC-78 all stored values emptied: filled 0 (the screen refuses; Delete removes a whole assessment)', () => {
    const result = saveBody.buildSaveValues([num(WEIGHT, '', true), dur(PLANK, null, true)]);
    expect(result).toEqual({
      ok: true,
      values: [
        { metricId: WEIGHT, value: null },
        { metricId: PLANK, value: null },
      ],
      filled: 0,
      removed: 2,
    });
  });
});

// D2 / contract: a field with `unchanged: true` (optional, default false) is skipped entirely: not in `values`,
// not in `filled` / `removed`. The form sets it for an opened saved assessment whose box still equals what it
// held, so a stored value is never re-sent or re-rounded.
describe('D2 buildSaveValues: an unchanged field is skipped entirely', () => {
  const same = (field: Field): Field => ({ ...field, hadValue: true, unchanged: true });

  test('D2 a Number that still holds what it held is not sent', () => {
    expect(saveBody.buildSaveValues([same(num(WEIGHT, '94.0'))])).toEqual({
      ok: true,
      values: [],
      filled: 0,
      removed: 0,
    });
  });

  test('D2 a Time that still holds what it held is not sent', () => {
    expect(saveBody.buildSaveValues([same(dur(PLANK, 122))])).toEqual({
      ok: true,
      values: [],
      filled: 0,
      removed: 0,
    });
  });

  test('D2 a stored 95.25 shown as "95.3" (one decimal) and left alone is never re-rounded', () => {
    expect(saveBody.buildSaveValues([same(num(WEIGHT, '95.3', true, 1))])).toEqual({
      ok: true,
      values: [],
      filled: 0,
      removed: 0,
    });
  });

  test('D2 every field unchanged: nothing is sent, nothing counted', () => {
    expect(
      saveBody.buildSaveValues([
        same(num(WEIGHT, '94.0')),
        same(num(FAT, '17.5')),
        same(dur(PLANK, 122)),
      ]),
    ).toEqual({ ok: true, values: [], filled: 0, removed: 0 });
  });

  test('D2 only the changed field is sent; the unchanged ones stay out', () => {
    expect(
      saveBody.buildSaveValues([
        same(num(WEIGHT, '94.0')),
        num(FAT, '18', true),
        same(dur(PLANK, 122)),
      ]),
    ).toEqual({
      ok: true,
      values: [{ metricId: FAT, value: 18 }],
      filled: 1,
      removed: 0,
    });
  });

  test('D2 a cleared field next to unchanged ones is still a removal', () => {
    expect(
      saveBody.buildSaveValues([
        same(num(WEIGHT, '94.0')),
        num(FAT, '', true),
        same(dur(PLANK, 122)),
      ]),
    ).toEqual({
      ok: true,
      values: [{ metricId: FAT, value: null }],
      filled: 0,
      removed: 1,
    });
  });

  test('D2 a newly typed value in an empty box next to unchanged ones is sent', () => {
    expect(
      saveBody.buildSaveValues([
        same(num(WEIGHT, '94.0')),
        num(WAIST, '81,5', false),
        same(dur(PLANK, 122)),
      ]),
    ).toEqual({
      ok: true,
      values: [{ metricId: WAIST, value: 81.5 }],
      filled: 1,
      removed: 0,
    });
  });

  test('D2 changed, cleared and unchanged fields together keep screen order and counts', () => {
    expect(
      saveBody.buildSaveValues([
        num(WAIST, '80.5', true), // changed
        same(num(WEIGHT, '94.0')), // unchanged
        dur(PLANK, null, true), // cleared
        same(num(FAT, '17.5')), // unchanged
      ]),
    ).toEqual({
      ok: true,
      values: [
        { metricId: WAIST, value: 80.5 },
        { metricId: PLANK, value: null },
      ],
      filled: 1,
      removed: 1,
    });
  });

  test('D2 a bad number in a changed field is still a problem next to unchanged ones', () => {
    expect(
      saveBody.buildSaveValues([
        same(num(WEIGHT, '94.0')),
        num(FAT, 'abc', true),
        same(dur(PLANK, 122)),
      ]),
    ).toEqual({
      ok: false,
      problems: [{ metricId: FAT, message: NUMBER_ERROR }],
    });
  });

  test.each([[false], [undefined]])(
    'D2 unchanged = %s behaves like before (the value is sent and counted)',
    (unchanged) => {
      expect(saveBody.buildSaveValues([{ ...num(WEIGHT, '94', true), unchanged }])).toEqual({
        ok: true,
        values: [{ metricId: WEIGHT, value: 94 }],
        filled: 1,
        removed: 0,
      });
    },
  );
});

// BR-REC-78 / D2: the screen's "Enter at least one value" case is decided by `leavesNoValue(fields, built)`:
// "A save that would leave the assessment with no stored value at all" (a new assessment with nothing filled,
// or an edit that removes every remaining value). An edit that changes some fields, or only About, leaves
// values and is allowed. `built` is what `buildSaveValues` answered for the same fields.
describe('BR-REC-78 / D2 leavesNoValue: would the save leave the assessment with no value?', () => {
  /** A box of an opened saved assessment that still holds what it held. */
  const kept = (field: Field): Field => ({ ...field, hadValue: true, unchanged: true });
  /** A blank box of an opened saved assessment that holds no value (nothing to keep or remove). */
  const blank = (field: Field): Field => ({ ...field, unchanged: true });

  const leaves = (fields: Field[]): boolean => {
    const built = saveBody.buildSaveValues(fields);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('the fields should build');
    return saveBody.leavesNoValue(fields, built);
  };

  test.each<[string, Field[]]>([
    ['nothing filled', [num(WEIGHT, ''), num(FAT, ''), dur(PLANK, null)]],
    ['only spaces typed', [num(WEIGHT, '   '), num(FAT, ' ')]],
    ['no field at all that holds a value', [dur(PLANK, null)]],
  ])('BR-REC-78 a NEW assessment, %s -> leaves no value (true)', (_name, fields) => {
    expect(leaves(fields)).toBe(true);
  });

  test.each<[string, Field[]]>([
    ['one Number', [num(WEIGHT, '94'), num(FAT, ''), dur(PLANK, null)]],
    ['one Time', [num(WEIGHT, ''), dur(PLANK, 122)]],
    ['a Time of 0 seconds (a value, not blank)', [dur(PLANK, 0)]],
    ['a typed 0', [num(WEIGHT, '0')]],
    ['several values', [num(WEIGHT, '94'), num(FAT, '17.5'), dur(PLANK, 122)]],
  ])('BR-REC-78 a NEW assessment, %s -> keeps a value (false)', (_name, fields) => {
    expect(leaves(fields)).toBe(false);
  });

  test('D2 a saved assessment, a one-field edit -> false', () => {
    expect(leaves([num(WEIGHT, '90', true), blank(num(FAT, '')), kept(dur(PLANK, 122))])).toBe(
      false,
    );
  });

  test('D2 a saved assessment, the only stored value overwritten -> false', () => {
    expect(leaves([num(WEIGHT, '90', true), num(FAT, '')])).toBe(false);
  });

  test('BR-REC-77 a saved assessment, one of several values cleared -> false', () => {
    expect(leaves([num(WEIGHT, '', true), kept(dur(PLANK, 122)), blank(num(FAT, ''))])).toBe(false);
  });

  test('BR-REC-77 a saved assessment, two of three values cleared and one kept -> false', () => {
    expect(leaves([num(WEIGHT, '', true), dur(PLANK, null, true), kept(num(FAT, '17.5'))])).toBe(
      false,
    );
  });

  test('D2 a saved assessment, every stored value cleared and nothing filled -> true', () => {
    expect(leaves([num(WEIGHT, '', true), dur(PLANK, null, true), blank(num(FAT, ''))])).toBe(true);
  });

  test('D2 a saved assessment with one value, that value cleared -> true', () => {
    expect(leaves([num(WEIGHT, '', true), num(FAT, '')])).toBe(true);
  });

  test('D2 a stored Time of 0 seconds, cleared -> true (0 was a value)', () => {
    expect(leaves([dur(PLANK, null, true)])).toBe(true);
  });

  test('D2 every stored value cleared, spaces left in the boxes -> true', () => {
    expect(leaves([num(WEIGHT, '   ', true), dur(PLANK, null, true)])).toBe(true);
  });

  test('D2 About only (no field changed, nothing sent) -> false', () => {
    const fields = [kept(num(WEIGHT, '94.0')), kept(dur(PLANK, 122)), blank(num(FAT, ''))];
    const built = saveBody.buildSaveValues(fields);
    expect(built).toEqual({ ok: true, values: [], filled: 0, removed: 0 });
    expect(leaves(fields)).toBe(false);
  });

  test('D2 a saved assessment whose fields are all unchanged -> false', () => {
    expect(leaves([kept(num(WEIGHT, '94.0')), kept(dur(PLANK, 122))])).toBe(false);
  });

  test('D2 every stored value cleared but another box filled -> false', () => {
    expect(leaves([num(WEIGHT, '', true), dur(PLANK, null, true), num(FAT, '9')])).toBe(false);
  });

  test('D2 the only stored value cleared and a Time filled in the same save -> false', () => {
    expect(leaves([num(WEIGHT, '', true), dur(PLANK, 95)])).toBe(false);
  });

  test('D2 a saved assessment sent whole, with no unchanged flags (every value re-sent) -> false', () => {
    expect(leaves([num(WEIGHT, '94.0', true), dur(PLANK, 122, true)])).toBe(false);
  });
});
