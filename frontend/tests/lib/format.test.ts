// Spec: docs/specs/member-records/ux.md · BR-REC-127 (formats).
// Interface: docs/specs/member-records/ux.md BR-REC-127 and api-contract.md BR-REC-153 (lib/format.ts).
// Calendar days are `YYYY-MM-DD` with no zone (BR-REC-153), so every result must be the same whatever
// time zone the device is in: the zone-sensitive cases below run under several TZ values.
import { afterAll, describe, expect, test } from 'bun:test';
import { formatDay, formatPhone, formatRelativeDay, formatValue } from '@/lib/format';

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

describe('BR-REC-191 formatDay: dd MMM yyyy, year always, one argument', () => {
  test.each([
    // [date, expected]
    ['2026-10-03', '03 Oct 2026'], // spec example; this year too (Q4)
    ['2025-06-01', '01 Jun 2025'], // spec example: Joined 1 Jun 2025 -> "01 Jun 2025"
    ['2026-01-05', '05 Jan 2026'],
    ['2026-12-31', '31 Dec 2026'],
    ['2028-02-29', '29 Feb 2028'], // leap day
    ['2027-01-05', '05 Jan 2027'],
    ['1982-05-10', '10 May 1982'],
  ])('BR-REC-191 formatDay(%s) is "%s"', (date, expected) => {
    expect(formatDay(date)).toBe(expected);
  });

  test('BR-REC-191 a second argument (today) does not change the result', () => {
    const loose = formatDay as (date: string, today?: string) => string;
    expect(loose('2026-10-03', '2026-10-03')).toBe('03 Oct 2026');
    expect(loose('2026-10-03', '2030-01-01')).toBe('03 Oct 2026');
  });

  test.each([
    ['2026-01-20', '20 Jan 2026'],
    ['2026-02-20', '20 Feb 2026'],
    ['2026-03-20', '20 Mar 2026'],
    ['2026-04-20', '20 Apr 2026'],
    ['2026-05-20', '20 May 2026'],
    ['2026-06-20', '20 Jun 2026'],
    ['2026-07-20', '20 Jul 2026'],
    ['2026-08-20', '20 Aug 2026'],
    ['2026-09-20', '20 Sep 2026'], // three-letter month names
    ['2026-10-20', '20 Oct 2026'],
    ['2026-11-20', '20 Nov 2026'],
    ['2026-12-20', '20 Dec 2026'],
  ])('BR-REC-191 formatDay names the month of %s as "%s"', (date, expected) => {
    expect(formatDay(date)).toBe(expected);
  });

  test.each(ZONES)('BR-REC-191 formatDay gives the same calendar day in time zone %s', (zone) => {
    inZone(zone, () => {
      expect(formatDay('2026-01-01')).toBe('01 Jan 2026');
      expect(formatDay('2026-12-31')).toBe('31 Dec 2026');
      expect(formatDay('2025-01-01')).toBe('01 Jan 2025');
      expect(formatDay('2025-12-31')).toBe('31 Dec 2025');
    });
  });
});

