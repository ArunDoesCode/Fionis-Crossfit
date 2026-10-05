// Spec: docs/specs/member-records/setup.md (v2)
//   BR-REC-13  each assessment has a repeat of N weeks or months (Setup shows "Every 2 months").
//   BR-REC-14  a measurement may have its own repeat.
//   BR-REC-63  better can also be "No direction".
//   BR-REC-65  report-table body part: whole body, arms, trunk, legs.
//   BR-REC-67  "Move up / Move down" sets the order (Move Fran above 5K -> the form shows Fran first).
//   BR-REC-70  changing a repeat asks for confirmation ("This changes due dates for all members").
//   BR-REC-71  changing "better" on a measurement that has values asks for confirmation.
//   BR-REC-126 / ux word list: Higher is better / Lower is better / No direction, Number / Time (min:sec).
// Interface: docs/specs/member-records/setup.md — `@/lib/setup/describe`:
//   `intervalLabel`, `betterLabel`, `datatypeLabel`, `tablePartLabel`, `intervalChangeNeedsConfirm`,
//   `betterChangeNeedsConfirm`, `moveItem` (pure functions, no DOM).
import { beforeAll, describe, expect, test } from 'bun:test';

type Describe = typeof import('@/lib/setup/describe');

let lib: Describe;

beforeAll(async () => {
  lib = await import('@/lib/setup/describe');
});

type Unit = 'week' | 'month';
type Better = 'higher' | 'lower' | 'none';
type Repeat = { intervalCount: number | null; intervalUnit: Unit | null };

describe('BR-REC-13 intervalLabel: "Every N unit(s)"', () => {
  const cases: Array<[number, Unit, string]> = [
    [1, 'month', 'Every 1 month'],
    [2, 'month', 'Every 2 months'],
    [1, 'week', 'Every 1 week'],
    [3, 'week', 'Every 3 weeks'],
    [12, 'month', 'Every 12 months'],
    [24, 'month', 'Every 24 months'],
    [24, 'week', 'Every 24 weeks'],
    [6, 'week', 'Every 6 weeks'],
  ];
  for (const [count, unit, expected] of cases) {
    test(`BR-REC-13 ${count} ${unit} -> "${expected}"`, () => {
      expect(lib.intervalLabel(count, unit)).toBe(expected);
    });
  }

  test('BR-REC-13 the seeded Fitness test (every 2 months) reads "Every 2 months"', () => {
    expect(lib.intervalLabel(2, 'month')).toBe('Every 2 months');
  });

  test('BR-REC-14 the spec example: Fran every 3 months reads "Every 3 months"', () => {
    expect(lib.intervalLabel(3, 'month')).toBe('Every 3 months');
  });

  test('BR-REC-13 only a count of 1 is singular (every count from 2 to 24 is plural)', () => {
    for (let count = 2; count <= 24; count++) {
      expect(lib.intervalLabel(count, 'week')).toBe(`Every ${count} weeks`);
      expect(lib.intervalLabel(count, 'month')).toBe(`Every ${count} months`);
    }
  });
});

describe('BR-REC-63 betterLabel', () => {
  const cases: Array<[Better, string]> = [
    ['higher', 'Higher is better'],
    ['lower', 'Lower is better'],
    ['none', 'No direction'],
  ];
  for (const [better, expected] of cases) {
    test(`BR-REC-63 "${better}" -> "${expected}"`, () => {
      expect(lib.betterLabel(better)).toBe(expected);
    });
  }
});

describe('BR-REC-10 datatypeLabel', () => {
  test('BR-REC-10 number -> "Number"', () => {
    expect(lib.datatypeLabel('number')).toBe('Number');
  });

  test('BR-REC-10 duration -> "Time (min:sec)"', () => {
    expect(lib.datatypeLabel('duration')).toBe('Time (min:sec)');
  });
});

describe('BR-REC-65 tablePartLabel', () => {
  const cases: Array<['whole_body' | 'arms' | 'trunk' | 'legs', string]> = [
    ['whole_body', 'Whole body'],
    ['arms', 'Arms'],
    ['trunk', 'Trunk'],
    ['legs', 'Legs'],
  ];
  for (const [part, expected] of cases) {
    test(`BR-REC-65 "${part}" -> "${expected}"`, () => {
      expect(lib.tablePartLabel(part)).toBe(expected);
    });
  }
});

