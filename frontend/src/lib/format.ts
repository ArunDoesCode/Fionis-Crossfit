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

/** "3 Oct 2026"; the year is left out when `date` is in the same year as `today`. */
export const formatDay = (date: IsoDate, today: IsoDate): string => {
  const parts = parseDay(date);
  const monthName = parts ? MONTH_NAMES[parts.month - 1] : undefined;
  if (!parts || !monthName) {
    return date;
  }
  const text = `${parts.day} ${monthName}`;
  return parts.year === parseDay(today)?.year ? text : `${text} ${parts.year}`;
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

/** Ten-digit phone as "98450 12345"; anything else is shown as typed. */
export const formatPhone = (phone: string): string =>
  /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