describe('BR-REC-127 formatRelativeDay', () => {
  const TODAY = '2026-10-03';

  test.each([
    // [date, today, expected]
    ['2026-10-03', TODAY, 'today'],
    ['2026-10-04', TODAY, 'tomorrow'], // example: "Due 4 Oct, today 3 Oct -> Due tomorrow"
    ['2026-10-02', TODAY, 'yesterday'], // members.md example: "Ended yesterday"
    ['2026-10-05', TODAY, 'in 2 days'],
    ['2026-10-06', TODAY, 'in 3 days'],
    ['2026-10-13', TODAY, 'in 10 days'],
    ['2026-10-01', TODAY, '2 days ago'],
    ['2026-09-30', TODAY, '3 days ago'],
    ['2026-09-23', TODAY, '10 days ago'],
  ])('BR-REC-127 formatRelativeDay(%s, today %s) is "%s"', (date, today, expected) => {
    expect(formatRelativeDay(date, today)).toBe(expected);
  });

  test.each([
    ['month end', '2026-11-02', '2026-10-30', 'in 3 days'],
    ['month start going back', '2026-02-26', '2026-03-01', '3 days ago'],
    ['year end', '2027-01-02', '2026-12-30', 'in 3 days'],
    ['year start going back', '2025-12-30', '2026-01-02', '3 days ago'],
    ['leap February going back', '2028-02-27', '2028-03-01', '3 days ago'],
    ['leap February going forward', '2028-03-01', '2028-02-27', 'in 3 days'],
    ['plain February going forward', '2026-03-01', '2026-02-27', 'in 2 days'],
    ['next day across a month end', '2026-11-01', '2026-10-31', 'tomorrow'],
    ['previous day across a year start', '2025-12-31', '2026-01-01', 'yesterday'],
  ])(
    'BR-REC-127 formatRelativeDay counts calendar days across a %s',
    (_name, date, today, expected) => {
      expect(formatRelativeDay(date, today)).toBe(expected);
    },
  );

  // Daylight-saving days are 23 or 25 hours long; counting must still be in whole calendar days.
  test.each([
    ['America/New_York', '2026-03-08', '2026-03-09', 'tomorrow'], // clocks forward 8 Mar 2026
    ['America/New_York', '2026-03-07', '2026-03-09', 'in 2 days'],
    ['America/New_York', '2026-11-01', '2026-11-02', 'tomorrow'], // clocks back 1 Nov 2026
    ['America/New_York', '2026-11-03', '2026-11-01', '2 days ago'],
    ['America/Los_Angeles', '2026-03-08', '2026-03-09', 'tomorrow'],
    ['America/Los_Angeles', '2026-11-02', '2026-11-01', 'yesterday'],
    ['Pacific/Auckland', '2026-09-26', '2026-09-27', 'tomorrow'], // clocks forward 27 Sep 2026
    ['Pacific/Auckland', '2026-04-05', '2026-04-04', 'yesterday'], // clocks back 5 Apr 2026
    ['Pacific/Auckland', '2026-04-03', '2026-04-05', 'in 2 days'],
  ])(
    'BR-REC-127 formatRelativeDay is exact around a clock change in %s (today %s, date %s)',
    (zone, today, date, expected) => {
      inZone(zone, () => {
        expect(formatRelativeDay(date, today)).toBe(expected);
      });
    },
  );

  test.each(ZONES)('BR-REC-127 formatRelativeDay does not depend on time zone %s', (zone) => {
    inZone(zone, () => {
      expect(formatRelativeDay('2026-10-03', '2026-10-03')).toBe('today');
      expect(formatRelativeDay('2026-10-04', '2026-10-03')).toBe('tomorrow');
      expect(formatRelativeDay('2026-10-02', '2026-10-03')).toBe('yesterday');
      expect(formatRelativeDay('2026-10-06', '2026-10-03')).toBe('in 3 days');
      expect(formatRelativeDay('2026-10-01', '2026-10-03')).toBe('2 days ago');
    });
  });
});

describe('BR-REC-127 formatValue', () => {
  test.each([
    // [value, decimals, unit, expected]
    [95.5, 1, 'kg', '95.5 kg'], // spec example
    [24, 1, '%', '24.0 %'], // spec example: decimals are always shown, a space before the unit
    [102, 1, 'kg', '102.0 kg'], // digits line up with "95.5" (BR-REC-123)
    [95, 1, 'kg', '95.0 kg'],
    [0, 1, 'kg', '0.0 kg'],
    [12, 0, 'reps', '12 reps'],
    [12.4, 0, 'reps', '12 reps'],
    [12.6, 0, 'reps', '13 reps'],
    [7, 2, 'cm', '7.00 cm'],
    [7.25, 2, 'cm', '7.25 cm'],
    [7.256, 2, 'cm', '7.26 cm'],
    [95.46, 1, 'kg', '95.5 kg'],
    [95.44, 1, 'kg', '95.4 kg'],
  ] as const)(
    'BR-REC-127 formatValue(%d, %d decimals, "%s") is "%s"',
    (value, decimals, unit, expected) => {
      expect(formatValue(value, decimals, unit)).toBe(expected);
    },
  );

  test('BR-REC-127 formatValue keeps the unit exactly as given', () => {
    expect(formatValue(1.5, 1, 'm')).toBe('1.5 m');
    expect(formatValue(180, 0, 'cm')).toBe('180 cm');
  });
});

describe('BR-REC-127 formatPhone', () => {
  test('BR-REC-127 formats a ten-digit phone as two groups of five', () => {
    expect(formatPhone('9845012345')).toBe('98450 12345'); // spec example
  });

  test('BR-REC-127 keeps every digit, including leading zeros', () => {
    expect(formatPhone('0123456789')).toBe('01234 56789');
    expect(formatPhone('0000000000')).toBe('00000 00000');
  });
});
