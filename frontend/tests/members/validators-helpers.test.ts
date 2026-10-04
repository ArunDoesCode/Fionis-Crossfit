// Spec: docs/specs/member-records/members.md
//   BR-REC-45 — a name is trimmed and double spaces are collapsed (" Surya  Pratap " -> "Surya Pratap").
//   BR-REC-46 — a phone is 10-15 digits after removing spaces, dashes and brackets (a leading + is
//               allowed); two phones are "the same" when their last 10 digits match
//               ("+91 98450-12345" = "9845012345").
// Interface: .pipeline/member-records-members/contract.md "Admin app interfaces" — `@/lib/validators/members`:
//   `normalizeName(raw)`, `cleanPhone(raw)` (cleaned string or null), `samePhone(a, b)`.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Helpers {
  normalizeName(raw: string): string;
  cleanPhone(raw: string): string | null;
  samePhone(a: string, b: string): boolean;
}

let helpers: Helpers;

beforeAll(async () => {
  helpers = (await import('@/lib/validators/members')) as unknown as Helpers;
});

describe('BR-REC-45 normalizeName', () => {
  test.each([
    [' Surya  Pratap ', 'Surya Pratap'], // spec example
    ['Surya Pratap', 'Surya Pratap'], // already clean: unchanged
    ['   Anita   Rao   ', 'Anita Rao'],
    ['A  B   C', 'A B C'], // every run of spaces becomes one space
    ['Surya\t Pratap', 'Surya Pratap'], // contract: whitespace runs, not only spaces
    ['Surya\nPratap', 'Surya Pratap'],
    ["D'Souza-Rao", "D'Souza-Rao"], // punctuation and case are left alone
    ['José  Núñez', 'José Núñez'],
    ['', ''],
    ['    ', ''], // only spaces: nothing left (the schema then refuses it as too short)
  ])('BR-REC-45 normalizeName(%j) is %j', (raw, expected) => {
    expect(helpers.normalizeName(raw)).toBe(expected);
  });

  test('BR-REC-45 normalizeName does not change the case of the letters', () => {
    expect(helpers.normalizeName('  sURYA   pRATAP ')).toBe('sURYA pRATAP');
  });
});

describe('BR-REC-46 cleanPhone accepts 10-15 digits and returns the cleaned text', () => {
  test.each([
    ['+91 98450-12345', '+919845012345'], // spec example
    ['9845012345', '9845012345'],
    ['98450 12345', '9845012345'],
    ['98450-12345', '9845012345'],
    ['(98450) 12345', '9845012345'],
    ['[98450] 12345', '9845012345'], // contract field rules: ( ) [ ] are removed
    [' 9845012345 ', '9845012345'], // outer spaces are removed too
    ['+9845012345', '+9845012345'], // a leading + is kept
    ['+91 (984) 501-2345', '+919845012345'],
    ['1234567890', '1234567890'], // 10 digits: the lower limit
    ['123456789012345', '123456789012345'], // 15 digits: the upper limit
    ['+123456789012345', '+123456789012345'],
  ])('BR-REC-46 cleanPhone(%j) is %j', (raw, expected) => {
    expect(helpers.cleanPhone(raw)).toBe(expected);
  });
});

describe('BR-REC-46 cleanPhone refuses anything else with null', () => {
  test.each([
    ['', 'empty'],
    ['   ', 'only spaces'],
    ['12345', '5 digits'],
    ['984501234', '9 digits, one short'],
    ['1234567890123456', '16 digits, one too many'],
    ['+1234567890123456', '16 digits after a +'],
    ['abcdefghij', 'letters'],
    ['98450abcde', 'digits and letters'],
    ['98450 1234a', '10 characters, one a letter'],
    ['98450.12345', 'a dot is not one of the removed characters'],
    ['98450+12345', 'a + that is not the first character'],
    ['++919845012345', 'two plus signs'],
    ['91+9845012345', 'a + in the middle'],
    ['+', 'a plus and no digits'],
    ['+ ', 'a plus and nothing else'],
  ])('BR-REC-46 cleanPhone(%j) is null (%s)', (raw) => {
    expect(helpers.cleanPhone(raw)).toBeNull();
  });
});

describe('BR-REC-46 samePhone compares the last 10 digits', () => {
  const same: [string, string][] = [
    ['+91 98450-12345', '9845012345'], // spec example
    ['9845012345', '9845012345'],
    ['(98450) 12345', '98450 12345'], // formatting does not matter
    ['+919845012345', '9845012345'],
    ['09845012345', '9845012345'], // a leading 0 is not part of the last 10 digits
    ['+919845012345', '+449845012345'], // another country code, same last 10 digits
  ];
  for (const [a, b] of same) {
    test(`BR-REC-46 "${a}" and "${b}" are the same phone, in both orders`, () => {
      expect(helpers.samePhone(a, b)).toBe(true);
      expect(helpers.samePhone(b, a)).toBe(true);
    });
  }

  const different: [string, string][] = [
    ['9845012345', '9845012346'], // last digit differs
    ['9845012345', '9945012345'], // first of the last 10 digits differs
    ['+919845012345', '+919845012346'],
    ['9845012345', '5845012345'],
  ];
  for (const [a, b] of different) {
    test(`BR-REC-46 "${a}" and "${b}" are different phones, in both orders`, () => {
      expect(helpers.samePhone(a, b)).toBe(false);
      expect(helpers.samePhone(b, a)).toBe(false);
    });
  }

  test.each([
    ['9845012345', '98450123'], // one side under 10 digits
    ['98450123', '9845012345'],
    ['98450123', '98450123'], // identical, but too short to be a phone
    ['984501234', '984501234'], // 9 digits
    ['', ''],
    ['9845012345', ''],
  ])('BR-REC-46 samePhone(%j, %j) is false when either side has fewer than 10 digits', (a, b) => {
    expect(helpers.samePhone(a, b)).toBe(false);
  });
});
