import type { IsoDate } from "../lib/domain/dates";

// Pure rules of the memberships stream (no I/O, no clock): BR-REC-09, 53, 58.

/** "Recently ended" window of E24 and Home: ended 30 days ago is listed, 31 is not (BR-REC-53, Q2). */
export const RECENTLY_ENDED_DAYS = 30;

type Span = { startOn: IsoDate; endOn: IsoDate };

/** Two periods overlap when they share at least one day, both end days included (BR-REC-09). */
export function periodsOverlap(a: Span, b: Span): boolean {
  return a.startOn <= b.endOn && b.startOn <= a.endOn;
}

/** The period covers `day`, its first and last day included. */
export function coversDay(period: Span, day: IsoDate): boolean {
  return period.startOn <= day && day <= period.endOn;
}

/**
 * Saving a period (renew or edit) brings an archived member back when it covers today;
 * a period that does not (an old binder entry) never does (BR-REC-58).
 */
export function restoresMember(
  archived: boolean,
  savedPeriod: Span,
  today: IsoDate,
): boolean {
  return archived && coversDay(savedPeriod, today);
}
