import type { IsoDate } from '@/lib/domain/dates';

// The bridge between a `YYYY-MM-DD` string and the calendar's Date (BR-REC-193). Both ends use the device's
// LOCAL calendar fields; nothing goes through UTC, so a picked day never moves by one in any time zone.

/** Weeks start on Monday everywhere (BR-REC-191). */
export const WEEK_STARTS_ON = 1;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** Local midnight of the calendar day. */
export const isoToDate = (iso: IsoDate): Date => {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(2000, month - 1, day);
  date.setFullYear(year); // a plain `new Date(year, …)` maps years 0-99 to 19xx
  return date;
};

/** `YYYY-MM-DD` from the local year, month and day of `date`. */
export const dateToIso = (date: Date): IsoDate =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;

/** What the lazily loaded calendar needs (kept here so `DatePicker` can type it without importing the chunk). */
export interface DayCalendarProps {
  value: IsoDate | '';
  onSelect: (iso: IsoDate) => void;
  today: IsoDate;
  min?: IsoDate;
  max?: IsoDate;
  defaultMonth?: IsoDate;
  /** Month and year dropdowns between these years (birth date). */
  yearRange?: { from: number; to: number };
}

/** What the lazily loaded month grid needs. */
export interface MonthGridProps {
  /** `YYYY-MM`, or `''` for none. */
  value: string;
  onSelect: (month: string) => void;
  /** The year shown when there is no value. */
  fallbackYear: number;
  min?: string;
  max?: string;
}
