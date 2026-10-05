// Spec: docs/specs/member-records/members.md
//   BR-REC-172 — the page of an archived member, or of one whose membership has ended, starts with a banner
//     saying when: "Archived 02 Jun 2026 · Membership ended 31 May 2026" (the archived part only when archived;
//     "ends" when the membership is still running). The three cases:
//       ended 31 May, not archived -> "Membership ended 31 May 2026"
//       archived 2 Jun while running -> "Archived 02 Jun 2026 · Membership ends 31 Dec 2026"
//       archived and ended -> "Archived 02 Jun 2026 · Membership ended 31 May 2026"
//     Nothing to say (not archived, still running) -> no banner.
//   BR-REC-52 — a period ending today is "Ends soon", not "Ended", so it still "ends".
// Interface: docs/specs/member-records/members.md — `@/lib/members/banner`:
//   `memberBannerText(member, today, timeZone)`: dates always with the year; `archivedAt` (ISO UTC) turned
//   into a day in `timeZone`.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

type Status = 'active' | 'expiring' | 'expired';

interface BannerMember {
  archivedAt: string | null;
  membership: { status: Status; endOn: string };
}

interface Banner {
  memberBannerText(member: BannerMember, today: string, timeZone: string): string | null;
}

let banner: Banner;

beforeAll(async () => {
  banner = (await import('@/lib/members/banner')) as unknown as Banner;
});

const TODAY = '2026-10-03';
const GYM_ZONE = 'Asia/Kolkata';

const member = (archivedAt: string | null, status: Status, endOn: string): BannerMember => ({
  archivedAt,
  membership: { status, endOn },
});

describe('BR-REC-172 memberBannerText, the three cases of the spec', () => {
  test('BR-REC-172 ended 31 May, not archived: "Membership ended 31 May 2026"', () => {
    expect(banner.memberBannerText(member(null, 'expired', '2026-05-31'), TODAY, GYM_ZONE)).toBe(
      'Membership ended 31 May 2026',
    );
  });

  test('BR-REC-172 archived 2 Jun while running: "Archived 02 Jun 2026 · Membership ends 31 Dec 2026"', () => {
    expect(
      banner.memberBannerText(
        member('2026-06-02T08:00:00.000Z', 'active', '2026-12-31'),
        TODAY,
        GYM_ZONE,
      ),
    ).toBe('Archived 02 Jun 2026 · Membership ends 31 Dec 2026');
  });

  test('BR-REC-172 archived and ended: "Archived 02 Jun 2026 · Membership ended 31 May 2026"', () => {
    expect(
      banner.memberBannerText(
        member('2026-06-02T08:00:00.000Z', 'expired', '2026-05-31'),
        TODAY,
        GYM_ZONE,
      ),
    ).toBe('Archived 02 Jun 2026 · Membership ended 31 May 2026');
  });
});

describe('BR-REC-172 memberBannerText, no banner', () => {
  test('BR-REC-172 not archived and Active: null', () => {
    expect(
      banner.memberBannerText(member(null, 'active', '2026-12-31'), TODAY, GYM_ZONE),
    ).toBeNull();
  });

  test('BR-REC-172 not archived and Ends soon (still running): null', () => {
    expect(
      banner.memberBannerText(member(null, 'expiring', '2026-10-10'), TODAY, GYM_ZONE),
    ).toBeNull();
  });

  test('BR-REC-172 not archived and ending today (still running): null', () => {
    expect(banner.memberBannerText(member(null, 'expiring', TODAY), TODAY, GYM_ZONE)).toBeNull();
  });
});

describe('BR-REC-172 memberBannerText, running memberships that are archived', () => {
  test('BR-REC-172 archived while Ends soon: "Membership ends" with the end date', () => {
    expect(
      banner.memberBannerText(
        member('2026-09-30T08:00:00.000Z', 'expiring', '2026-10-10'),
        TODAY,
        GYM_ZONE,
      ),
    ).toBe('Archived 30 Sep 2026 · Membership ends 10 Oct 2026');
  });

  test('BR-REC-52 archived with a membership ending today: still "ends" (ending today is not Ended)', () => {
    expect(
      banner.memberBannerText(
        member('2026-09-30T08:00:00.000Z', 'expiring', TODAY),
        TODAY,
        GYM_ZONE,
      ),
    ).toBe('Archived 30 Sep 2026 · Membership ends 03 Oct 2026');
  });

  test('BR-REC-172 archived and ended yesterday: "ended" (not "ends")', () => {
    expect(
      banner.memberBannerText(
        member('2026-10-01T08:00:00.000Z', 'expired', '2026-10-02'),
        TODAY,
        GYM_ZONE,
      ),
    ).toBe('Archived 01 Oct 2026 · Membership ended 02 Oct 2026');
  });
});

