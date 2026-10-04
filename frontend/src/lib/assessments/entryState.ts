import type { DurationStatus } from '@/lib/durationStatus';
import type { Draft } from './draft';
import type { EntryMetric, ExistingAssessment, FieldInput, Inputs } from './types';
import { storedNumberText } from './valueText';

// The state of one Record assessment form (S10) as a pure reducer: what is typed, the date, About, which
// saved assessment is open, and the questions waiting for an answer (restore a draft, open the saved one).
// No React, no storage, no clock: the screen reads storage and passes the draft in.

/** A question the form asks before it changes what is typed (BR-REC-74, 85). */
export type Offer =
  | { kind: 'draft'; draft: Draft; existing: ExistingAssessment | null }
  | { kind: 'saved'; existing: ExistingAssessment };

export interface EntryState {
  /** The picked day `YYYY-MM-DD`; empty after "Save & next date" until a new one is picked. */
  date: string;
  isEstimated: boolean;
  inputs: Inputs;
  /** Time boxes out of range (DurationField says why); they block Save. */
  timeProblems: Record<string, true>;
  /** Fields that were left once: "please check" and number errors show from then on (BR-REC-82, 134). */
  touched: Record<string, true>;
  /** The saved values of the assessment being edited by measurement id: emptying one removes it (BR-REC-77). */
  baseline: Record<string, number>;
  /** What the boxes held when the saved assessment was opened: leaving with these unchanged asks nothing. */
  initial: Inputs;
  /** The saved assessment shown in the form ("Edit · 12 Mar 2025"), or null. */
  opened: { assessmentId: string; isEstimated: boolean } | null;
  offer: Offer | null;
  /** The date whose saved assessment and draft were applied; null while they are still on their way. */
  loadedFor: string | null;
}

export type EntryAction =
  | { type: 'input'; metricId: string; value: FieldInput }
  | { type: 'time'; metricId: string; seconds: number | null; status: DurationStatus }
  | { type: 'touch'; metricId: string }
  | { type: 'date'; date: string }
  | { type: 'paper'; date: string }
  | { type: 'estimated'; value: boolean }
  | {
      type: 'loaded';
      date: string;
      metrics: EntryMetric[];
      existing: ExistingAssessment | null;
      draft: Draft | null;
    }
  | { type: 'answer'; answer: 'restore' | 'discard' | 'open' | 'keep'; metrics: EntryMetric[] }
  | { type: 'next' };

export const isBlank = (input: FieldInput | undefined): boolean =>
  input === null || input === undefined || (typeof input === 'string' && input.trim() === '');

/** Something is typed (D19: the leave question and the draft only matter then). */
export const hasTypedValues = (inputs: Inputs): boolean =>
  Object.values(inputs).some((input) => !isBlank(input));

export const emptyEntry = (date: string): EntryState => ({
  date,
  isEstimated: false,
  inputs: {},
  timeProblems: {},
  touched: {},
  baseline: {},
  initial: {},
  opened: null,
  offer: null,
  loadedFor: null,
});

const sameInput = (a: FieldInput | undefined, b: FieldInput | undefined): boolean =>
  (isBlank(a) && isBlank(b)) || a === b;

const sameInputs = (a: Inputs, b: Inputs): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((id) => sameInput(a[id], b[id]));

/**
 * Something differs from what was opened (D19, BR-REC-85, 90): a value is typed (or a Time box is out of
 * range), or, for a saved assessment, a box no longer holds what it held or About was flipped. Moving a saved
 * assessment's form to another date leaves it (the other date has nothing typed, so nothing is unsaved
 * here). Only a difference makes the leave question and the draft matter; an assessment opened and left
 * alone is neither.
 */
export const isChanged = (state: EntryState): boolean =>
  Object.keys(state.timeProblems).length > 0 ||
  !sameInputs(state.inputs, state.initial) ||
  (state.opened !== null && state.isEstimated !== state.opened.isEstimated);

/**
 * An opened saved assessment whose box still holds what it held when it was opened. Save does not send such a
 * field, so a stored value is never rewritten or re-rounded (D2).
 */
export const isUnchangedField = (state: EntryState, metricId: string): boolean =>
  state.opened !== null && sameInput(state.inputs[metricId], state.initial[metricId]);

/** The typed form of a stored value: a Number as text with every digit it was stored with (never fewer), a Time as seconds. */
function inputFromStored(metric: EntryMetric, value: number): FieldInput {
  return metric.datatype === 'duration' ? value : storedNumberText(value, '', metric.decimals);
}

