import type { IsoDate } from '@/lib/domain/dates';

const MONTHS = [
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

/**
 * "31 May 2026": a membership date always carries its year (the end of an annual plan is a year away),
 * unlike `formatDay`, which drops the current year (BR-REC-127, 172).
 */
export const formatDayWithYear = (date: IsoDate): string => {
  const [year, month, day] = date.split('-').map(Number);
  const monthName = MONTHS[(month ?? 1) - 1];
  return monthName ? `${day} ${monthName} ${year}` : date;
};
