// Spec: docs/specs/member-records/progress.md (v2)
//   BR-REC-106 each measurement shows first and latest "(with dates)".
//   BR-REC-108 the segmental table shows its date "(≈ when estimated)". Example: "Arms missing on 12 Sep".
//   BR-REC-127 (ux.md) dates: "3 Oct 2026", the year left out when it is this year; "about" is written ≈
//              (word list: estimated -> About (≈)).
// Interface: docs/specs/member-records/progress.md — `@/lib/progress/text`:
//   `readingDateText(on, isEstimated, today)`: estimated -> "≈ Dec 2025" (short month name + year, always the year);
//   otherwise `formatDay(on, today)`. Calendar days have no zone (BR-REC-153), so the result is the same
//   in every time zone.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

interface Text {
  readingDateText(on: string, isEstimated: boolean, today: string): string;
}

let text: Text;

beforeAll(async () => {
  text = (await import('@/lib/progress/text')) as unknown as Text;
});

const ZONES: string[] = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Auckland'];
// Put back whatever zone the machine was using. (Assign it; deleting TZ does not switch the zone back in Bun.)
const machineZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

const inZone = <T>(zone: string, run: () => T): T => {
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    process.env.TZ = machineZone;
  }
};

afterAll(() => {
  process.env.TZ = machineZone;
});

const TODAY = '2026-10-03';

describe('BR-REC-106 / 127 readingDateText for a measured date', () => {
  test.each([
    ['2026-09-12', '12 Sep 2026'], // this year: no year (BR-REC-108 example date)
    ['2026-10-03', '03 Oct 2026'], // today
    ['2026-01-05', '05 Jan 2026'],
    ['2025-12-12', '12 Dec 2025'], // another year: the year is shown
    ['2025-06-01', '01 Jun 2025'], // S12 sketch: Joined 1 Jun 2025
    ['2027-01-05', '05 Jan 2027'],
  ])('BR-REC-127 readingDateText(%s, measured) is "%s"', (on, expected) => {
    expect(text.readingDateText(on, false, TODAY)).toBe(expected);
  });

  test('BR-REC-127 a measured date always shows its year (BR-REC-191), whatever "today" is', () => {
    expect(text.readingDateText('2026-09-12', false, '2027-01-02')).toBe('12 Sep 2026');
    expect(text.readingDateText('2026-09-12', false, '2026-12-31')).toBe('12 Sep 2026');
  });
});

describe('BR-REC-108 readingDateText for an estimated date', () => {
  test.each([
    ['2025-12-12', '≈ Dec 2025'], // contract example
    ['2026-09-12', '≈ Sep 2026'], // the year is always shown, even this year
    ['2026-10-03', '≈ Oct 2026'],
    ['2024-02-29', '≈ Feb 2024'],
  ])('BR-REC-108 readingDateText(%s, estimated) is "%s"', (on, expected) => {
    expect(text.readingDateText(on, true, TODAY)).toBe(expected);
  });

  test.each([
    ['2026-01-15', '≈ Jan 2026'],
    ['2026-02-15', '≈ Feb 2026'],
    ['2026-03-15', '≈ Mar 2026'],
    ['2026-04-15', '≈ Apr 2026'],
    ['2026-05-15', '≈ May 2026'],
    ['2026-06-15', '≈ Jun 2026'],
    ['2026-07-15', '≈ Jul 2026'],
    ['2026-08-15', '≈ Aug 2026'],
    ['2026-09-15', '≈ Sep 2026'], // three letters ("Sep", not "Sept")
    ['2026-10-15', '≈ Oct 2026'],
    ['2026-11-15', '≈ Nov 2026'],
    ['2026-12-15', '≈ Dec 2026'],
  ])('BR-REC-108 the month of %s is named in three letters: "%s"', (on, expected) => {
    expect(text.readingDateText(on, true, TODAY)).toBe(expected);
  });

  test('BR-REC-108 the first and the last day of a month give the same month', () => {
    expect(text.readingDateText('2026-03-01', true, TODAY)).toBe('≈ Mar 2026');
    expect(text.readingDateText('2026-03-31', true, TODAY)).toBe('≈ Mar 2026');
  });

  test('BR-REC-108 the day is left out, and the text starts with the approx sign and a space', () => {
    const shown = text.readingDateText('2025-12-12', true, TODAY);
    expect(shown.startsWith('≈ ')).toBe(true);
    expect(shown).not.toContain('12');
  });

  test('BR-REC-108 the estimated text does not depend on "today"', () => {
    expect(text.readingDateText('2025-12-12', true, '2025-12-13')).toBe('≈ Dec 2025');
    expect(text.readingDateText('2025-12-12', true, '2030-01-01')).toBe('≈ Dec 2025');
  });
});

describe('BR-REC-153 readingDateText gives the same calendar day in every time zone', () => {
  test.each(ZONES)('readingDateText is the same in time zone %s', (zone) => {
    inZone(zone, () => {
      expect(text.readingDateText('2026-01-01', false, TODAY)).toBe('01 Jan 2026');
      expect(text.readingDateText('2025-12-31', false, TODAY)).toBe('31 Dec 2025');
      expect(text.readingDateText('2026-01-01', true, TODAY)).toBe('≈ Jan 2026');
      expect(text.readingDateText('2025-12-31', true, TODAY)).toBe('≈ Dec 2025');
      expect(text.readingDateText('2026-03-31', true, TODAY)).toBe('≈ Mar 2026');
    });
  });
});