function openSaved(
  existing: ExistingAssessment,
  metrics: EntryMetric[],
): Pick<EntryState, 'inputs' | 'initial' | 'isEstimated' | 'baseline' | 'opened' | 'timeProblems'> {
  const inputs: Inputs = {};
  for (const metric of metrics) {
    const stored = existing.values[metric.id];
    if (stored !== undefined) inputs[metric.id] = inputFromStored(metric, stored);
  }
  return {
    inputs,
    initial: inputs,
    isEstimated: existing.isEstimated,
    baseline: { ...existing.values },
    opened: { assessmentId: existing.assessmentId, isEstimated: existing.isEstimated },
    timeProblems: {},
  };
}

/** A draft's values read back per measurement; a value of the wrong kind (the setting changed) is dropped. */
function inputsFromDraft(draft: Draft, metrics: EntryMetric[]): Inputs {
  const inputs: Inputs = {};
  for (const metric of metrics) {
    const kept = draft.values[metric.id];
    if (metric.datatype === 'duration') {
      if (typeof kept === 'number') inputs[metric.id] = kept;
    } else if (typeof kept === 'string') {
      inputs[metric.id] = kept;
    } else if (typeof kept === 'number') {
      inputs[metric.id] = String(kept);
    }
  }
  return inputs;
}

// Another date is another assessment. What was typed fresh goes along; the values of an opened saved
// assessment stay with it (its unsaved edits remain as that date's draft).
function moveToDate(state: EntryState, date: string): EntryState {
  const carried = state.opened === null;
  return {
    ...state,
    date,
    inputs: carried ? state.inputs : {},
    timeProblems: carried ? state.timeProblems : {},
    isEstimated: carried ? state.isEstimated : false,
    baseline: {},
    initial: {},
    opened: null,
    offer: null,
    loadedFor: null,
  };
}

function applyLoaded(
  state: EntryState,
  action: Extract<EntryAction, { type: 'loaded' }>,
): EntryState {
  if (state.date !== action.date || state.loadedFor === action.date) return state;
  const { existing, draft, metrics } = action;
  const cleared: EntryState = {
    ...state,
    loadedFor: action.date,
    baseline: {},
    initial: {},
    opened: null,
    offer: null,
  };
  const typed = hasTypedValues(state.inputs);
  if (draft && !typed) return { ...cleared, offer: { kind: 'draft', draft, existing } };
  if (!existing) return cleared;
  if (typed) return { ...cleared, offer: { kind: 'saved', existing } };
  return { ...cleared, ...openSaved(existing, metrics) };
}

function applyAnswer(
  state: EntryState,
  answer: 'restore' | 'discard' | 'open' | 'keep',
  metrics: EntryMetric[],
): EntryState {
  const { offer } = state;
  if (!offer) return state;
  const done = { ...state, offer: null };
  if (offer.kind === 'saved') {
    return answer === 'open' ? { ...done, ...openSaved(offer.existing, metrics) } : done;
  }
  const saved = offer.existing ? openSaved(offer.existing, metrics) : null;
  if (answer === 'restore') {
    return {
      ...done,
      ...(saved ?? {}),
      inputs: inputsFromDraft(offer.draft, metrics),
      isEstimated: offer.draft.isEstimated,
    };
  }
  return saved ? { ...done, ...saved } : done;
}

export function entryReducer(state: EntryState, action: EntryAction): EntryState {
  switch (action.type) {
    case 'input':
      return { ...state, inputs: { ...state.inputs, [action.metricId]: action.value } };
    case 'time': {
      const { [action.metricId]: _was, ...rest } = state.timeProblems;
      return {
        ...state,
        inputs: { ...state.inputs, [action.metricId]: action.seconds },
        timeProblems: action.status === 'invalid' ? { ...rest, [action.metricId]: true } : rest,
      };
    }
    case 'touch':
      return state.touched[action.metricId]
        ? state
        : { ...state, touched: { ...state.touched, [action.metricId]: true } };
    case 'date':
      return action.date === state.date ? state : moveToDate(state, action.date);
    case 'paper':
      return {
        ...(action.date === state.date ? state : moveToDate(state, action.date)),
        isEstimated: true,
      };
    case 'estimated':
      return { ...state, isEstimated: action.value };
    case 'loaded':
      return applyLoaded(state, action);
    case 'answer':
      return applyAnswer(state, action.answer, action.metrics);
    case 'next':
      return emptyEntry('');
  }
}
