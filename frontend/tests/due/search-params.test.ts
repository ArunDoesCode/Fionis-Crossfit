// Spec: docs/specs/member-records/due-list.md (v2)
//   BR-REC-104 "See all" lists have an assessment filter; S3 is `/admin/due?tab=overdue|soon&type=` (C11).
// Interface: .pipeline/member-records-due-list/contract.md "Admin app interfaces" — `@/lib/due/searchParams`:
//   `parseDueTab(value | null)`: `overdue` | `soon`, anything else -> `overdue`.
//   `dueListSearchParams` (nuqs parsers): `tab` = `overdue` | `soon`, anything else -> `overdue`;
//   `type` = a uuid string or null (anything else -> null).
//   The ids the API hands out are "any 8-4-4-4-12 hex uuid" (contract "All four endpoints").
//   A nuqs parser may fall back to the default itself or answer null and let the default apply, so for "anything
//   else" the `tab` parser tests accept `overdue` or null, never `soon`.
import { beforeAll, describe, expect, test } from 'bun:test';
import { TYPE_BODY, uuid } from './helpers';

interface Parser {
  parse(value: string): unknown;
}

interface SearchParamsModule {
  parseDueTab(value: string | null): 'overdue' | 'soon';
  dueListSearchParams: { tab: Parser; type: Parser };
}

let mod: SearchParamsModule;

beforeAll(async () => {
  mod = (await import('@/lib/due/searchParams')) as unknown as SearchParamsModule;
});

describe('BR-REC-104 parseDueTab: the S3 tab from the URL', () => {
  test('"overdue" -> overdue', () => {
    expect(mod.parseDueTab('overdue')).toBe('overdue');
  });

  test('"soon" -> soon', () => {
    expect(mod.parseDueTab('soon')).toBe('soon');
  });

  test('no tab in the URL -> overdue (the default tab)', () => {
    expect(mod.parseDueTab(null)).toBe('overdue');
  });

  for (const value of [
    '',
    'upcoming',
    'Soon',
    'OVERDUE',
    'ending',
    ' soon',
    'soon ',
    '1',
    'null',
  ]) {
    test(`anything else ("${value}") -> overdue`, () => {
      expect(mod.parseDueTab(value)).toBe('overdue');
    });
  }
});

describe('BR-REC-104 dueListSearchParams.tab', () => {
  test('"soon" is read as soon', () => {
    expect(mod.dueListSearchParams.tab.parse('soon')).toBe('soon');
  });

  test('"overdue" is read as overdue', () => {
    expect(mod.dueListSearchParams.tab.parse('overdue')).toBe('overdue');
  });

  for (const value of ['upcoming', 'nonsense', '']) {
    test(`anything else ("${value}") is never read as soon`, () => {
      const parsed = mod.dueListSearchParams.tab.parse(value);
      expect(parsed === null || parsed === 'overdue').toBe(true);
    });
  }
});

describe('BR-REC-104 dueListSearchParams.type: the assessment filter', () => {
  test('a uuid is kept as it is', () => {
    expect(mod.dueListSearchParams.type.parse(TYPE_BODY)).toBe(TYPE_BODY);
  });

  test('an id of any 8-4-4-4-12 hex shape the API accepts is kept', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(mod.dueListSearchParams.type.parse(id)).toBe(id);
  });

  test('another uuid is kept as that uuid', () => {
    expect(mod.dueListSearchParams.type.parse(uuid(102))).toBe(uuid(102));
  });

  for (const value of [
    '',
    'fitness',
    'not-a-uuid',
    '1234',
    '00000000-0000-4000-8000-00000000010', // one digit short
    '00000000-0000-4000-8000-0000000001011', // one digit long
    '00000000-0000-4000-8000-00000000010g', // not hex
    `${TYPE_BODY},${uuid(102)}`,
    `'${TYPE_BODY}`,
  ]) {
    test(`anything else ("${value}") is null`, () => {
      expect(mod.dueListSearchParams.type.parse(value)).toBeNull();
    });
  }
});