describe('BR-REC-70 intervalChangeNeedsConfirm: a changed repeat asks first', () => {
  const month2: Repeat = { intervalCount: 2, intervalUnit: 'month' };
  const cases: Array<[string, Repeat, Repeat, boolean]> = [
    [
      'the same repeat (2 months -> 2 months)',
      month2,
      { intervalCount: 2, intervalUnit: 'month' },
      false,
    ],
    ['the spec example, 2 -> 3 months', month2, { intervalCount: 3, intervalUnit: 'month' }, true],
    [
      'the number goes down (2 -> 1 months)',
      month2,
      { intervalCount: 1, intervalUnit: 'month' },
      true,
    ],
    [
      'only the unit differs (2 months -> 2 weeks)',
      month2,
      { intervalCount: 2, intervalUnit: 'week' },
      true,
    ],
    ['both differ (2 months -> 3 weeks)', month2, { intervalCount: 3, intervalUnit: 'week' }, true],
    [
      'the same weekly repeat (1 week -> 1 week)',
      { intervalCount: 1, intervalUnit: 'week' },
      { intervalCount: 1, intervalUnit: 'week' },
      false,
    ],
    [
      'the same number at the limit (24 months -> 24 months)',
      { intervalCount: 24, intervalUnit: 'month' },
      { intervalCount: 24, intervalUnit: 'month' },
      false,
    ],
    [
      'a measurement gets its own repeat (same as assessment -> every 3 months)',
      { intervalCount: null, intervalUnit: null },
      { intervalCount: 3, intervalUnit: 'month' },
      true,
    ],
    [
      'a measurement goes back to the assessment repeat (every 3 months -> same as assessment)',
      { intervalCount: 3, intervalUnit: 'month' },
      { intervalCount: null, intervalUnit: null },
      true,
    ],
    [
      'no own repeat before and after (null -> null)',
      { intervalCount: null, intervalUnit: null },
      { intervalCount: null, intervalUnit: null },
      false,
    ],
  ];
  for (const [label, before, after, expected] of cases) {
    test(`BR-REC-70 ${label} -> ${expected ? 'confirm' : 'no confirm'}`, () => {
      expect(lib.intervalChangeNeedsConfirm(before, after)).toBe(expected);
    });
  }

  test('BR-REC-70 the answer does not depend on which side is "before" (a changed repeat is changed both ways)', () => {
    const a: Repeat = { intervalCount: 2, intervalUnit: 'month' };
    const b: Repeat = { intervalCount: 3, intervalUnit: 'week' };
    expect(lib.intervalChangeNeedsConfirm(a, b)).toBe(lib.intervalChangeNeedsConfirm(b, a));
  });

  test('BR-REC-70 the two repeats are compared by value, not by object identity', () => {
    const before: Repeat = { intervalCount: 4, intervalUnit: 'week' };
    expect(lib.intervalChangeNeedsConfirm(before, { ...before })).toBe(false);
  });

  test('BR-REC-70 the arguments are not changed', () => {
    const before: Repeat = Object.freeze({ intervalCount: 2, intervalUnit: 'month' }) as Repeat;
    const after: Repeat = Object.freeze({ intervalCount: 3, intervalUnit: 'month' }) as Repeat;
    expect(lib.intervalChangeNeedsConfirm(before, after)).toBe(true);
    expect(before).toEqual({ intervalCount: 2, intervalUnit: 'month' });
    expect(after).toEqual({ intervalCount: 3, intervalUnit: 'month' });
  });
});

describe('BR-REC-71 betterChangeNeedsConfirm: only a changed "better" on a measurement with values asks first', () => {
  const all: Better[] = ['higher', 'lower', 'none'];
  for (const better of all) {
    for (const newBetter of all) {
      for (const hasValues of [true, false]) {
        const expected = hasValues && newBetter !== better;
        const label = `${better} -> ${newBetter}, ${hasValues ? 'has values' : 'no values'}`;
        test(`BR-REC-71 ${label} -> ${expected ? 'confirm' : 'no confirm'}`, () => {
          expect(lib.betterChangeNeedsConfirm({ better, hasValues }, newBetter)).toBe(expected);
        });
      }
    }
  }

  test('BR-REC-71 the spec example: Weight lower -> higher with values -> confirm sheet', () => {
    expect(lib.betterChangeNeedsConfirm({ better: 'lower', hasValues: true }, 'higher')).toBe(true);
  });

  test('BR-REC-71 a measurement with no values changes "better" freely', () => {
    expect(lib.betterChangeNeedsConfirm({ better: 'lower', hasValues: false }, 'higher')).toBe(
      false,
    );
  });

  test('BR-REC-71 keeping the same "better" never asks, also with values', () => {
    expect(lib.betterChangeNeedsConfirm({ better: 'higher', hasValues: true }, 'higher')).toBe(
      false,
    );
  });

  test('BR-REC-71 switching to "none" on a measurement with values asks (best and leaderboards change)', () => {
    expect(lib.betterChangeNeedsConfirm({ better: 'higher', hasValues: true }, 'none')).toBe(true);
  });
});

