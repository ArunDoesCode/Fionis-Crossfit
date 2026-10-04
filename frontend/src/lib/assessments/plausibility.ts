// "Please check" (BR-REC-21, 82, D14): a big jump from the last value or a value outside the measurement's
// usual range. It only warns; the server never blocks. Pure.

export type PlausibilityReason = 'jump' | 'range';

interface PlausibilityInput {
  value: number | null;
  previous: number | null;
  plausibleMin: number | null;
  plausibleMax: number | null;
}

/** More than this share of the previous value is a jump (exactly 30% is fine). */
const JUMP_NUMERATOR = 3; // 30% = 3 / 10
const JUMP_DENOMINATOR = 10;

// Values hold at most 3 decimals (numeric(12,3)), so thousandths are whole numbers and "exactly 30%" is
// exact: 10.4 − 8 is 2.4000000000000004 as a float, but 10400 − 8000 is 2400.
const toThousandths = (value: number): number => Math.round(value * 1000);

function isJump(value: number, previous: number | null): boolean {
  if (previous === null || previous === 0) return false;
  const step = Math.abs(toThousandths(value) - toThousandths(previous));
  return step * JUMP_DENOMINATOR > JUMP_NUMERATOR * Math.abs(toThousandths(previous));
}

/** `reasons` lists `jump` first, then `range`; a missing value has nothing to check. */
export function checkPlausibility({
  value,
  previous,
  plausibleMin,
  plausibleMax,
}: PlausibilityInput): { warn: boolean; reasons: PlausibilityReason[] } {
  if (value === null) return { warn: false, reasons: [] };
  const reasons: PlausibilityReason[] = [];
  if (isJump(value, previous)) reasons.push('jump');
  const belowMin = plausibleMin !== null && value < plausibleMin;
  const aboveMax = plausibleMax !== null && value > plausibleMax;
  if (belowMin || aboveMax) reasons.push('range');
  return { warn: reasons.length > 0, reasons };
}
