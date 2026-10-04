import { formatDuration } from '@/lib/domain/duration';
import { formatValue } from '@/lib/format';
import type { Decimals } from './types';

// The change line next to a field (BR-REC-81, D15): arrow, signed amount, and "better"/"worse" by the
// measurement's direction. Pure.

const MINUS = '−'; // U+2212, never a hyphen

export interface ChangeInput {
  value: number | null;
  previous: number | null;
  datatype: 'number' | 'duration';
  decimals: Decimals;
  unit: string;
  better: 'higher' | 'lower' | 'none';
}

export interface Change {
  arrow: 'up' | 'down' | 'none';
  amount: string;
  verdict: 'better' | 'worse' | null;
}

export const NO_CHANGE = 'No change';

// Thousandths are whole numbers (values hold at most 3 decimals), so the difference has no float noise
// (0.3 − 0.1 is 0.19999999999999998 as a float, 300 − 100 is 200).
const toThousandths = (value: number): number => Math.round(value * 1000);

/** `null` when there is nothing to compare; equal (after rounding the difference to the decimals) is "No change". */
export function describeChange(input: ChangeInput): Change | null {
  const { value, previous, datatype, unit, better } = input;
  if (value === null || previous === null) return null;

  const decimals = datatype === 'duration' ? 0 : input.decimals;
  const step = 10 ** (3 - decimals); // thousandths per last shown digit
  const difference = toThousandths(value) - toThousandths(previous);
  // Half away from zero on the size of the difference.
  const size = Math.floor((Math.abs(difference) + step / 2) / step) / 10 ** decimals;
  if (size === 0) return { arrow: 'none', amount: NO_CHANGE, verdict: null };

  const up = difference > 0;
  const amount = datatype === 'duration' ? formatDuration(size) : formatValue(size, decimals, unit);
  const verdict = better === 'none' ? null : up === (better === 'higher') ? 'better' : 'worse';
  return { arrow: up ? 'up' : 'down', amount: `${up ? '+' : MINUS}${amount}`, verdict };
}
