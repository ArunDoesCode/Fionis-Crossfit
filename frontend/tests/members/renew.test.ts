// Spec: docs/specs/member-records/members.md
//   BR-REC-54 — Renew opens with the last plan and start = last end + 1 day, both changeable, and shows the new
//               end date before saving ("Annual ended 31 May -> Renew -> Ends 31 May 2027").
//   BR-REC-09 — renewal default start = previous end + 1 day.
//   BR-REC-58 — saving a membership period that covers today restores an archived member; the S9 sheet then says
//               "Renewing brings Surya back to the list."; a period that does not cover today (an old binder
//               entry, or one that starts later) never does.
// Interface: docs/specs/member-records/members.md — `@/lib/members/renew`:
//   `renewDefaults(periods)` -> { plan, startOn } from the latest period by `startOn`;
//   `renewRestoresMember(archived, period, today)`.
import { beforeAll, describe, expect, test } from 'bun:test';
import { membershipEnd } from '@/lib/domain/membership';

type Plan = 'monthly' | 'quarterly' | 'half_annual' | 'annual';

interface Period {
  plan: Plan;
  startOn: string;
  endOn: string;
}

interface Renew {
  renewDefaults(periods: Period[]): { plan: Plan; startOn: string };
  renewRestoresMember(
    archived: boolean,
    period: { startOn: string; endOn: string },
    today: string,
  ): boolean;
}

let renew: Renew;

beforeAll(async () => {
  renew = (await import('@/lib/members/renew')) as unknown as Renew;
});

const annual2025: Period = { plan: 'annual', startOn: '2025-06-01', endOn: '2026-05-31' };

describe('BR-REC-54 renewDefaults', () => {
  test('BR-REC-54 annual ended 31 May 2026: Renew opens with Annual, starting 1 Jun 2026', () => {
    expect(renew.renewDefaults([annual2025])).toEqual({ plan: 'annual', startOn: '2026-06-01' });
  });

  test('BR-REC-54 "Annual ended 31 May -> Renew -> Ends 31 May 2027": the new end date follows from the defaults', () => {
    const defaults = renew.renewDefaults([annual2025]);
    expect(membershipEnd(defaults.plan, defaults.startOn)).toBe('2027-05-31');
  });

  test.each<[string, Period, { plan: Plan; startOn: string }]>([
    [
      'a monthly period ending 14 Feb',
      { plan: 'monthly', startOn: '2026-01-15', endOn: '2026-02-14' },
      { plan: 'monthly', startOn: '2026-02-15' },
    ],
    [
      'a quarterly period ending 31 May',
      { plan: 'quarterly', startOn: '2026-03-01', endOn: '2026-05-31' },
      { plan: 'quarterly', startOn: '2026-06-01' },
    ],
    [
      'a half-annual period ending 9 Oct',
      { plan: 'half_annual', startOn: '2026-04-10', endOn: '2026-10-09' },
      { plan: 'half_annual', startOn: '2026-10-10' },
    ],
    [
      'a period ending on the last day of February (28 Feb)',
      { plan: 'monthly', startOn: '2026-01-31', endOn: '2026-02-28' },
      { plan: 'monthly', startOn: '2026-03-01' },
    ],
    [
      'a period ending on 29 Feb of a leap year',
      { plan: 'monthly', startOn: '2028-01-30', endOn: '2028-02-29' },
      { plan: 'monthly', startOn: '2028-03-01' },
    ],
    [
      'a period ending on 31 Dec (the start moves into the next year)',
      { plan: 'annual', startOn: '2026-01-01', endOn: '2026-12-31' },
      { plan: 'annual', startOn: '2027-01-01' },
    ],
    [
      'a period ending on the last day of a 30-day month',
      { plan: 'quarterly', startOn: '2026-07-01', endOn: '2026-09-30' },
      { plan: 'quarterly', startOn: '2026-10-01' },
    ],
  ])('BR-REC-09 %s: the next start is the day after', (_label, period, expected) => {
    expect(renew.renewDefaults([period])).toEqual(expected);
  });

  const first: Period = { plan: 'monthly', startOn: '2026-01-15', endOn: '2026-02-14' };
  const second: Period = { plan: 'quarterly', startOn: '2026-02-15', endOn: '2026-05-14' };
  const third: Period = { plan: 'half_annual', startOn: '2026-05-15', endOn: '2026-11-14' };
  const expected: { plan: Plan; startOn: string } = { plan: 'half_annual', startOn: '2026-11-15' };

  test('BR-REC-54 the latest period by start wins when the list is newest first (as the member page gets it)', () => {
    expect(renew.renewDefaults([third, second, first])).toEqual(expected);
  });

  test('BR-REC-54 the latest period by start wins when the list is oldest first', () => {
    expect(renew.renewDefaults([first, second, third])).toEqual(expected);
  });

  test('BR-REC-54 the latest period by start wins when the list is in no order', () => {
    expect(renew.renewDefaults([second, third, first])).toEqual(expected);
    expect(renew.renewDefaults([first, third, second])).toEqual(expected);
  });

  test('BR-REC-54 the plan of the latest period is used, not the plan of the first', () => {
    expect(renew.renewDefaults([first, second]).plan).toBe('quarterly');
  });

  test('BR-REC-54 renewDefaults leaves the list it was given as it was (a pure function)', () => {
    const periods = [first, third, second];
    const copy = structuredClone(periods);
    renew.renewDefaults(periods);
    expect(periods).toEqual(copy);
  });

  test('BR-REC-54 a period that has not started yet is still the latest: renewing again starts after it', () => {
    const future: Period = { plan: 'monthly', startOn: '2026-11-01', endOn: '2026-11-30' };
    expect(renew.renewDefaults([annual2025, future])).toEqual({
      plan: 'monthly',
      startOn: '2026-12-01',
    });
  });
});

