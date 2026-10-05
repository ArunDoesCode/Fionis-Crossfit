import { durationFromParts, durationToParts } from '@/lib/domain/duration';
import { exactNumber } from '@/lib/forms/numberText';
import type { DurationText, EntryFormInput, FieldText } from '@/lib/validators/assessments';
import type { Draft } from './draft';
import type { EntryMetric, ExistingAssessment, FieldInput, Inputs } from './types';
import { storedNumberText } from './valueText';

// Pure helpers around the typed values of the Record assessment form (S10). The values themselves live in
// React Hook Form; what is left here is the questions around them: which saved assessment is open, whether
// anything differs from it, what a draft holds. No React, no storage, no clock.

/** A question the form asks before it changes what is typed (BR-REC-74, 85). */
export type Offer =
  | { kind: 'draft'; draft: Draft; existing: ExistingAssessment | null }
  | { kind: 'saved'; existing: ExistingAssessment };

/** What the form knows about the date it is showing besides the typed values. */
export interface EntrySession {
  /** The date whose saved assessment and draft were applied; null while they are still on their way. */
  loadedFor: string | null;
  /** The saved assessment shown in the form ("Edit · 12 Mar 2025"), or null. */
  opened: { assessmentId: string; isEstimated: boolean } | null;
  /** The saved values of the assessment being edited by measurement id: emptying one removes it (BR-REC-77). */
  baseline: Record<string, number>;
  /** What the boxes held when the saved assessment was opened: leaving with these unchanged asks nothing. */
  initial: Record<string, FieldText>;
  offer: Offer | null;
}

export const EMPTY_SESSION: EntrySession = {
  loadedFor: null,
  opened: null,
  baseline: {},
  initial: {},
  offer: null,
};

export type TypedValues = Record<string, FieldText>;

const isDuration = (value: FieldText | undefined): value is DurationText =>
  typeof value === 'object' && value !== null;

export const blankField = (metric: EntryMetric): FieldText =>
  metric.datatype === 'duration' ? { min: '', sec: '' } : '';

export const blankValues = (metrics: EntryMetric[]): TypedValues =>
  Object.fromEntries(metrics.map((metric) => [metric.id, blankField(metric)]));

export const isBlankField = (value: FieldText | undefined): boolean =>
  value === undefined ||
  (isDuration(value) ? value.min.trim() === '' && value.sec.trim() === '' : value.trim() === '');

/** Something is typed (D19: the leave question and the draft only matter then). */
export const hasTypedValues = (values: TypedValues): boolean =>
  Object.values(values).some((value) => !isBlankField(value));

/** The two boxes as seconds; null when blank or out of range. */
const secondsOf = (value: DurationText): number | null =>
  isBlankField(value)
    ? null
    : durationFromParts(Number(value.min || '0'), Number(value.sec || '0'));

/** A box in the shape the draft and the plausibility check read: text (Number) or seconds / null (Time). */
export const fieldInput = (value: FieldText | undefined): FieldInput => {
  if (value === undefined) return null;
  return isDuration(value) ? secondsOf(value) : value;
};

export const inputsOf = (values: TypedValues): Inputs =>
  Object.fromEntries(Object.entries(values).map(([id, value]) => [id, fieldInput(value)]));

// Blank is blank. A Number box holds the same value however it is spelled ("95,55", "95.55 "): typed numbers
// are compared exactly, never rounded, so "95.56" over a stored 95.55 is a change (D2). A Time box is seconds.
export function sameField(a: FieldText | undefined, b: FieldText | undefined): boolean {
  if (isBlankField(a) && isBlankField(b)) return true;
  if (isDuration(a) && isDuration(b))
    return secondsOf(a) === secondsOf(b) && !isBlankField(a) === !isBlankField(b);
  if (typeof a === 'string' && typeof b === 'string') {
    const [x, y] = [exactNumber(a), exactNumber(b)];
    return x !== null && y !== null ? x === y : a === b;
  }
  return false;
}

const sameValues = (a: TypedValues, b: TypedValues): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((id) => sameField(a[id], b[id]));

/**
 * Something differs from what was opened (D19, BR-REC-85, 90): a value is typed, or, for a saved assessment, a
 * box no longer holds what it held or About was flipped. The date alone never counts, and About on a new
 * assessment does not either. Only a difference makes the leave question and the draft matter.
 */
export const isChanged = (form: EntryFormInput, session: EntrySession): boolean =>
  !sameValues(form.values, session.initial) ||
  (session.opened !== null && form.isEstimated !== session.opened.isEstimated);

/**
 * An opened saved assessment whose box still holds what it held when it was opened. Save does not send such a
 * field, so a stored value is never rewritten or re-rounded (D2).
 */
export const isUnchangedField = (
  session: EntrySession,
  values: TypedValues,
  metricId: string,
): boolean => session.opened !== null && sameField(values[metricId], session.initial[metricId]);

/** The typed form of a stored value: a Number as text with every digit it was stored with, a Time as two boxes. */
function fieldFromStored(metric: EntryMetric, value: number): FieldText {
  if (metric.datatype !== 'duration') return storedNumberText(value, '', metric.decimals);
  const { minutes, seconds } = durationToParts(value);
  return { min: String(minutes), sec: String(seconds).padStart(2, '0') };
}

/** The boxes of a saved assessment: stored values filled in, everything else blank. */
export function valuesFromSaved(existing: ExistingAssessment, metrics: EntryMetric[]): TypedValues {
  const values = blankValues(metrics);
  for (const metric of metrics) {
    const stored = existing.values[metric.id];
    if (stored !== undefined) values[metric.id] = fieldFromStored(metric, stored);
  }
  return values;
}

/** A draft's values read back per measurement; a value of the wrong kind (the setting changed) is dropped. */
export function valuesFromDraft(draft: Draft, metrics: EntryMetric[]): TypedValues {
  const values = blankValues(metrics);
  for (const metric of metrics) {
    const kept = draft.values[metric.id];
    if (metric.datatype === 'duration') {
      if (typeof kept === 'number') values[metric.id] = fieldFromStored(metric, kept);
    } else if (typeof kept === 'string') {
      values[metric.id] = kept;
    } else if (typeof kept === 'number') {
      values[metric.id] = String(kept);
    }
  }
  return values;
}

/** What `decideLoaded` tells the screen to do with the saved assessment and the draft of a date. */
export type LoadedDecision = 'offer-draft' | 'offer-saved' | 'open-saved' | 'nothing';

export function decideLoaded(input: {
  typed: boolean;
  hasDraft: boolean;
  hasSaved: boolean;
}): LoadedDecision {
  if (input.hasDraft && !input.typed) return 'offer-draft';
  if (!input.hasSaved) return 'nothing';
  return input.typed ? 'offer-saved' : 'open-saved';
}
