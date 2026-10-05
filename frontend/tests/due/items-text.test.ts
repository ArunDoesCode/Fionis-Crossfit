// Spec: docs/specs/member-records/ux.md (v10) BR-REC-225: "Due sub-items show as one line of quiet text
// "Height · Weight · +13" instead of chips, and "All 15 measurements" when every turned-on measurement is due."
// Examples: 15 due of 15 turned on -> "All 15 measurements"; 15 due, 2 named -> "Height · Weight · +13".
// Interface (PROPOSED, not yet named in the spec): `@/lib/due/text` also exports
//   `dueItemsText(names: string[], turnedOnCount: number): string`
//   names = the due measurements in row order, turnedOnCount = measurements turned on for that assessment.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Mod {
  dueItemsText(names: string[], turnedOnCount: number): string;
}
let mod: Mod;
beforeAll(async () => {
  mod = (await import('@/lib/due/text')) as unknown as Mod;
});

const names = (n: number): string[] =>
  [
    'Height',
    'Weight',
    'Body fat',
    'BMI',
    'Waist',
    'Chest',
    'Hip',
    'Neck',
    'Thigh',
    'Calf',
    'Arm',
    'Wrist',
    'Ankle',
    'Visceral fat',
    'Water',
  ].slice(0, n);

describe('BR-REC-225 dueItemsText', () => {
  test('BR-REC-225 every turned-on measurement is due -> "All 15 measurements" (spec example)', () => {
    expect(mod.dueItemsText(names(15), 15)).toBe('All 15 measurements');
  });
  test('BR-REC-225 15 due of 20 turned on -> two names and "+13" (spec example)', () => {
    expect(mod.dueItemsText(names(15), 20)).toBe('Height · Weight · +13');
  });
  test('BR-REC-225 three due -> two names and "+1"', () => {
    expect(mod.dueItemsText(names(3), 15)).toBe('Height · Weight · +1');
  });
  test('BR-REC-225 two due -> both names, no "+"', () => {
    expect(mod.dueItemsText(names(2), 15)).toBe('Height · Weight');
  });
  test('BR-REC-225 one due -> the one name', () => {
    expect(mod.dueItemsText(names(1), 15)).toBe('Height');
  });
  test('BR-REC-225 the text is one line: no chips, no line break', () => {
    expect(mod.dueItemsText(names(15), 20)).not.toContain('\n');
  });
  test('BR-REC-225 "All N" uses N, the count turned on: 5 of 5 -> "All 5 measurements"', () => {
    expect(mod.dueItemsText(names(5), 5)).toBe('All 5 measurements');
  });
});
