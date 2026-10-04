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
 * `decimals` is the measurement's current setting (setup), when known. Stored values were rounded with the
 * setting of their day and a later change never touches them (setup C9), so a value that carries more digits
 * than today's setting keeps them; the most ever stored is two.
 */
export function storedValueText(
  result: { datatype: 'number' | 'duration'; value: number; unit: string },
  decimals: number | undefined,
): string {
  if (result.datatype === 'duration') return formatDuration(result.value);
  const digits = Math.min(2, Math.max(decimals ?? 0, placesOf(result.value)));
  return formatValue(result.value, asDecimals(digits), result.unit);
}
