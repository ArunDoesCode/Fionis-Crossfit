// Pure calendar-day maths (BR-REC-93, 94, 105, 03). A day is a `YYYY-MM-DD` string; every
// calculation runs on UTC fields, so the device time zone and daylight saving never matter.
// The only zone-aware function is `gymToday`, which takes the instant as an argument (no clock here).

/** Calendar date as `YYYY-MM-DD` (no time, no zone). */
export type IsoDate = string;

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12; day 0 of the next month

const format = (year: number, month: number, day: number): IsoDate =>
  `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

/** Splits a date already known to be valid. Throws on anything else so bad input never turns into a wrong day. */
const parts = (date: IsoDate): { year: number; month: number; day: number } => {
  const match = typeof date === 'string' ? ISO_DATE_PATTERN.exec(date) : null;
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${String(date)}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const toUtcMs = (date: IsoDate): number => {
  const { year, month, day } = parts(date);
  return Date.UTC(year, month - 1, day);
};

const fromUtcMs = (ms: number): IsoDate => {
  const d = new Date(ms);
  return format(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** True when `value` is a real calendar date written as `YYYY-MM-DD`. */
export const isIsoDate = (value: unknown): value is IsoDate => {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
};

/** `date` plus `days` (negative goes back). */
export const addDays = (date: IsoDate, days: number): IsoDate =>
  fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);

/** `date` plus `months` calendar months; clamps to the month end (31 Jan + 1 = 28/29 Feb). */
export const addMonths = (date: IsoDate, months: number): IsoDate => {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  return format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
};

/** `date` plus `count` weeks (7 days each) or months (calendar, month-end clamped). */
export const addInterval = (date: IsoDate, count: number, unit: 'week' | 'month'): IsoDate =>
  unit === 'week' ? addDays(date, count * 7) : addMonths(date, count);

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);

/** The gym's calendar day at instant `now` in IANA zone `timeZone`. */
export const gymToday = (now: Date, timeZone: string): IsoDate => {
  const fields = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: 'year' | 'month' | 'day'): number =>
    Number(fields.find((field) => field.type === type)?.value);
  return format(pick('year'), pick('month'), pick('day'));
};

/** Completed years of age on `on` for someone born on `dateOfBirth`. */
export const ageOn = (dateOfBirth: IsoDate, on: IsoDate): number => {
  const born = parts(dateOfBirth);
  const today = parts(on);
  const birthdayPassed =
    today.month > born.month || (today.month === born.month && today.day >= born.day);
  return today.year - born.year - (birthdayPassed ? 0 : 1);
};
