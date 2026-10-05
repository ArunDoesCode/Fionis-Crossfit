// Spec: docs/specs/member-records/members.md
//   BR-REC-52 — status comes from the latest period: Ended / Ends soon (ending today counts) / Active,
//               including a period that has not started yet ("Starts 20 Oct"); the membership-maths table:
//               end 10 Oct, today 3 Oct -> "Ends in 7 days"; end 3 Oct -> "Ends today"; end 2 Oct -> "Ended
//               yesterday"; starts 20 Oct -> "Starts 20 Oct".
//   BR-REC-59 — the member page shows the membership (plan, status, days left): "Annual · Active · 241 days left".
//   BR-REC-125 (ux.md) — status is never shown by colour alone: every badge has words (Active, Ends in 5 days,
//               Ended, Archived) plus a colour (tone).
//   BR-REC-127 (ux.md) — "today", "tomorrow", "yesterday", "N days ago" come from `formatRelativeDay`.
// Interface: docs/specs/member-records/members.md — `@/lib/members/membershipText`:
//   `PLAN_LABELS`, `membershipStatusText(m, today)` -> { label, detail, tone },
//   `memberListBadge(item, today)` -> { text, tone }.
import { beforeAll, describe, expect, test } from 'bun:test';
import { addDays } from '@/lib/domain/dates';

type Status = 'active' | 'expiring' | 'expired';
type Plan = 'monthly' | 'quarterly' | 'half_annual' | 'annual';

interface StatusInput {
  status: Status;
  startOn?: string;
  endOn: string;
  daysLeft: number;
}

interface StatusText {
  label: 'Active' | 'Ends soon' | 'Ended';
  detail: string;
  tone: 'success' | 'warning' | 'neutral';
}

interface ListItem {
  id: string;
  fullName: string;
  phone: string;
  lastAssessedOn: string | null;
  archivedAt: string | null;
  membership: { status: Status; plan: Plan; endOn: string; daysLeft: number };
}

interface Badge {
  text: string;
  tone: 'success' | 'warning' | 'neutral';
}

interface MembershipText {
  PLAN_LABELS: Record<Plan, string>;
  membershipStatusText(m: StatusInput, today: string): StatusText;
  memberListBadge(item: ListItem, today: string): Badge;
}

let text: MembershipText;

beforeAll(async () => {
  text = (await import('@/lib/members/membershipText')) as unknown as MembershipText;
});

const TODAY = '2026-10-03';

describe('BR-REC-59 PLAN_LABELS', () => {
  test('BR-REC-59 the four plans are Monthly, Quarterly, Half-annual, Annual', () => {
    expect(text.PLAN_LABELS).toEqual({
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      half_annual: 'Half-annual',
      annual: 'Annual',
    });
  });
});

describe('BR-REC-52 membershipStatusText, Active', () => {
  test('BR-REC-52 ends 31 Dec, today 3 Oct: Active, "89 days left", success', () => {
    expect(
      text.membershipStatusText(
        { status: 'active', startOn: '2026-01-01', endOn: '2026-12-31', daysLeft: 89 },
        TODAY,
      ),
    ).toEqual({ label: 'Active', detail: '89 days left', tone: 'success' });
  });

  test('BR-REC-59 "Annual · Active · 241 days left": the detail is "241 days left"', () => {
    const result = text.membershipStatusText(
      { status: 'active', startOn: '2025-06-01', endOn: '2027-05-31', daysLeft: 241 },
      TODAY,
    );
    expect(result.label).toBe('Active');
    expect(result.detail).toBe('241 days left');
  });

  test('BR-REC-52 one day left is "1 day left" (singular)', () => {
    // lead days of 0 make a period ending tomorrow still Active
    const result = text.membershipStatusText(
      { status: 'active', startOn: '2026-01-01', endOn: '2026-10-04', daysLeft: 1 },
      TODAY,
    );
    expect(result).toEqual({ label: 'Active', detail: '1 day left', tone: 'success' });
  });

  test('BR-REC-52 without a start date, an Active period shows its days left', () => {
    expect(
      text.membershipStatusText({ status: 'active', endOn: '2026-12-31', daysLeft: 89 }, TODAY),
    ).toEqual({ label: 'Active', detail: '89 days left', tone: 'success' });
  });

  test('BR-REC-52 a period that started earlier shows days left, not "Starts"', () => {
    const result = text.membershipStatusText(
      { status: 'active', startOn: '2026-10-02', endOn: '2026-11-01', daysLeft: 29 },
      TODAY,
    );
    expect(result.detail).toBe('29 days left');
  });

  test('BR-REC-52 a period that starts today has started: days left, not "Starts"', () => {
    const result = text.membershipStatusText(
      { status: 'active', startOn: TODAY, endOn: '2026-11-02', daysLeft: 30 },
      TODAY,
    );
    expect(result.detail).toBe('30 days left');
  });

  test('BR-REC-52 starts 20 Oct, today 3 Oct: Active, "Starts 20 Oct"', () => {
    expect(
      text.membershipStatusText(
        { status: 'active', startOn: '2026-10-20', endOn: '2026-11-19', daysLeft: 47 },
        TODAY,
      ),
    ).toEqual({ label: 'Active', detail: 'Starts 20 Oct', tone: 'success' });
  });

  test('BR-REC-52 a start tomorrow is "Starts 4 Oct"', () => {
    const result = text.membershipStatusText(
      { status: 'active', startOn: '2026-10-04', endOn: '2026-11-03', daysLeft: 31 },
      TODAY,
    );
    expect(result.detail).toBe('Starts 4 Oct');
  });

  test('BR-REC-127 a start in another year shows the year: "Starts 5 Jan 2027"', () => {
    const result = text.membershipStatusText(
      { status: 'active', startOn: '2027-01-05', endOn: '2027-02-04', daysLeft: 124 },
      TODAY,
    );
    expect(result.detail).toBe('Starts 5 Jan 2027');
  });
});

