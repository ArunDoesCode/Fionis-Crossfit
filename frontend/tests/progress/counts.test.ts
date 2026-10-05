// Spec: docs/specs/member-records/progress.md (v2)
//   BR-REC-111 "it shows n, the average change ... and Improved / No change / Worse counts" (the S13 sketch draws
//              them as one bar: [====8====][=3=][1]).
//   BR-REC-113 (wording amended by ux v10 BR-REC-228, see the notCountedText block at the end).
//   BR-REC-23  "Only members with 2+ readings count, and n is shown."
//   S13 sketch: "n = 12 · 5 not counted", "Improved 8 · No change 3 · Worse 1".
// Interface: docs/specs/member-records/progress.md — `@/lib/progress/text`:
//   `outcomeShares(counts)`: whole percents with the same keys, summing to 100 (largest remainder; ties go
//   improved, noChange, worse); all 0 when the total is 0. `notCountedText(n, notCounted)`:
//   "n = 12 · 5 with one reading not counted"; `notCounted` 0 -> "n = 12".
import { beforeAll, describe, expect, test } from 'bun:test';

interface Counts {
  improved: number;
  noChange: number;
  worse: number;
}

interface Text {
  outcomeShares(counts: Counts): Counts;
  notCountedText(n: number, notCounted: number): string;
}

let text: Text;

beforeAll(async () => {
  text = (await import('@/lib/progress/text')) as unknown as Text;
});

const counts = (improved: number, noChange: number, worse: number): Counts => ({
  improved,
  noChange,
  worse,
});

describe('BR-REC-111 outcomeShares: the bar of Improved / No change / Worse', () => {
  test.each([
    [counts(8, 3, 1), counts(67, 25, 8)], // the S13 sketch: 8 / 3 / 1 of 12
    [counts(1, 1, 1), counts(34, 33, 33)], // three-way tie: the extra point goes to improved
    [counts(1, 1, 0), counts(50, 50, 0)],
    [counts(1, 0, 1), counts(50, 0, 50)],
    [counts(0, 1, 1), counts(0, 50, 50)],
    [counts(5, 0, 0), counts(100, 0, 0)],
    [counts(0, 3, 0), counts(0, 100, 0)],
    [counts(0, 0, 9), counts(0, 0, 100)],
    [counts(2, 2, 2), counts(34, 33, 33)],
    [counts(1, 2, 0), counts(33, 67, 0)],
    [counts(1, 0, 2), counts(33, 0, 67)],
    [counts(2, 1, 1), counts(50, 25, 25)],
    [counts(4, 3, 3), counts(40, 30, 30)],
    [counts(3, 3, 1), counts(43, 43, 14)], // two extra points: improved and noChange (tied remainders, in order)
    [counts(1, 3, 3), counts(14, 43, 43)],
  ] as [Counts, Counts][])('BR-REC-111 outcomeShares(%o) is %o', (input, expected) => {
    expect(text.outcomeShares(input)).toEqual(expected);
  });

  test('BR-REC-111 a tied remainder gives the extra point to improved before noChange (1, 1, 6 of 8)', () => {
    expect(text.outcomeShares(counts(1, 1, 6))).toEqual(counts(13, 12, 75));
  });

  test('BR-REC-111 a tied remainder gives the extra point to improved before worse (1, 6, 1 of 8)', () => {
    expect(text.outcomeShares(counts(1, 6, 1))).toEqual(counts(13, 75, 12));
  });

  test('BR-REC-111 a tied remainder gives the extra point to noChange before worse (6, 1, 1 of 8)', () => {
    expect(text.outcomeShares(counts(6, 1, 1))).toEqual(counts(75, 13, 12));
  });

  test('BR-REC-111 nobody counted: all three are 0 (no division by zero, no NaN)', () => {
    expect(text.outcomeShares(counts(0, 0, 0))).toEqual(counts(0, 0, 0));
  });

  test('BR-REC-111 the same counts always give the same shares', () => {
    const input = counts(8, 3, 1);
    expect(text.outcomeShares(input)).toEqual(text.outcomeShares({ ...input }));
  });

  test('BR-REC-111 the counts given are not changed', () => {
    const input = counts(8, 3, 1);
    text.outcomeShares(input);
    expect(input).toEqual(counts(8, 3, 1));
  });

  test('BR-REC-111 for every mix of 0 to 7 per outcome, the shares are whole, never negative, add up to 100, and are within one point of the exact share', () => {
    const problems: string[] = [];
    for (let improved = 0; improved <= 7; improved += 1) {
      for (let noChange = 0; noChange <= 7; noChange += 1) {
        for (let worse = 0; worse <= 7; worse += 1) {
          const input = counts(improved, noChange, worse);
          const total = improved + noChange + worse;
          const shares = text.outcomeShares(input);
          const label = `${improved}/${noChange}/${worse}`;
          if (total === 0) {
            if (shares.improved + shares.noChange + shares.worse !== 0) {
              problems.push(`${label}: expected all 0`);
            }
            continue;
          }
          for (const key of ['improved', 'noChange', 'worse'] as const) {
            const value = shares[key];
            const exact = (input[key] * 100) / total;
            if (!Number.isInteger(value)) problems.push(`${label} ${key} is not whole: ${value}`);
            if (value < 0) problems.push(`${label} ${key} is negative: ${value}`);
            if (!(Math.abs(value - exact) < 1)) {
              problems.push(`${label} ${key} is ${value}, exact ${exact}`);
            }
          }
          const sum = shares.improved + shares.noChange + shares.worse;
          if (sum !== 100) problems.push(`${label} adds up to ${sum}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test('BR-REC-111 an outcome with a count of 0 never gets a share', () => {
    for (const input of [counts(7, 0, 5), counts(0, 7, 5), counts(7, 5, 0), counts(13, 0, 0)]) {
      const shares = text.outcomeShares(input);
      for (const key of ['improved', 'noChange', 'worse'] as const) {
        if (input[key] === 0) expect(shares[key]).toBe(0);
      }
    }
  });

  test('BR-REC-111 large counts still add up to 100', () => {
    const shares = text.outcomeShares(counts(1234, 567, 89));
    expect(shares.improved + shares.noChange + shares.worse).toBe(100);
  });
});

// ux.md v10 BR-REC-228 (amends BR-REC-113, "same numbers"): the count line is
// "Based on 12 members (5 more have only one reading)". Spec gives no wording for 0 left out: only the start is held.
describe('BR-REC-228 (amends BR-REC-113) notCountedText', () => {
  test.each([
    [12, 5, 'Based on 12 members (5 more have only one reading)'], // spec example
    [0, 3, 'Based on 0 members (3 more have only one reading)'],
    [100, 25, 'Based on 100 members (25 more have only one reading)'],
  ])('BR-REC-228 notCountedText(%d, %d) is "%s"', (n, notCounted, expected) => {
    expect(text.notCountedText(n, notCounted)).toBe(expected);
  });

  test('BR-REC-228 with nothing left out the line starts "Based on 12 members" and says nothing about one reading', () => {
    const shown = text.notCountedText(12, 0);
    expect(shown.startsWith('Based on 12 members')).toBe(true);
    expect(shown).not.toContain('only one reading');
  });
});