describe('BR-REC-67 moveItem: swap an item with its neighbour', () => {
  const ids = ['a', 'b', 'c', 'd'];

  const cases: Array<[string, number, 'up' | 'down', string[]]> = [
    ['move the second item up', 1, 'up', ['b', 'a', 'c', 'd']],
    ['move the second item down', 1, 'down', ['a', 'c', 'b', 'd']],
    ['move the third item up', 2, 'up', ['a', 'c', 'b', 'd']],
    ['move the third item down', 2, 'down', ['a', 'b', 'd', 'c']],
    ['move the last item up', 3, 'up', ['a', 'b', 'd', 'c']],
    ['move the first item down', 0, 'down', ['b', 'a', 'c', 'd']],
  ];
  for (const [label, index, direction, expected] of cases) {
    test(`BR-REC-67 ${label}`, () => {
      expect(lib.moveItem(ids, index, direction)).toEqual(expected);
    });
  }

  test('BR-REC-67 the spec example: Fran moves above 5K (5K, Fran -> Fran, 5K)', () => {
    expect(lib.moveItem(['five-k', 'fran'], 1, 'up')).toEqual(['fran', 'five-k']);
  });

  test('BR-REC-67 the first item cannot move up: an equal copy comes back', () => {
    expect(lib.moveItem(ids, 0, 'up')).toEqual(ids);
  });

  test('BR-REC-67 the last item cannot move down: an equal copy comes back', () => {
    expect(lib.moveItem(ids, 3, 'down')).toEqual(ids);
  });

  for (const [index, direction] of [
    [4, 'up'],
    [4, 'down'],
    [99, 'up'],
    [99, 'down'],
    [-1, 'up'],
    [-1, 'down'],
    [-99, 'down'],
  ] as const) {
    test(`BR-REC-67 an index out of range (${index}, ${direction}) gives an equal copy`, () => {
      expect(lib.moveItem(ids, index, direction)).toEqual(ids);
    });
  }

  test('BR-REC-67 a list of one item stays as it is, up or down', () => {
    expect(lib.moveItem(['only'], 0, 'up')).toEqual(['only']);
    expect(lib.moveItem(['only'], 0, 'down')).toEqual(['only']);
  });

  test('BR-REC-67 an empty list gives an empty list', () => {
    expect(lib.moveItem([], 0, 'up')).toEqual([]);
    expect(lib.moveItem([], 0, 'down')).toEqual([]);
  });

  test('BR-REC-67 a list of two swaps in either direction', () => {
    expect(lib.moveItem(['x', 'y'], 0, 'down')).toEqual(['y', 'x']);
    expect(lib.moveItem(['x', 'y'], 1, 'up')).toEqual(['y', 'x']);
  });

  test('BR-REC-67 the result is a new array, also when nothing moves', () => {
    const moved = lib.moveItem(ids, 1, 'up');
    const unmoved = lib.moveItem(ids, 0, 'up');
    expect(moved).not.toBe(ids);
    expect(unmoved).not.toBe(ids);
  });

  test('BR-REC-67 the input list is never changed', () => {
    const input = ['a', 'b', 'c', 'd'];
    lib.moveItem(input, 1, 'up');
    lib.moveItem(input, 2, 'down');
    lib.moveItem(input, 0, 'up');
    lib.moveItem(input, 3, 'down');
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });

  test('BR-REC-67 a frozen input list works (nothing is changed in place)', () => {
    const input = Object.freeze(['a', 'b', 'c']) as unknown as string[];
    expect(lib.moveItem(input, 2, 'up')).toEqual(['a', 'c', 'b']);
  });

  test('BR-REC-67 moving up and then moving the same item down gives the original order', () => {
    for (let index = 1; index < ids.length; index++) {
      const up = lib.moveItem(ids, index, 'up');
      expect(lib.moveItem(up, index - 1, 'down')).toEqual(ids);
    }
  });

  test('BR-REC-67 every move keeps the same ids, each exactly once, and moves only the item and its neighbour', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    for (let index = 0; index < list.length; index++) {
      for (const direction of ['up', 'down'] as const) {
        const result = lib.moveItem(list, index, direction);
        expect(result.length).toBe(list.length);
        expect([...result].sort()).toEqual([...list].sort());
        const changed = result.filter((id, at) => id !== list[at]).length;
        expect([0, 2]).toContain(changed);
      }
    }
  });

  test('BR-REC-67 the moved item ends one place away from where it was', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    for (let index = 1; index < list.length; index++) {
      expect(lib.moveItem(list, index, 'up').indexOf(list[index] as string)).toBe(index - 1);
    }
    for (let index = 0; index < list.length - 1; index++) {
      expect(lib.moveItem(list, index, 'down').indexOf(list[index] as string)).toBe(index + 1);
    }
  });
});
