import type { IsoDate } from './domain/dates';

// Calendar days are `YYYY-MM-DD` with no zone (BR-REC-153). Everything here works on the digits and on
// UTC midnights, never on the device zone, so a result is the same whatever zone the phone is in.
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MS_PER_DAY = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DayParts {
  year: number;
  month: number;
  day: number;
}

const parseDay = (date: IsoDate): DayParts | null => {
  const match = ISO_DAY.exec(date);
  if (!match) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

// Days since 1 Jan 1970 for a calendar day; UTC has no daylight-saving, so differences are whole days.
const dayNumber = ({ year, month, day }: DayParts): number =>
  Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);

/** "03 Oct 2026": day padded, three-letter month, year always (BR-REC-191). The one calendar-day formatter. */
export const formatDay = (date: IsoDate): string => {
  const parts = parseDay(date);
  const monthName = parts ? MONTH_NAMES[parts.month - 1] : undefined;
  if (!parts || !monthName) {
    return date;
  }
  return `${String(parts.day).padStart(2, '0')} ${monthName} ${parts.year}`;
};

/** "Mar" for month 1-12 (the month buttons of the month picker). */
export const monthShortName = (month: number): string => MONTH_NAMES[month - 1] ?? '';

/** "Dec 2025": month and year of a day, for estimated dates ("≈ Dec 2025"). */
export const formatMonthYear = (date: IsoDate): string => {
  const parts = parseDay(date);
  const monthName = parts ? MONTH_NAMES[parts.month - 1] : undefined;
  return parts && monthName ? `${monthName} ${parts.year}` : date;
};

/** "today", "tomorrow", "yesterday", "in 3 days" or "2 days ago". */
export const formatRelativeDay = (date: IsoDate, today: IsoDate): string => {
  const target = parseDay(date);
  const base = parseDay(today);
  if (!target || !base) {
    return date;
  }
  const days = dayNumber(target) - dayNumber(base);
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'tomorrow';
  }
  if (days === -1) {
    return 'yesterday';
  }
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
};

const numberFormats: Record<0 | 1 | 2, Intl.NumberFormat> = {
  0: new Intl.NumberFormat('en', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: false,
  }),
  1: new Intl.NumberFormat('en', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  }),
  2: new Intl.NumberFormat('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }),
};

/** Number with fixed `decimals` and its unit: "95.5 kg", "24.0 %". No trailing space when the unit is empty. */
export const formatValue = (value: number, decimals: 0 | 1 | 2, unit: string): string => {
  const text = numberFormats[decimals].format(value);
  return unit === '' ? text : `${text} ${unit}`;
};

/**
 * A stored phone's digits only, a leading "91" (12 digits) or "0" (11 digits) dropped (BR-REC-127). The one
 * normaliser: `formatPhone` groups it, `whatsAppUrl` builds the chat link from it (BR-REC-59, 197).
 */
export const nationalDigits = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0')
      ? digits.slice(1)
      : digits;
};

/** A stored phone as "98450 12345" (BR-REC-127): two groups of five; anything that is not ten digits after normalising is shown as typed. */
export const formatPhone = (phone: string): string => {
  const national = nationalDigits(phone);
  return national.length === 10 ? `${national.slice(0, 5)} ${national.slice(5)}` : phone;
};

/** A filter tab with its count: "Ends soon (4)" (BR-REC-226); no count yet (loading) leaves the label alone. */
export const withCount = (label: string, count: number | undefined): string =>
  count === undefined ? label : `${label} (${count})`;
