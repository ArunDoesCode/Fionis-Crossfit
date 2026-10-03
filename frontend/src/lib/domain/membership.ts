import type { IsoDate } from './dates';

export type Plan = 'monthly' | 'quarterly' | 'half_annual' | 'annual';

/** Calendar months each plan covers. */
export const PLAN_MONTHS: Record<Plan, number> = {
  monthly: 1,
  quarterly: 3,
  half_annual: 6,
  annual: 12,
};

/** Last covered day of a `plan` period that starts on `startOn`. */
export const membershipEnd = (_plan: Plan, _startOn: IsoDate): IsoDate => {
  throw new Error('not implemented');
};

/** Status of the latest period on `today` (`expiring` within `leadDays` of its end); null with no period. */
export const membershipStatus = (
  _latest: { startOn: IsoDate; endOn: IsoDate } | null,
  _today: IsoDate,
  _leadDays: number,
): { status: 'active' | 'expiring' | 'expired'; daysLeft: number } | null => {
  throw new Error('not implemented');
};
