import type { IntervalUnit } from "../enums";

// STUB (Stream 0 / S1): signatures and docs only. S3 builds the bodies.
// Pure functions: no I/O, no clock (time is an argument). The frontend mirrors
// these names in `frontend/src/lib/domain/dates.ts`. All dates are gym days.

/**
 * A calendar day, `YYYY-MM-DD` (BR-REC-153, 163). A plain `string` alias (not
 * branded) so literals and JSON fixtures typecheck; check with `isIsoDate`.
 */
export type IsoDate = string;

/** True for a real calendar day written exactly `YYYY-MM-DD` (`2026-02-30` is false). */
export function isIsoDate(_value: unknown): _value is IsoDate {
  throw new Error("not implemented");
}

/** `date` plus `days` calendar days (negative goes back). */
export function addDays(_date: IsoDate, _days: number): IsoDate {
  throw new Error("not implemented");
}

/**
 * `date` plus `months` calendar months; lands on the last day of the month when
 * the day does not exist there: 31 Jan + 1 month = 28 Feb (BR-REC-94).
 */
export function addMonths(_date: IsoDate, _months: number): IsoDate {
  throw new Error("not implemented");
}

/** `addMonths` for `unit = "month"`, `addDays(7 * count)` for `unit = "week"` (BR-REC-94). */
export function addInterval(
  _date: IsoDate,
  _count: number,
  _unit: IntervalUnit,
): IsoDate {
  throw new Error("not implemented");
}

/** Whole calendar days from `from` to `to`: positive when `to` is later, 0 for the same day. */
export function daysBetween(_from: IsoDate, _to: IsoDate): number {
  throw new Error("not implemented");
}

/** The calendar day it is at `now` in `timeZone` (IANA name): 23:30 IST on 3 Oct is `2026-10-03` (BR-REC-93). */
export function gymToday(_now: Date, _timeZone: string): IsoDate {
  throw new Error("not implemented");
}

/** Age in whole years on the day `on`: DOB 1982-05-10 on 2026-10-03 is 44. */
export function ageOn(_dateOfBirth: IsoDate, _on: IsoDate): number {
  throw new Error("not implemented");
}
