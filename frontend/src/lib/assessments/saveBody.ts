import { parseNumberText } from '@/lib/forms/numberText';
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
  /**
   * An opened saved assessment whose box still holds what it held: the field is skipped entirely (not in
   * `values`, not counted), so a stored value is never sent again or re-rounded (D2, setup C9).
   */
  unchanged?: boolean;
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
 * `removed`); a blank field with nothing saved is left out; an `unchanged` field is not looked at. A bad
 * number is a problem (all of them are listed, in field order).
 */
export function buildSaveValues(fields: SaveField[]): SaveValuesResult {
  const values: { metricId: string; value: number | null }[] = [];
  const problems: { metricId: string; message: string }[] = [];
  let filled = 0;
  let removed = 0;

  for (const field of fields) {
    if (field.unchanged) continue;
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

/**
 * The screen's "Enter at least one value" case (BR-REC-78, D2): no value would be left after the save. A new
 * assessment: nothing filled. A saved one: every stored value cleared and nothing filled; a save that only
 * changes some fields, or only About, leaves values and is allowed.
 */
export function leavesNoValue(
  fields: SaveField[],
  built: { values: { metricId: string; value: number | null }[]; removed: number },
): boolean {
  const stored = new Set(fields.filter((field) => field.hadValue).map((field) => field.metricId));
  const added = built.values.filter(
    ({ metricId, value }) => value !== null && !stored.has(metricId),
  ).length;
  return stored.size - built.removed + added === 0;
}

/**
 * How many of the assessment's measurements hold no value once this save is done (the "12 still due" of the toast,
 * BR-REC-230): the stored values, minus the ones this save removes, plus the ones it adds.
 */
export function stillDueAfter(
  metricIds: string[],
  stored: Iterable<string>,
  values: { metricId: string; value: number | null }[],
): number {
  const held = new Set(stored);
  for (const { metricId, value } of values) {
    if (value === null) held.delete(metricId);
    else held.add(metricId);
  }
  return metricIds.filter((id) => !held.has(id)).length;
}
