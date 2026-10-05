// Spec: docs/specs/member-records/api-contract.md changelog 2026-10-04 v1 — "E16 `q` is 2–100 characters";
//   docs/specs/member-records/members.md BR-REC-07 (search text).
// Interface: docs/specs/member-records/members.md — `@/lib/members/search`:
//   `clampSearchText(q)`: the first 100 characters of `q`; shorter input unchanged. So a long paste never
//   produces a 400 from E16.
import { beforeAll, describe, expect, test } from 'bun:test';

interface Search {
  clampSearchText(q: string): string;
}

let search: Search;

beforeAll(async () => {
  search = (await import('@/lib/members/search')) as unknown as Search;
});

/** n characters that all differ from their neighbours: 'abc…xyzabc…', so a wrong cut shows. */
const run = (n: number): string =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');

describe('BR-REC-07 clampSearchText: text up to 100 characters is unchanged', () => {
  test.each([
    [''], // empty stays empty
    ['s'],
    ['su'],
    ['sur'], // spec example
    ['surya pratap'],
    ['9845012345'], // a phone start
    ['+91 98450-12345'],
    [' sur '], // padding is not removed here (the API trims)
    ['50% off_deal'],
  ])('BR-REC-07 clampSearchText(%j) is returned as it is', (q) => {
    expect(search.clampSearchText(q)).toBe(q);
  });

  test('BR-REC-07 an empty string stays an empty string', () => {
    expect(search.clampSearchText('')).toBe('');
  });

  test('BR-REC-07 99 characters are unchanged', () => {
    const q = run(99);
    expect(search.clampSearchText(q)).toBe(q);
  });

  test('BR-REC-07 exactly 100 characters are unchanged (the limit itself is allowed)', () => {
    const q = run(100);
    expect(q).toHaveLength(100);
    expect(search.clampSearchText(q)).toBe(q);
  });
});

describe('BR-REC-07 clampSearchText: longer text is cut to its first 100 characters', () => {
  test('BR-REC-07 101 characters are cut to the first 100', () => {
    const q = run(101);
    expect(search.clampSearchText(q)).toBe(q.slice(0, 100));
  });

  test('BR-REC-07 the cut keeps the start of the text, not the end', () => {
    const q = run(150);
    const clamped = search.clampSearchText(q);
    expect(clamped.startsWith('abcdefghij')).toBe(true);
    expect(clamped).toBe(q.slice(0, 100));
    expect(clamped).not.toBe(q.slice(50));
  });

  test('BR-REC-07 a long paste (500 characters) is cut to exactly 100 characters', () => {
    const q = run(500);
    const clamped = search.clampSearchText(q);
    expect(clamped).toHaveLength(100);
    expect(clamped).toBe(q.slice(0, 100));
  });

  test('BR-REC-07 a long text of digits is cut to the first 100 digits', () => {
    const q = '7'.repeat(120);
    expect(search.clampSearchText(q)).toBe('7'.repeat(100));
  });

  test('BR-REC-07 a long text with spaces inside is cut by characters, spaces count', () => {
    const q = `${'ab '.repeat(50)}tail`; // 150 + 4 characters
    const clamped = search.clampSearchText(q);
    expect(clamped).toHaveLength(100);
    expect(clamped).toBe(q.slice(0, 100));
  });

  test('BR-REC-07 the result is never longer than 100 characters', () => {
    for (const n of [0, 1, 2, 99, 100, 101, 102, 199, 200, 1000]) {
      expect(search.clampSearchText(run(n)).length).toBeLessThanOrEqual(100);
    }
  });

  test('BR-REC-07 clamping twice gives the same text as clamping once', () => {
    for (const n of [0, 5, 100, 101, 400]) {
      const once = search.clampSearchText(run(n));
      expect(search.clampSearchText(once)).toBe(once);
    }
  });
});
