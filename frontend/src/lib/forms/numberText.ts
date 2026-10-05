import type { Decimals } from '@/lib/assessments/types';

// A number field is text until Save (BR-REC-76): "95,5" is 95.5, "95." is 95, anything else is not a
// number. Rounding works on the typed digits, never on a binary float ("1.005" at 2 decimals is 1.01).

export type NumberParse = { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' };

const NUMBER_TEXT = /^(-?)(?:(\d+)(?:[.,](\d*))?|[.,](\d+))$/;

/** A Number box read exactly, without rounding ("95,55 " is 95.55); null when it is not a number. */
export const exactNumber = (text: string): number | null => {
  const trimmed = text.trim();
  return NUMBER_TEXT.test(trimmed) ? Number(trimmed.replace(',', '.')) : null;
};

// The server refuses a stored number beyond ±999,999,999.999 (D3); after rounding to `decimals` digits the
// largest whole count of 10^-decimals that fits is 10^(9 + decimals) − 1.
const largestCount = (decimals: Decimals): bigint => 10n ** BigInt(9 + decimals) - 1n;

/**
 * Empty, a valid number rounded half away from zero to `decimals`, or invalid (also a number whose rounded
 * value is beyond ±999,999,999.999, as the server decides). Never returns -0.
 */
export function parseNumberText(text: string, decimals: Decimals): NumberParse {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  const match = NUMBER_TEXT.exec(trimmed);
  if (!match) return { kind: 'invalid' };

  const negative = match[1] === '-';
  const whole = match[2] ?? '0';
  const fraction = match[3] ?? match[4] ?? '';

  // Keep `decimals` digits, then look at the next one: 5 or more rounds the size up (half away from zero).
  const kept = fraction.slice(0, decimals).padEnd(decimals, '0');
  const roundUp = fraction.length > decimals && (fraction[decimals] ?? '0') >= '5';
  const count = BigInt(`${whole}${kept}`) + (roundUp ? 1n : 0n);
  if (count > largestCount(decimals)) return { kind: 'invalid' };

  const size = Number(count) / 10 ** decimals;
  return { kind: 'ok', value: negative && size !== 0 ? -size : size };
}

/**
 * Flips the leading minus sign of typed number text: "95.5" -> "-95.5", "-95.5" -> "95.5", "" -> "-".
 * The sign is ASCII "-". Leading spaces are dropped. Used by the "Make negative" button of NumberField,
 * because the iPhone decimal keypad has no minus key.
 */
export const toggleMinus = (text: string): string => {
  const trimmed = text.trimStart();
  return trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`;
};