describe('BR-REC-52 membershipStatusText, Ends soon', () => {
  test('BR-REC-52 ends 10 Oct, today 3 Oct: Ends soon, "Ends in 7 days", warning', () => {
    expect(
      text.membershipStatusText(
        { status: 'expiring', startOn: '2026-04-11', endOn: '2026-10-10', daysLeft: 7 },
        TODAY,
      ),
    ).toEqual({ label: 'Ends soon', detail: 'Ends in 7 days', tone: 'warning' });
  });

  test('BR-REC-52 ends 3 Oct, today 3 Oct: Ends soon, "Ends today"', () => {
    expect(
      text.membershipStatusText(
        { status: 'expiring', startOn: '2026-04-04', endOn: '2026-10-03', daysLeft: 0 },
        TODAY,
      ),
    ).toEqual({ label: 'Ends soon', detail: 'Ends today', tone: 'warning' });
  });

  test('BR-REC-52 ends 4 Oct, today 3 Oct: Ends soon, "Ends tomorrow"', () => {
    expect(
      text.membershipStatusText(
        { status: 'expiring', startOn: '2026-04-05', endOn: '2026-10-04', daysLeft: 1 },
        TODAY,
      ),
    ).toEqual({ label: 'Ends soon', detail: 'Ends tomorrow', tone: 'warning' });
  });

  test('BR-REC-52 ends in 14 days (the default lead): "Ends in 14 days"', () => {
    const result = text.membershipStatusText(
      { status: 'expiring', startOn: '2026-04-18', endOn: '2026-10-17', daysLeft: 14 },
      TODAY,
    );
    expect(result.label).toBe('Ends soon');
    expect(result.detail).toBe('Ends in 14 days');
  });
});

describe('BR-REC-52 membershipStatusText, Ended', () => {
  test('BR-REC-52 ended 2 Oct, today 3 Oct: Ended, "Ended yesterday", neutral', () => {
    expect(
      text.membershipStatusText(
        { status: 'expired', startOn: '2025-10-03', endOn: '2026-10-02', daysLeft: -1 },
        TODAY,
      ),
    ).toEqual({ label: 'Ended', detail: 'Ended yesterday', tone: 'neutral' });
  });

  test('BR-REC-52 ended 28 Sep, today 3 Oct: "Ended 5 days ago"', () => {
    expect(
      text.membershipStatusText(
        { status: 'expired', startOn: '2025-09-29', endOn: '2026-09-28', daysLeft: -5 },
        TODAY,
      ),
    ).toEqual({ label: 'Ended', detail: 'Ended 5 days ago', tone: 'neutral' });
  });

  test('BR-REC-52 ended 31 May (125 days ago): "Ended 125 days ago"', () => {
    const result = text.membershipStatusText(
      { status: 'expired', startOn: '2025-06-01', endOn: '2026-05-31', daysLeft: -125 },
      TODAY,
    );
    expect(result.label).toBe('Ended');
    expect(result.detail).toBe('Ended 125 days ago');
  });

  test('BR-REC-52 ended 30 Sep, today 3 Oct (across a month start): "Ended 3 days ago"', () => {
    const result = text.membershipStatusText(
      { status: 'expired', endOn: '2026-09-30', daysLeft: -3 },
      '2026-10-03',
    );
    expect(result.detail).toBe('Ended 3 days ago');
  });
});

