// Spec: docs/specs/member-records/ux.md (v10) BR-REC-231 (amends members BR-REC-201): "Search picks the field
// from the text: only digits (spaces, `+`, `-` allowed) -> Phone, text with `@` -> Email, else Name; the picker
// shows the field in use and a manual pick wins until the text is cleared."
// Example: "Name picked, type "10016" -> field Phone".
// Interface (PROPOSED, not yet named in the spec): `@/lib/members/searchField` exports
//   `fieldForText(text: string): 'name' | 'email' | 'phone'`  (the automatic pick), and
//   `activeSearchField(text: string, manual: 'name' | 'email' | 'phone' | null): 'name' | 'email' | 'phone'`
//   (the field in use: the manual pick while there is text, else the automatic pick).
import { beforeAll, describe, expect, test } from 'bun:test';

type Field = 'name' | 'email' | 'phone';
interface Mod {
  fieldForText(text: string): Field;
  activeSearchField(text: string, manual: Field | null): Field;
}
// A variable specifier keeps `tsc` green while the module does not exist yet; the import is still resolved by Bun.
const MODULE = '@/lib/members/searchField';
let mod: Mod;
beforeAll(async () => {
  mod = (await import(MODULE)) as unknown as Mod;
});

describe('BR-REC-231 fieldForText', () => {
  test.each([
    ['10016', 'phone'], // spec example
    ['98450', 'phone'],
    ['98450 12345', 'phone'], // spaces allowed
    ['+91 98450-12345', 'phone'], // + and - allowed
    ['+919845012345', 'phone'],
    ['98-45', 'phone'],
    ['surya', 'name'],
    ['Surya Pratap', 'name'],
    ['Surya 2', 'name'], // letters and a digit: not only digits
    ['12 ab', 'name'],
    ['surya@gmail.com', 'email'],
    ['surya@', 'email'], // text with @
    ['@gmail', 'email'],
    ['98450@x', 'email'], // an @ wins over the digits
    ['', 'name'], // nothing typed: the default is Name
  ] as [string, Field][])('BR-REC-231 "%s" -> %s', (text, field) => {
    expect(mod.fieldForText(text)).toBe(field);
  });
});

describe('BR-REC-231 activeSearchField', () => {
  test('BR-REC-231 no manual pick: the field follows the text', () => {
    expect(mod.activeSearchField('10016', null)).toBe('phone');
    expect(mod.activeSearchField('surya', null)).toBe('name');
    expect(mod.activeSearchField('a@b', null)).toBe('email');
  });
  test('BR-REC-231 a manual pick wins over the text (Name picked, digits typed)', () => {
    expect(mod.activeSearchField('10016', 'name')).toBe('name');
    expect(mod.activeSearchField('surya', 'phone')).toBe('phone');
    expect(mod.activeSearchField('a@b', 'name')).toBe('name');
  });
  test('BR-REC-231 once the text is cleared the manual pick is gone: empty text -> Name', () => {
    expect(mod.activeSearchField('', 'phone')).toBe('name');
    expect(mod.activeSearchField('', 'email')).toBe('name');
  });
});
