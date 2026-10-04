// Pure function (BR-REC-64, setup.md C9). No I/O, no clock.
// The assessments stream calls it when it saves a value (BR-REC-76); setup itself never
// rounds stored values (changing `decimals` only changes how they are shown).

import type { Datatype } from "../enums";

/** Decimals a measurement may keep (`metrics.decimals`, BR-REC-64). */
export type MetricDecimals = 0 | 1 | 2;

/**
 * `value` rounded to `decimals` places, half away from zero, working on the decimal digits
 * of the number as written (not on the binary float): 1.005 at 2 places is 1.01, -2.25 at 1
 * place is -2.3.
 *
 * A `duration` is whole seconds: `decimals` is ignored. Finite input only (callers
 * validate). A non-zero result keeps its sign; a result of zero is `0`, never `-0`.
 */
export function roundMetricValue(
  value: number,
  datatype: Datatype,
  decimals: MetricDecimals,
): number {
  const places = datatype === "duration" ? 0 : decimals;
  const negative = value < 0;
  const [mantissa = "0", exponent = "0"] = Math.abs(value)
    .toString()
    .split("e");
  // Shifting the decimal point inside the text keeps the digits exact: "1.005e2" is parsed
  // to exactly 100.5, where 1.005 * 100 would give 100.49999999999999.
  const shifted = Number(`${mantissa}e${Number(exponent) + places}`);
  // `Math.round` rounds a .5 up, which for a positive number is away from zero.
  const rounded = Math.round(shifted) / 10 ** places;
  return negative && rounded !== 0 ? -rounded : rounded;
}