describe('BR-REC-52 membershipStatusText, the status decides the label and the colour', () => {
  const rows: [Status, StatusText['label'], StatusText['tone']][] = [
    ['active', 'Active', 'success'],
    ['expiring', 'Ends soon', 'warning'],
    ['expired', 'Ended', 'neutral'],
  ];
  for (const [status, label, tone] of rows) {
    test(`BR-REC-125 ${status} is "${label}" with the ${tone} tone`, () => {
      const daysLeft = status === 'expired' ? -10 : status === 'expiring' ? 5 : 100;
      const result = text.membershipStatusText(
        { status, endOn: addDays(TODAY, daysLeft), daysLeft },
        TODAY,
      );
      expect(result.label).toBe(label);
      expect(result.tone).toBe(tone);
      expect(result.detail.trim().length).toBeGreaterThan(0);
    });
  }
});

const item = (status: Status, daysLeft: number, archivedAt: string | null = null): ListItem => ({
  id: 'member-1',
  fullName: 'Anita Rao',
  phone: '+919900011111',
  lastAssessedOn: null,
  archivedAt,
  membership: { status, plan: 'monthly', endOn: addDays(TODAY, daysLeft), daysLeft },
});

describe('BR-REC-125 memberListBadge (S5 Members rows)', () => {
  test('BR-REC-125 Active member: "Active", success', () => {
    expect(text.memberListBadge(item('active', 241), TODAY)).toEqual({
      text: 'Active',
      tone: 'success',
    });
  });

  test('BR-REC-125 an Active member with 40 days left reads just "Active"', () => {
    expect(text.memberListBadge(item('active', 40), TODAY)).toEqual({
      text: 'Active',
      tone: 'success',
    });
  });

  test('BR-REC-125 ends in 4 days: "Ends in 4 days", warning', () => {
    expect(text.memberListBadge(item('expiring', 4), TODAY)).toEqual({
      text: 'Ends in 4 days',
      tone: 'warning',
    });
  });

  test('BR-REC-125 ends in 5 days: "Ends in 5 days" (spec word list)', () => {
    expect(text.memberListBadge(item('expiring', 5), TODAY).text).toBe('Ends in 5 days');
  });

  test('BR-REC-125 ends today: "Ends today", warning', () => {
    expect(text.memberListBadge(item('expiring', 0), TODAY)).toEqual({
      text: 'Ends today',
      tone: 'warning',
    });
  });

  test('BR-REC-125 ends tomorrow: "Ends tomorrow", warning', () => {
    expect(text.memberListBadge(item('expiring', 1), TODAY)).toEqual({
      text: 'Ends tomorrow',
      tone: 'warning',
    });
  });

  test('BR-REC-125 an ended membership: "Ended", neutral', () => {
    expect(text.memberListBadge(item('expired', -1), TODAY)).toEqual({
      text: 'Ended',
      tone: 'neutral',
    });
    expect(text.memberListBadge(item('expired', -40), TODAY)).toEqual({
      text: 'Ended',
      tone: 'neutral',
    });
  });

  test('BR-REC-125 an archived member: "Archived", neutral', () => {
    expect(text.memberListBadge(item('active', 241, '2026-06-02T08:00:00.000Z'), TODAY)).toEqual({
      text: 'Archived',
      tone: 'neutral',
    });
  });

  test.each<[Status, number]>([
    ['active', 100],
    ['expiring', 3],
    ['expired', -20],
  ])(
    'BR-REC-125 an archived member with a %s membership still reads "Archived" (archived wins)',
    (status, daysLeft) => {
      expect(
        text.memberListBadge(item(status, daysLeft, '2026-06-02T08:00:00.000Z'), TODAY),
      ).toEqual({ text: 'Archived', tone: 'neutral' });
    },
  );

  test('BR-REC-125 a badge is never colour alone: every state has words with letters in them', () => {
    const states: [Status, number, string | null][] = [
      ['active', 100, null],
      ['expiring', 14, null],
      ['expiring', 1, null],
      ['expiring', 0, null],
      ['expired', -1, null],
      ['expired', -29, null],
      ['active', 100, '2026-06-02T08:00:00.000Z'],
      ['expired', -3, '2026-06-02T08:00:00.000Z'],
    ];
    for (const [status, daysLeft, archivedAt] of states) {
      const badge = text.memberListBadge(item(status, daysLeft, archivedAt), TODAY);
      expect(/[A-Za-z]{3,}/.test(badge.text)).toBe(true);
    }
  });

  test('BR-REC-125 Active, Ends soon and Ended/Archived are three distinct tones (BR-REC-185)', () => {
    const tones = [
      text.memberListBadge(item('active', 100), TODAY).tone,
      text.memberListBadge(item('expiring', 4), TODAY).tone,
      text.memberListBadge(item('expired', -4), TODAY).tone,
    ];
    expect(new Set(tones).size).toBe(3);
    const archived = text.memberListBadge(
      item('active', 100, '2026-06-02T08:00:00.000Z'),
      TODAY,
    ).tone;
    expect(archived).toBe(text.memberListBadge(item('expired', -4), TODAY).tone);
  });
});
