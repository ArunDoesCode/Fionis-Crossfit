// Spec: docs/specs/member-records/ux.md (v10) BR-REC-223: an initials avatar is "the first letters of the first
// and last word of the shown name, at most 2, upper case". Examples: "Surya Pratap" -> "SP"; "Madonna" -> "M".
// Interface (PROPOSED, not yet named in the spec): `@/lib/members/initials` exports
//   `initialsOf(name: string): string`.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Initials {
  initialsOf(name: string): string;
}
// A variable specifier keeps `tsc` green while the module does not exist yet; the import is still resolved by Bun.
const MODULE = '@/lib/members/initials';
let mod: Initials;
beforeAll(async () => {
  mod = (await import(MODULE)) as unknown as Initials;
});

describe('BR-REC-223 initialsOf', () => {
  test.each([
    ['Surya Pratap', 'SP'], // spec example
    ['Madonna', 'M'], // spec example: one word -> one letter
    ['Lakshmi Pillai', 'LP'],
    ['Naveen Kumar', 'NK'],
  ])('BR-REC-223 "%s" -> "%s"', (name, initials) => {
    expect(mod.initialsOf(name)).toBe(initials);
  });

  test('BR-REC-223 first and last word only: "Anna Maria de Souza" -> "AS"', () => {
    expect(mod.initialsOf('Anna Maria de Souza')).toBe('AS');
  });
  test('BR-REC-223 at most 2 letters for any number of words', () => {
    expect(mod.initialsOf('One Two Three Four Five').length).toBe(2);
  });
  test('BR-REC-223 upper case: "surya pratap" -> "SP"', () => {
    expect(mod.initialsOf('surya pratap')).toBe('SP');
  });
  test('BR-REC-223 extra spaces are ignored: "  Surya   Pratap " -> "SP"', () => {
    expect(mod.initialsOf('  Surya   Pratap ')).toBe('SP');
  });
  test('BR-REC-223 an accented first letter stays one letter: "René Dsouza" -> "RD"', () => {
    expect(mod.initialsOf('René Dsouza')).toBe('RD');
  });
  test('BR-REC-223 the shown name "Athlete"-style single word gives one letter', () => {
    expect(mod.initialsOf('Athlete')).toBe('A');
  });
});
