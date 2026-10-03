import { addDays, addMonths, daysBetween, type IsoDate } from './dates';

// Pure functions (BR-REC-08, 51, 52). Mirrors `backend/src/lib/domain/membership.ts`; both pass the
// same golden fixture `tests/fixtures/membership-end-cases.json`.

export type Plan = 'monthly' | 'quarterly' | 'half_annual' | 'annual';

/** Calendar months each plan covers. */
export const PLAN_MONTHS: Record<Plan, number> = {
  monthly: 1,
  quarterly: 3,
  half_annual: 6,
  annual: 12,
};

/**
 * Last covered day of a `plan` period that starts on `startOn` (BR-REC-51): the day before the same
 * date N months later; when that date does not exist in that month, the month's last day
 * (monthly from 15 Jan ends 14 Feb; from 31 Jan ends 28 Feb).
 */
export const membershipEnd = (plan: Plan, startOn: IsoDate): IsoDate => {
  const sameDateLater = addMonths(startOn, PLAN_MONTHS[plan]);
  const dateExists = sameDateLater.slice(8) === startOn.slice(8); // addMonths clamps when it does not
  return dateExists ? addDays(sameDateLater, -1) : sameDateLater;
};

/**
 * Status of the latest period on `today` (BR-REC-52): `expired` when its end is before today,
 * `expiring` when it ends within `leadDays` days (inclusive; ending today counts), otherwise `active`
 * (including a period that has not started yet). `daysLeft` is days from today to the end date
 * (0 = ends today, negative = ended). Null with no period.
 */
export const membershipStatus = (
  latest: { startOn: IsoDate; endOn: IsoDate } | null,
  today: IsoDate,
  leadDays: number,
): { status: 'active' | 'expiring' | 'expired'; daysLeft: number } | null => {
  if (!latest) return null;
  const daysLeft = daysBetween(today, latest.endOn);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  return { status: daysLeft <= leadDays ? 'expiring' : 'active', daysLeft };
};
