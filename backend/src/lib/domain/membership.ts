import type { MembershipStatus, Plan } from "../enums";
import type { IsoDate } from "./dates";

// Pure functions (BR-REC-08, 51, 52). The frontend mirrors these names in
// `frontend/src/lib/domain/membership.ts`.
// Golden fixture: `tests/fixtures/membership-end-cases.json` (both packages).

/** Calendar months per plan (BR-REC-08). */
export const PLAN_MONTHS = {
  monthly: 1,
  quarterly: 3,
  half_annual: 6,
  annual: 12,
} as const satisfies Record<Plan, number>;

/**
 * STUB (S1; S3 builds the body). The last day of a period: the day before the
 * same date `PLAN_MONTHS[plan]` months later, clamped to the month end
 * (BR-REC-51): monthly from 15 Jan 2026 ends 14 Feb; from 31 Jan ends 28 Feb.
 */
export function membershipEnd(_plan: Plan, _startOn: IsoDate): IsoDate {
  throw new Error("not implemented");
}

/**
 * STUB (S1; S3 builds the body). Status of a member's LATEST period (by start;
 * the caller passes only that one, or `null` when there is none) on `today`
 * (BR-REC-52):
 *  - `expired`: its end is before today
 *  - `expiring`: it ends within `leadDays` days (ending today counts)
 *  - `active`: otherwise, including a period that has not started yet
 * `daysLeft` = days from today to the end date (0 = ends today, negative = ended).
 * Returns `null` for `latest = null`.
 */
export function membershipStatus(
  _latest: { startOn: IsoDate; endOn: IsoDate } | null,
  _today: IsoDate,
  _leadDays: number,
): { status: MembershipStatus; daysLeft: number } | null {
  throw new Error("not implemented");
}
