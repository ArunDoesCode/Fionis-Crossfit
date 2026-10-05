/** A month as `YYYY-MM`. */
export type IsoMonth = string;

/** A month before `min` or after `max` cannot be picked; `YYYY-MM` compares as text. */
export const isMonthDisabled = (candidate: IsoMonth, min?: IsoMonth, max?: IsoMonth): boolean =>
  (min !== undefined && candidate < min) || (max !== undefined && candidate > max);

/** The same month `delta` years on (or back). */
export const shiftYear = (value: IsoMonth, delta: number): IsoMonth => {
  const [year, month] = value.split('-') as [string, string];
  return `${String(Number(year) + delta).padStart(4, '0')}-${month}`;
};

/** Whole-year part of a `YYYY-MM`. */
export const yearOf = (value: IsoMonth): number => Number(value.slice(0, 4));
