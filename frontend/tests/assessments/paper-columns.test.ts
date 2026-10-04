// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-79 — paper-column chips Q1-Q4 set the date to join date + 0 / 3 / 6 / 9 months and tick
//               "estimated". Example: joined 1 Jun 2025, chip Q3 -> about 1 Dec 2025.
//   D16       — chips Q1-Q4 = join date + 0 / 3 / 6 / 9 calendar months (`addMonths`, month-end clamp).
// Interface: .pipeline/member-records-assessments/contract.md "Admin app interfaces" —
//   `@/lib/assessments/paperColumns`: `paperColumnDate(joinedOn, column)`, `column` 1 | 2 | 3 | 4.
//   Month-end clamp: 31 Aug, Q2 -> 30 Nov.
import { beforeAll, describe, expect, test } from 'bun:test';

type Column = 1 | 2 | 3 | 4;
interface PaperColumns {
  paperColumnDate(joinedOn: string, column: Column): string;
}

let paper: PaperColumns;

beforeAll(async () => {
  paper = (await import('@/lib/assessments/paperColumns')) as unknown as PaperColumns;
});

describe('BR-REC-79 paperColumnDate: Q1-Q4 are join date + 0 / 3 / 6 / 9 months', () => {
  test.each<[string, Column, string]>([
    ['2025-06-01', 1, '2025-06-01'],
    ['2025-06-01', 2, '2025-09-01'],
    ['2025-06-01', 3, '2025-12-01'], // spec example
    ['2025-06-01', 4, '2026-03-01'],
    ['2025-10-15', 1, '2025-10-15'],
    ['2025-10-15', 2, '2026-01-15'], // across a year end
    ['2025-10-15', 3, '2026-04-15'],
    ['2025-10-15', 4, '2026-07-15'],
    ['2026-01-01', 2, '2026-04-01'],
    ['2026-01-01', 3, '2026-07-01'],
    ['2026-01-01', 4, '2026-10-01'],
  ])('BR-REC-79 joined %s, column Q%d is %s', (joinedOn, column, expected) => {
    expect(paper.paperColumnDate(joinedOn, column)).toBe(expected);
  });

  test.each(['2025-06-01', '2024-02-29', '2025-12-31', '2026-10-03'])(
    'BR-REC-79 Q1 is the join date itself (%s)',
    (joinedOn) => {
      expect(paper.paperColumnDate(joinedOn, 1)).toBe(joinedOn);
    },
  );
});

describe('D16 paperColumnDate clamps to the last day of a shorter month', () => {
  test.each<[string, Column, string]>([
    ['2025-08-31', 2, '2025-11-30'], // contract example: 31 Aug, Q2 -> 30 Nov
    ['2025-08-31', 3, '2026-02-28'],
    ['2025-08-31', 4, '2026-05-31'],
    ['2023-08-31', 3, '2024-02-29'], // a leap February
    ['2025-05-31', 2, '2025-08-31'],
    ['2025-05-31', 3, '2025-11-30'],
    ['2025-05-31', 4, '2026-02-28'],
    ['2025-12-31', 2, '2026-03-31'],
    ['2025-12-31', 3, '2026-06-30'],
    ['2025-12-31', 4, '2026-09-30'],
    ['2025-01-31', 2, '2025-04-30'],
    ['2025-01-31', 3, '2025-07-31'],
    ['2025-01-31', 4, '2025-10-31'],
    ['2025-11-30', 4, '2026-08-30'],
    ['2023-11-30', 3, '2024-05-30'],
    ['2024-02-29', 2, '2024-05-29'], // joined on a leap day
    ['2024-02-29', 3, '2024-08-29'],
    ['2024-02-29', 4, '2024-11-29'],
    ['2024-11-29', 4, '2025-08-29'],
  ])('D16 joined %s, column Q%d is %s', (joinedOn, column, expected) => {
    expect(paper.paperColumnDate(joinedOn, column)).toBe(expected);
  });
});

describe('BR-REC-79 paperColumnDate is a plain calendar day (no time zone effect)', () => {
  const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Auckland'];
  const machineZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  test.each(ZONES)('BR-REC-79 Q2 / Q3 / Q4 of 1 Jun 2025 are the same in time zone %s', (zone) => {
    process.env.TZ = zone;
    try {
      expect(paper.paperColumnDate('2025-06-01', 2)).toBe('2025-09-01');
      expect(paper.paperColumnDate('2025-06-01', 3)).toBe('2025-12-01');
      expect(paper.paperColumnDate('2025-06-01', 4)).toBe('2026-03-01');
      expect(paper.paperColumnDate('2025-12-31', 2)).toBe('2026-03-31');
    } finally {
      process.env.TZ = machineZone;
    }
  });
});
