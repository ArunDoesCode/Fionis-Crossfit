// Spec: docs/specs/member-records/ux.md (v10) BR-REC-232: "`DatePicker` also takes typed dates `dd/mm/yyyy`
// (`-` or `.` allowed, single digits allowed), checked on Save like any field." Example: type "5/1/1990" ->
// 05 Jan 1990. A day that does not exist is not a date. Output is `YYYY-MM-DD` (BR-REC-193).
// Interface (PROPOSED, not yet named in the spec): `@/lib/dates/typedDate` exports
//   `parseTypedDate(text: string): string | null`  (an ISO day, or null when the text is not a real day).
import { beforeAll, describe, expect, test } from 'bun:test';
import { formatDay } from '@/lib/format';

interface Mod {
  parseTypedDate(text: string): string | null;
}
// A variable specifier keeps `tsc` green while the module does not exist yet; the import is still resolved by Bun.
const MODULE = '@/lib/dates/typedDate';
let mod: Mod;
beforeAll(async () => {
  mod = (await import(MODULE)) as unknown as Mod;
});

describe('BR-REC-232 parseTypedDate: accepted forms', () => {
  test.each([
    ['5/1/1990', '1990-01-05'], // spec example (single digits)
    ['05/01/1990', '1990-01-05'],
    ['05-01-1990', '1990-01-05'], // - allowed
    ['05.01.1990', '1990-01-05'], // . allowed
    ['5-1-1990', '1990-01-05'],
    ['5.1.1990', '1990-01-05'],
    ['31/12/2025', '2025-12-31'],
    ['29/02/2024', '2024-02-29'], // leap day
    ['1/10/2026', '2026-10-01'], // day first, not month first
    ['12/11/2026', '2026-11-12'], // day first: 12 Nov, not 11 Dec
  ])('BR-REC-232 "%s" -> %s', (text, iso) => {
    expect(mod.parseTypedDate(text)).toBe(iso);
  });

  test('BR-REC-232 the spec example shows as 05 Jan 1990 through the one formatter', () => {
    const iso = mod.parseTypedDate('5/1/1990');
    expect(iso).not.toBeNull();
    expect(formatDay(iso as string)).toBe('05 Jan 1990');
  });
});

describe('BR-REC-232 parseTypedDate: not a date -> null (the field then shows its error on Save)', () => {
  test.each([
    [''],
    ['abc'],
    ['32/01/2026'], // no 32nd
    ['00/01/2026'],
    ['15/13/2026'], // no 13th month
    ['15/00/2026'],
    ['29/02/2025'], // not a leap year
    ['31/04/2026'], // April has 30 days
    ['5/1'], // year missing
    ['1990-01-05'], // the ISO order is not the typed order
    ['5/1/1990/7'],
  ])('BR-REC-232 "%s" -> null', (text) => {
    expect(mod.parseTypedDate(text)).toBeNull();
  });
});
