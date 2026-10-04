import { formatDuration } from '@/lib/domain/duration';
import { formatValue } from '@/lib/format';
import { asDecimals } from './types';

// How one stored result reads on a saved assessment (BR-REC-12, 127): Time as "2:02" (never followed by its
// "min:sec" unit), a Number with its unit and fixed digits ("95.5 kg", "24.0 %"). Pure.

/** Digits after the point of a stored number. */
const placesOf = (value: number): number => {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
};

/**
 * A stored Number with its unit (the unit may be empty). `decimals` is the measurement's current setting
 * (setup), when known. Stored values were rounded with the setting of their day and a later change never
 * touches them (setup C9), so a value that carries more digits than today's setting keeps them; the most
 * ever stored is two. The edit form's boxes use this too, so an untouched value is never shown (or sent)
 * rounder than it is stored.
 */
export function storedNumberText(
  value: number,
  unit: string,
  decimals: number | undefined,
): string {
  const digits = Math.min(2, Math.max(decimals ?? 0, placesOf(value)));
  return formatValue(value, asDecimals(digits), unit);
}

export function storedValueText(
  result: { datatype: 'number' | 'duration'; value: number; unit: string },
  decimals: number | undefined,
): string {
  return result.datatype === 'duration'
    ? formatDuration(result.value)
    : storedNumberText(result.value, result.unit, decimals);
}
