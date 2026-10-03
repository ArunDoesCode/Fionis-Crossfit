import type { IsoDate } from './domain/dates';

/** "3 Oct 2026"; the year is left out when `date` is in the same year as `today`. */
export const formatDay = (_date: IsoDate, _today: IsoDate): string => {
  throw new Error('not implemented');
};

/** "today", "tomorrow", "yesterday", "in 3 days" or "2 days ago". */
export const formatRelativeDay = (_date: IsoDate, _today: IsoDate): string => {
  throw new Error('not implemented');
};

/** Number with fixed `decimals` and its unit: "95.5 kg", "24.0 %". */
export const formatValue = (_value: number, _decimals: 0 | 1 | 2, _unit: string): string => {
  throw new Error('not implemented');
};

/** Ten-digit phone as "98450 12345". */
export const formatPhone = (_phone: string): string => {
  throw new Error('not implemented');
};