describe('BR-REC-58 renewRestoresMember', () => {
  const TODAY = '2026-10-03';

  test('BR-REC-58 Renew from today on an archived member: true ("Renewing brings Surya back to the list.")', () => {
    // Renewing an annual membership that ended on 31 May, starting today.
    expect(
      renew.renewRestoresMember(true, { startOn: '2026-10-03', endOn: '2027-10-02' }, TODAY),
    ).toBe(true);
  });

  test('BR-REC-58 an old binder entry on an archived member: false (they stay archived)', () => {
    expect(
      renew.renewRestoresMember(true, { startOn: '2025-06-01', endOn: '2026-05-31' }, TODAY),
    ).toBe(false);
  });

  test.each<[string, { startOn: string; endOn: string }, boolean]>([
    ['starts a month ago, ends next month', { startOn: '2026-09-01', endOn: '2026-11-02' }, true],
    ['starts today', { startOn: '2026-10-03', endOn: '2026-11-02' }, true],
    ['ends today', { startOn: '2026-09-04', endOn: '2026-10-03' }, true],
    ['starts and ends today', { startOn: '2026-10-03', endOn: '2026-10-03' }, true],
    ['ended yesterday', { startOn: '2026-09-03', endOn: '2026-10-02' }, false],
    ['starts tomorrow', { startOn: '2026-10-04', endOn: '2026-11-03' }, false],
    [
      'an old binder entry (all in the past)',
      { startOn: '2025-06-01', endOn: '2026-05-31' },
      false,
    ],
    ['starts far in the future', { startOn: '2027-01-01', endOn: '2027-12-31' }, false],
  ])('BR-REC-58 archived member, period that %s: %s', (_label, period, expected) => {
    expect(renew.renewRestoresMember(true, period, TODAY)).toBe(expected);
  });

  test.each<[string, { startOn: string; endOn: string }]>([
    ['covers today', { startOn: '2026-09-01', endOn: '2026-11-02' }],
    ['starts today', { startOn: '2026-10-03', endOn: '2026-11-02' }],
    ['ended yesterday', { startOn: '2026-09-03', endOn: '2026-10-02' }],
    ['starts tomorrow', { startOn: '2026-10-04', endOn: '2026-11-03' }],
  ])('BR-REC-58 a member who is not archived: false whatever the period (%s)', (_label, period) => {
    expect(renew.renewRestoresMember(false, period, TODAY)).toBe(false);
  });

  test('BR-REC-58 "today" is the argument: the same period covers one day and not the next', () => {
    const period = { startOn: '2026-10-03', endOn: '2026-10-10' };
    expect(renew.renewRestoresMember(true, period, '2026-10-02')).toBe(false);
    expect(renew.renewRestoresMember(true, period, '2026-10-03')).toBe(true);
    expect(renew.renewRestoresMember(true, period, '2026-10-10')).toBe(true);
    expect(renew.renewRestoresMember(true, period, '2026-10-11')).toBe(false);
  });
});
