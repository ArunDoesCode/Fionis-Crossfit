import { parseNumberText } from './parseNumber';
import { ASSESSMENT_TEXT } from './text';
import type { Decimals } from './types';

// The `values` of the Save request (E26) from what is on screen (BR-REC-19, 76, 77, 78). Pure.

export interface SaveField {
  metricId: string;
  datatype: 'number' | 'duration';
  decimals: Decimals;
  /** Typed text of a Number field; seconds (or null) of a Time field. */
  input: string | number | null;
  /** The saved assessment holds a value for this measurement (so emptying the field removes it). */
  hadValue: boolean;
}

export type SaveValuesResult =
  | {
      ok: true;
      values: { metricId: string; value: number | null }[];
      filled: number;
      removed: number;
    }
  | { ok: false; problems: { metricId: string; message: string }[] };

type Reading = { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' };

function read(field: SaveField): Reading {
  if (field.datatype === 'duration') {
    return typeof field.input === 'number' ? { kind: 'ok', value: field.input } : { kind: 'empty' };
  }
  return parseNumberText(field.input === null ? '' : String(field.input), field.decimals);
}

/**
 * Filled fields send their value; a blank field that had a saved value sends `null` (removes it, counted in
 * `removed`); a blank field with nothing saved is left out. A bad number is a problem (all of them are
 * listed, in field order). `filled === 0` is the screen's "Enter at least one value" case.
 */
export function buildSaveValues(fields: SaveField[]): SaveValuesResult {
  const values: { metricId: string; value: number | null }[] = [];
  const problems: { metricId: string; message: string }[] = [];
  let filled = 0;
  let removed = 0;

  for (const field of fields) {
    const reading = read(field);
    if (reading.kind === 'invalid') {
      problems.push({ metricId: field.metricId, message: ASSESSMENT_TEXT.numberError });
    } else if (reading.kind === 'ok') {
      values.push({ metricId: field.metricId, value: reading.value });
      filled += 1;
    } else if (field.hadValue) {
      values.push({ metricId: field.metricId, value: null });
      removed += 1;
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, values, filled, removed };
}
