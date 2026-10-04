// Spec: docs/specs/member-records/members.md
//   BR-REC-07 — search needs 2+ characters ("sur" -> both Suryas; the API answers 400 for `q=s`).
// Interface: .pipeline/member-records-members/contract.md "Admin app interfaces" — `@/lib/members/search`:
//   `isSearchReady(q)`: trimmed length >= 2.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Search {
  isSearchReady(q: string): boolean;
}

let search: Search;

beforeAll(async () => {
  search = (await import('@/lib/members/search')) as unknown as Search;
});

describe('BR-REC-07 isSearchReady', () => {
  test.each([
    ['su', true],
    ['sur', true], // spec example
    ['98', true], // a phone start counts
    ['an', true],
    ['surya pratap', true],
    ['s u', true], // 3 characters once trimmed (a space inside counts)
    ['  su  ', true], // outer spaces do not count, the 2 letters do
    [' sur', true],
    ['sur ', true],
  ])('BR-REC-07 isSearchReady(%j) is %s', (q, expected) => {
    expect(search.isSearchReady(q)).toBe(expected);
  });

  test.each([
    [''],
    [' '],
    ['     '],
    ['s'], // spec: the API refuses q=s
    ['9'],
    [' s '], // one character once trimmed
    ['s '],
    [' s'],
    ['\t'],
  ])('BR-REC-07 isSearchReady(%j) is false (under 2 characters once trimmed)', (q) => {
    expect(search.isSearchReady(q)).toBe(false);
  });

  test('BR-REC-07 the limit is exactly 2: one more letter turns false into true', () => {
    expect(search.isSearchReady('s')).toBe(false);
    expect(search.isSearchReady('su')).toBe(true);
  });
});
