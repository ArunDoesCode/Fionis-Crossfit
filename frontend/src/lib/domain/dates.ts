/** Calendar date as `YYYY-MM-DD` (no time, no zone). */
export type IsoDate = string;

/** True when `value` is a real calendar date written as `YYYY-MM-DD`. */
export const isIsoDate = (value: unknown): value is IsoDate => {
  throw new Error('not implemented');
};

/** `date` plus `days` (negative goes back). */
export const addDays = (_date: IsoDate, _days: number): IsoDate => {
  throw new Error('not implemented');
};

/** `date` plus `months` calendar months; clamps to the month end (31 Jan + 1 = 28/29 Feb). */
export const addMonths = (_date: IsoDate, _months: number): IsoDate => {
  throw new Error('not implemented');
};

/** `date` plus `count` weeks or months. */
export const addInterval = (_date: IsoDate, _count: number, _unit: 'week' | 'month'): IsoDate => {
  throw new Error('not implemented');
};

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (_from: IsoDate, _to: IsoDate): number => {
  throw new Error('not implemented');
};

/** The gym's calendar day at instant `now` in IANA zone `timeZone`. */
export const gymToday = (_now: Date, _timeZone: string): IsoDate => {
  throw new Error('not implemented');
};

/** Completed years of age on `on` for someone born on `dateOfBirth`. */
export const ageOn = (_dateOfBirth: IsoDate, _on: IsoDate): number => {
  throw new Error('not implemented');
};
