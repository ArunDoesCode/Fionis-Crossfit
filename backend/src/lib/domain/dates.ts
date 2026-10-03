import type { IntervalUnit } from "../enums";

// Pure functions: no I/O, no clock (time is an argument). The frontend mirrors
// these names in `frontend/src/lib/domain/dates.ts`. All dates are gym days.
// Every calculation runs on UTC fields, so the server's time zone and daylight
// saving never matter; `gymToday` is the only zone-aware function.

/**
 * A calendar day, `YYYY-MM-DD` (BR-REC-153, 163). A plain `string` alias (not
 * branded) so literals and JSON fixtures typecheck; check with `isIsoDate`.
 */
export type IsoDate = string;

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, width: number): string =>
  String(value).padStart(width, "0");

const format = (year: number, month: number, day: number): IsoDate =>
  `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

/** Milliseconds at UTC midnight of a day (`Date.UTC` would read years 0-99 as 19xx). */
function utcMs(year: number, month: number, day: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getTime();
}

/** Days in `month` (1-12) of `year`: day 0 of the next month. */
const daysInMonth = (year: number, month: number): number =>
  new Date(utcMs(year, month + 1, 0)).getUTCDate();

/** Splits a day that must be valid; anything else throws so bad input never becomes a wrong day. */
function parts(date: IsoDate): { year: number; month: number; day: number } {
  const match = typeof date === "string" ? ISO_DATE_PATTERN.exec(date) : null;
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${String(date)}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

const toUtcMs = (date: IsoDate): number => {
  const { year, month, day } = parts(date);
  return utcMs(year, month, day);
};

const fromUtcMs = (ms: number): IsoDate => {
  const d = new Date(ms);
  return format(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** True for a real calendar day written exactly `YYYY-MM-DD` (`2026-02-30` is false). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

/** `date` plus `days` calendar days (negative goes back). */
export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/**
 * `date` plus `months` calendar months; lands on the last day of the month when
 * the day does not exist there: 31 Jan + 1 month = 28 Feb (BR-REC-94).
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  return format(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  );
}

/** `addMonths` for `unit = "month"`, `addDays(7 * count)` for `unit = "week"` (BR-REC-94). */
export function addInterval(
  date: IsoDate,
  count: number,
  unit: IntervalUnit,
): IsoDate {
  return unit === "week" ? addDays(date, count * 7) : addMonths(date, count);
}

/** Whole calendar days from `from` to `to`: positive when `to` is later, 0 for the same day. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** The calendar day it is at `now` in `timeZone` (IANA name): 23:30 IST on 3 Oct is `2026-10-03` (BR-REC-93). */
export function gymToday(now: Date, timeZone: string): IsoDate {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: "year" | "month" | "day"): number =>
    Number(fields.find((field) => field.type === type)?.value);
  return format(pick("year"), pick("month"), pick("day"));
}

/** Age in whole years on the day `on`: DOB 1982-05-10 on 2026-10-03 is 44. */
export function ageOn(dateOfBirth: IsoDate, on: IsoDate): number {
  const born = parts(dateOfBirth);
  const today = parts(on);
  const birthdayPassed =
    today.month > born.month ||
    (today.month === born.month && today.day >= born.day);
  return today.year - born.year - (birthdayPassed ? 0 : 1);
}