describe('BR-REC-172 memberBannerText, dates always carry the year', () => {
  test('BR-REC-172 a date in the same year as today still shows the year', () => {
    const text = banner.memberBannerText(member(null, 'expired', '2026-09-30'), TODAY, GYM_ZONE);
    expect(text).toBe('Membership ended 30 Sep 2026');
  });

  test('BR-REC-172 dates in an earlier year show their year', () => {
    expect(
      banner.memberBannerText(
        member('2025-12-30T08:00:00.000Z', 'expired', '2025-11-30'),
        TODAY,
        GYM_ZONE,
      ),
    ).toBe('Archived 30 Dec 2025 · Membership ended 30 Nov 2025');
  });

  test('BR-REC-172 dates in a later year show their year', () => {
    expect(
      banner.memberBannerText(
        member('2026-06-02T08:00:00.000Z', 'active', '2027-05-31'),
        TODAY,
        GYM_ZONE,
      ),
    ).toBe('Archived 02 Jun 2026 · Membership ends 31 May 2027');
  });

  test('BR-REC-172 the year follows the dates, not today', () => {
    expect(
      banner.memberBannerText(member(null, 'expired', '2026-05-31'), '2028-01-15', GYM_ZONE),
    ).toBe('Membership ended 31 May 2026');
  });
});

describe('BR-REC-172 memberBannerText, archivedAt is turned into a day in the given time zone', () => {
  // 2026-06-01T20:00Z is 2 Jun 01:30 in India (UTC+5:30) but still 1 Jun in UTC and in Los Angeles.
  const lateEvening = '2026-06-01T20:00:00.000Z';

  test.each([
    ['Asia/Kolkata', 'Archived 02 Jun 2026 · Membership ended 31 May 2026'],
    ['UTC', 'Archived 01 Jun 2026 · Membership ended 31 May 2026'],
    ['America/Los_Angeles', 'Archived 01 Jun 2026 · Membership ended 31 May 2026'],
    ['Pacific/Auckland', 'Archived 02 Jun 2026 · Membership ended 31 May 2026'],
  ])('BR-REC-172 archived at 2026-06-01T20:00Z in %s reads "%s"', (zone, expected) => {
    expect(banner.memberBannerText(member(lateEvening, 'expired', '2026-05-31'), TODAY, zone)).toBe(
      expected,
    );
  });

  test('BR-REC-172 the day changes at midnight of the given zone (18:29Z is 1 Jun in India, 18:30Z is 2 Jun)', () => {
    const before = banner.memberBannerText(
      member('2026-06-01T18:29:59.000Z', 'expired', '2026-05-31'),
      TODAY,
      'Asia/Kolkata',
    );
    const after = banner.memberBannerText(
      member('2026-06-01T18:30:00.000Z', 'expired', '2026-05-31'),
      TODAY,
      'Asia/Kolkata',
    );
    expect(before).toBe('Archived 01 Jun 2026 · Membership ended 31 May 2026');
    expect(after).toBe('Archived 02 Jun 2026 · Membership ended 31 May 2026');
  });

  test('BR-REC-172 the year is the year in the given zone (31 Dec 20:00Z is already next year in India)', () => {
    expect(
      banner.memberBannerText(
        member('2026-12-31T20:00:00.000Z', 'active', '2027-12-31'),
        '2027-01-02',
        'Asia/Kolkata',
      ),
    ).toBe('Archived 01 Jan 2027 · Membership ends 31 Dec 2027');
  });
});

describe('BR-REC-172 memberBannerText does not depend on the time zone of the device', () => {
  // The caller names the zone; the zone the machine runs in must not change the answer.
  const machineZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  afterAll(() => {
    process.env.TZ = machineZone;
  });

  test.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata'])(
    'BR-REC-172 with the device in %s the banner is the same',
    (deviceZone) => {
      process.env.TZ = deviceZone;
      try {
        expect(
          banner.memberBannerText(
            member('2026-06-01T20:00:00.000Z', 'expired', '2026-05-31'),
            TODAY,
            'Asia/Kolkata',
          ),
        ).toBe('Archived 02 Jun 2026 · Membership ended 31 May 2026');
        expect(
          banner.memberBannerText(member(null, 'expired', '2026-05-31'), TODAY, 'Asia/Kolkata'),
        ).toBe('Membership ended 31 May 2026');
      } finally {
        process.env.TZ = machineZone;
      }
    },
  );
});
