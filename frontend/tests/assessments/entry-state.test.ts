// Spec: docs/specs/member-records/assessments.md (v2)
//   BR-REC-74 — picking a date that already has this assessment opens it for editing ("Edit · 12 Mar 2025");
//               if values were already typed it asks "Open the saved one?" [Open] [Keep mine].
//   BR-REC-77 — when editing, emptying a saved field removes that value (the form knows what was saved).
//   BR-REC-79 — a paper-column chip sets the date and ticks "About" (estimated).
//   BR-REC-85 / D13 — unsaved values are offered back ("Restore unsaved results from 10:42?" [Restore]
//               [Discard]); restore is offered once on open; the typed text of Number fields and the seconds of
//               Time fields are what a draft holds.
//   BR-REC-86 — the form stays filled: a reload of the entry form must not wipe what was typed.
//   BR-REC-90 / D19 — the leave question appears when any value is typed; an assessment opened and left
//               alone asks nothing; the draft only matters then.
//   D12       — "Save & next date" keeps member and assessment, empties date and values.
// Interface (names and shapes only): `@/lib/assessments/entryState` — `emptyEntry(date)`, `entryReducer(state,
//   action)`, `isChanged(state)`, `hasTypedValues(inputs)`, `isBlank(input)`; `EntryState` / `EntryAction` /
//   `Offer` as exported there. E25 shapes from `@/lib/assessments/types`.
//   The tests drive the reducer only through those actions and look at the documented fields of the state.
import { describe, expect, test } from 'bun:test';
import type { Draft } from '@/lib/assessments/draft';
import {
  type EntryAction,
  type EntryState,
  emptyEntry,
  entryReducer,
  hasTypedValues,
  isBlank,
  isChanged,
  isUnchangedField,
} from '@/lib/assessments/entryState';
import { buildSaveValues, leavesNoValue } from '@/lib/assessments/saveBody';
import type { EntryMetric, ExistingAssessment } from '@/lib/assessments/types';

const WEIGHT_ID = '11111111-1111-4111-8111-111111111111';
const FAT_ID = '22222222-2222-4222-8222-222222222222';
const PLANK_ID = '33333333-3333-4333-8333-333333333333';
const ASSESSMENT_ID = '99999999-9999-4999-8999-999999999999';

const metric = (over: Partial<EntryMetric> & Pick<EntryMetric, 'id' | 'name'>): EntryMetric => ({
  unit: '',
  datatype: 'number',
  decimals: 1,
  better: 'none',
  plausibleMin: null,
  plausibleMax: null,
  previous: null,
  ...over,
});

const WEIGHT = metric({
  id: WEIGHT_ID,
  name: 'Weight',
  unit: 'kg',
  decimals: 1,
  better: 'lower',
  previous: { value: 95.5, on: '2026-09-12', isEstimated: false },
});
const FAT = metric({
  id: FAT_ID,
  name: 'Visceral fat',
  unit: 'level',
  decimals: 0,
  better: 'lower',
});
const PLANK = metric({
  id: PLANK_ID,
  name: 'Plank',
  unit: 'min:sec',
  datatype: 'duration',
  decimals: 0,
  better: 'higher',
  previous: { value: 110, on: '2026-09-12', isEstimated: false },
});
const METRICS = [WEIGHT, FAT, PLANK];

const SAVED_DATE = '2025-03-12';
const NEW_DATE = '2026-10-03';
const SAVED: ExistingAssessment = {
  assessmentId: ASSESSMENT_ID,
  isEstimated: false,
  values: { [WEIGHT_ID]: 94, [PLANK_ID]: 122 },
};
const DRAFT: Draft = {
  savedAt: Date.UTC(2026, 9, 3, 10, 42),
  isEstimated: true,
  values: { [WEIGHT_ID]: '95', [PLANK_ID]: 150 },
};

const run = (state: EntryState, ...actions: EntryAction[]): EntryState =>
  actions.reduce(entryReducer, state);

const typeText = (metricId: string, value: string): EntryAction => ({
  type: 'input',
  metricId,
  value,
});

const loaded = (
  date: string,
  existing: ExistingAssessment | null,
  draft: Draft | null,
): EntryAction => ({ type: 'loaded', date, metrics: METRICS, existing, draft });

const answer = (which: 'restore' | 'discard' | 'open' | 'keep'): EntryAction => ({
  type: 'answer',
  answer: which,
  metrics: METRICS,
});

/** A saved assessment opened straight away (nothing typed before it arrived). */
const openedSaved = (existing: ExistingAssessment = SAVED): EntryState =>
  run(emptyEntry(SAVED_DATE), loaded(SAVED_DATE, existing, null));

describe('BR-REC-90 isBlank / hasTypedValues', () => {
  test.each<[string, Parameters<typeof isBlank>[0], boolean]>([
    ['null', null, true],
    ['undefined', undefined, true],
    ['an empty text', '', true],
    ['spaces only', '   ', true],
    ['a number text', '94', false],
    ['text with a mark', '95,', false],
    ['a Time of 2:02 (122 s)', 122, false],
    ['a Time of 0 seconds (a value, not blank)', 0, false],
    ['a typed zero', '0', false],
  ])('D19 isBlank(%s) is %s', (_name, input, expected) => {
    expect(isBlank(input)).toBe(expected);
  });

  test('D19 hasTypedValues: nothing in the boxes is false', () => {
    expect(hasTypedValues({})).toBe(false);
    expect(hasTypedValues({ [WEIGHT_ID]: '', [PLANK_ID]: null })).toBe(false);
    expect(hasTypedValues({ [WEIGHT_ID]: '  ' })).toBe(false);
  });

  test('D19 hasTypedValues: one filled box is true', () => {
    expect(hasTypedValues({ [WEIGHT_ID]: '', [FAT_ID]: '9' })).toBe(true);
    expect(hasTypedValues({ [PLANK_ID]: 0 })).toBe(true);
  });
});

describe('D11 / BR-REC-90 a new form', () => {
  test('D11 emptyEntry starts on the given date with nothing typed and no question', () => {
    const state = emptyEntry(NEW_DATE);
    expect(state.date).toBe(NEW_DATE);
    expect(state.isEstimated).toBe(false);
    expect(hasTypedValues(state.inputs)).toBe(false);
    expect(state.opened).toBeNull();
    expect(state.offer).toBeNull();
  });

  test('D19 a new form with nothing typed is not "changed" (no leave question)', () => {
    expect(isChanged(emptyEntry(NEW_DATE))).toBe(false);
  });

  test('D19 typing a number makes the form changed', () => {
    const state = run(emptyEntry(NEW_DATE), typeText(WEIGHT_ID, '94'));
    expect(state.inputs[WEIGHT_ID]).toBe('94');
    expect(hasTypedValues(state.inputs)).toBe(true);
    expect(isChanged(state)).toBe(true);
  });

  test('D19 clearing what was typed makes the form unchanged again', () => {
    const state = run(emptyEntry(NEW_DATE), typeText(WEIGHT_ID, '94'), typeText(WEIGHT_ID, ''));
    expect(isChanged(state)).toBe(false);
    expect(isChanged(run(state, typeText(WEIGHT_ID, '   ')))).toBe(false);
  });

  test('D19 touching a field (leaving it) is not a change', () => {
    const state = run(emptyEntry(NEW_DATE), { type: 'touch', metricId: WEIGHT_ID });
    expect(isChanged(state)).toBe(false);
  });

  test('BR-REC-82 a field that was left is remembered as touched', () => {
    const state = run(
      emptyEntry(NEW_DATE),
      { type: 'touch', metricId: WEIGHT_ID },
      { type: 'touch', metricId: WEIGHT_ID },
    );
    expect(state.touched[WEIGHT_ID]).toBe(true);
    expect(state.touched[FAT_ID]).toBeUndefined();
  });

  test('BR-REC-79 the About flag follows the tick', () => {
    const on = run(emptyEntry(NEW_DATE), { type: 'estimated', value: true });
    expect(on.isEstimated).toBe(true);
    expect(run(on, { type: 'estimated', value: false }).isEstimated).toBe(false);
  });

  test('BR-REC-79 a paper-column chip sets the date and ticks About', () => {
    const state = run(emptyEntry(NEW_DATE), { type: 'paper', date: '2025-12-01' });
    expect(state.date).toBe('2025-12-01');
    expect(state.isEstimated).toBe(true);
  });
});

describe('BR-REC-75 / D13 a Time box', () => {
  test('D13 a valid Time is kept as seconds', () => {
    const state = run(emptyEntry(NEW_DATE), {
      type: 'time',
      metricId: PLANK_ID,
      seconds: 122,
      status: 'valid',
    });
    expect(state.inputs[PLANK_ID]).toBe(122);
    expect(state.timeProblems[PLANK_ID]).toBeUndefined();
    expect(isChanged(state)).toBe(true);
  });

  test('BR-REC-75 a Time of 0 seconds is a typed value', () => {
    const state = run(emptyEntry(NEW_DATE), {
      type: 'time',
      metricId: PLANK_ID,
      seconds: 0,
      status: 'valid',
    });
    expect(state.inputs[PLANK_ID]).toBe(0);
    expect(isChanged(state)).toBe(true);
  });

  test('BR-REC-75 / D19 an out-of-range box is a problem that blocks Save, and something is typed', () => {
    const state = run(emptyEntry(NEW_DATE), {
      type: 'time',
      metricId: PLANK_ID,
      seconds: null,
      status: 'invalid',
    });
    expect(state.timeProblems[PLANK_ID]).toBe(true);
    expect(isChanged(state)).toBe(true);
  });

  test('BR-REC-75 fixing the box clears the problem', () => {
    const state = run(
      emptyEntry(NEW_DATE),
      { type: 'time', metricId: PLANK_ID, seconds: null, status: 'invalid' },
      { type: 'time', metricId: PLANK_ID, seconds: 122, status: 'valid' },
    );
    expect(state.timeProblems[PLANK_ID]).toBeUndefined();
    expect(state.inputs[PLANK_ID]).toBe(122);
  });

  test('BR-REC-75 emptying both boxes leaves nothing typed and no problem', () => {
    const state = run(
      emptyEntry(NEW_DATE),
      { type: 'time', metricId: PLANK_ID, seconds: 122, status: 'valid' },
      { type: 'time', metricId: PLANK_ID, seconds: null, status: 'empty' },
    );
    expect(isBlank(state.inputs[PLANK_ID])).toBe(true);
    expect(state.timeProblems[PLANK_ID]).toBeUndefined();
    expect(isChanged(state)).toBe(false);
  });
});

describe('BR-REC-74 opening the saved assessment of a date', () => {
  test('BR-REC-74 nothing typed: the saved assessment opens at once, its values appear', () => {
    const state = openedSaved();
    expect(state.opened).toEqual({ assessmentId: ASSESSMENT_ID, isEstimated: false });
    expect(state.offer).toBeNull();
    expect(state.loadedFor).toBe(SAVED_DATE);
    expect(state.inputs[WEIGHT_ID]).toBe('94.0'); // a Number as text with its decimals
    expect(state.inputs[PLANK_ID]).toBe(122); // a Time as seconds
    expect(isBlank(state.inputs[FAT_ID])).toBe(true); // nothing stored for it
  });

  test('BR-REC-127 a stored Number shows its decimals in the box (0, 1 and 2 decimals)', () => {
    const precise = metric({
      id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
      name: 'Waist',
      decimals: 2,
    });
    const state = run(emptyEntry(SAVED_DATE), {
      type: 'loaded',
      date: SAVED_DATE,
      metrics: [...METRICS, precise],
      existing: {
        ...SAVED,
        values: { [WEIGHT_ID]: 95.5, [FAT_ID]: 12, [precise.id]: 7.25 },
      },
      draft: null,
    });
    expect(state.inputs[WEIGHT_ID]).toBe('95.5');
    expect(state.inputs[FAT_ID]).toBe('12');
    expect(state.inputs[precise.id]).toBe('7.25');
  });

  test('BR-REC-77 the form remembers what was saved, by measurement', () => {
    expect(openedSaved().baseline).toEqual({ [WEIGHT_ID]: 94, [PLANK_ID]: 122 });
  });

  test('BR-REC-77 a new form has nothing saved', () => {
    expect(emptyEntry(NEW_DATE).baseline).toEqual({});
  });

  test('BR-REC-74 the About flag of the saved assessment comes with it', () => {
    const state = openedSaved({ ...SAVED, isEstimated: true });
    expect(state.isEstimated).toBe(true);
    expect(state.opened?.isEstimated).toBe(true);
  });

  test('BR-REC-74 a date with no saved assessment and no draft opens nothing', () => {
    const state = run(emptyEntry(NEW_DATE), loaded(NEW_DATE, null, null));
    expect(state.opened).toBeNull();
    expect(state.offer).toBeNull();
    expect(state.loadedFor).toBe(NEW_DATE);
    expect(hasTypedValues(state.inputs)).toBe(false);
  });

  test('BR-REC-74 values already typed: it asks "Open the saved one?" and changes nothing yet', () => {
    const state = run(
      emptyEntry(SAVED_DATE),
      typeText(WEIGHT_ID, '90'),
      loaded(SAVED_DATE, SAVED, null),
    );
    expect(state.offer?.kind).toBe('saved');
    if (state.offer?.kind === 'saved') expect(state.offer.existing).toEqual(SAVED);
    expect(state.inputs[WEIGHT_ID]).toBe('90');
    expect(state.opened).toBeNull();
  });

  test('BR-REC-74 [Open]: the saved values replace what was typed and the question goes', () => {
    const state = run(
      emptyEntry(SAVED_DATE),
      typeText(WEIGHT_ID, '90'),
      loaded(SAVED_DATE, SAVED, null),
      answer('open'),
    );
    expect(state.offer).toBeNull();
    expect(state.opened?.assessmentId).toBe(ASSESSMENT_ID);
    expect(state.inputs[WEIGHT_ID]).toBe('94.0');
    expect(state.inputs[PLANK_ID]).toBe(122);
    expect(state.baseline).toEqual({ [WEIGHT_ID]: 94, [PLANK_ID]: 122 });
    expect(isChanged(state)).toBe(false);
  });

  test('BR-REC-74 [Keep mine]: what was typed stays and the question goes', () => {
    const state = run(
      emptyEntry(SAVED_DATE),
      typeText(WEIGHT_ID, '90'),
      loaded(SAVED_DATE, SAVED, null),
      answer('keep'),
    );
    expect(state.offer).toBeNull();
    expect(state.inputs[WEIGHT_ID]).toBe('90');
    expect(isChanged(state)).toBe(true);
  });
});

describe('BR-REC-85 / D13 a draft is offered back, once', () => {
  test('BR-REC-85 a draft for a new date is offered and nothing is applied before the answer', () => {
    const state = run(emptyEntry(NEW_DATE), loaded(NEW_DATE, null, DRAFT));
    expect(state.offer?.kind).toBe('draft');
    if (state.offer?.kind === 'draft') {
      expect(state.offer.draft).toEqual(DRAFT);
      expect(state.offer.existing).toBeNull();
    }
    expect(hasTypedValues(state.inputs)).toBe(false);
    expect(state.isEstimated).toBe(false);
  });

  test('BR-REC-85 [Restore]: the typed text and seconds come back, with the About flag', () => {
    const state = run(emptyEntry(NEW_DATE), loaded(NEW_DATE, null, DRAFT), answer('restore'));
    expect(state.offer).toBeNull();
    expect(state.inputs[WEIGHT_ID]).toBe('95');
    expect(state.inputs[PLANK_ID]).toBe(150);
    expect(state.isEstimated).toBe(true);
    expect(isChanged(state)).toBe(true);
  });

  test('BR-REC-85 [Discard]: nothing comes back and the question goes', () => {
    const state = run(emptyEntry(NEW_DATE), loaded(NEW_DATE, null, DRAFT), answer('discard'));
    expect(state.offer).toBeNull();
    expect(hasTypedValues(state.inputs)).toBe(false);
    expect(state.isEstimated).toBe(false);
    expect(isChanged(state)).toBe(false);
  });

  test('BR-REC-85 a draft on top of a saved assessment is offered with that assessment', () => {
    const state = run(emptyEntry(SAVED_DATE), loaded(SAVED_DATE, SAVED, DRAFT));
    expect(state.offer?.kind).toBe('draft');
    if (state.offer?.kind === 'draft') expect(state.offer.existing).toEqual(SAVED);
  });

  test('BR-REC-85 [Restore] on a saved assessment: the draft values show, the saved assessment is still the one edited', () => {
    const state = run(emptyEntry(SAVED_DATE), loaded(SAVED_DATE, SAVED, DRAFT), answer('restore'));
    expect(state.offer).toBeNull();
    expect(state.opened?.assessmentId).toBe(ASSESSMENT_ID);
    expect(state.inputs[WEIGHT_ID]).toBe('95');
    expect(state.inputs[PLANK_ID]).toBe(150);
    expect(state.baseline).toEqual({ [WEIGHT_ID]: 94, [PLANK_ID]: 122 });
    expect(isChanged(state)).toBe(true);
  });

  test('BR-REC-85 [Discard] on a saved assessment: the saved values show and nothing is changed', () => {
    const state = run(emptyEntry(SAVED_DATE), loaded(SAVED_DATE, SAVED, DRAFT), answer('discard'));
    expect(state.offer).toBeNull();
    expect(state.opened?.assessmentId).toBe(ASSESSMENT_ID);
    expect(state.inputs[WEIGHT_ID]).toBe('94.0');
    expect(state.inputs[PLANK_ID]).toBe(122);
    expect(isChanged(state)).toBe(false);
  });

  test('D13 the same draft is not offered a second time when the form data arrives again', () => {
    const state = run(
      emptyEntry(NEW_DATE),
      loaded(NEW_DATE, null, DRAFT),
      answer('discard'),
      loaded(NEW_DATE, null, DRAFT),
    );
    expect(state.offer).toBeNull();
    expect(hasTypedValues(state.inputs)).toBe(false);
  });

  test('D13 a restored draft is not offered again either', () => {
    const state = run(
      emptyEntry(NEW_DATE),
      loaded(NEW_DATE, null, DRAFT),
      answer('restore'),
      loaded(NEW_DATE, null, DRAFT),
    );
    expect(state.offer).toBeNull();
    expect(state.inputs[WEIGHT_ID]).toBe('95');
  });
});

describe('BR-REC-86 the form data arriving again never wipes what was typed', () => {
  test('BR-REC-86 an opened saved assessment arriving again keeps the edits', () => {
    const state = run(openedSaved(), typeText(WEIGHT_ID, '90'), loaded(SAVED_DATE, SAVED, null));
    expect(state.inputs[WEIGHT_ID]).toBe('90');
    expect(state.offer).toBeNull();
    expect(isChanged(state)).toBe(true);
  });

  test('BR-REC-86 a new form arriving again keeps what was typed', () => {
    const state = run(
      emptyEntry(NEW_DATE),
      loaded(NEW_DATE, null, null),
      typeText(WEIGHT_ID, '94'),
      loaded(NEW_DATE, null, null),
    );
    expect(state.inputs[WEIGHT_ID]).toBe('94');
    expect(state.offer).toBeNull();
  });
});

describe('BR-REC-90 / D19 isChanged for an opened saved assessment', () => {
  test('D19 an assessment opened and left alone asks nothing', () => {
    expect(isChanged(openedSaved())).toBe(false);
  });

  test('D19 looking at a field (touch) asks nothing', () => {
    expect(isChanged(run(openedSaved(), { type: 'touch', metricId: WEIGHT_ID }))).toBe(false);
  });

  test('D19 changing a Number is a change; putting the same text back is not', () => {
    const edited = run(openedSaved(), typeText(WEIGHT_ID, '90'));
    expect(isChanged(edited)).toBe(true);
    expect(isChanged(run(edited, typeText(WEIGHT_ID, '94.0')))).toBe(false);
  });

  test('BR-REC-77 emptying a saved box is a change', () => {
    expect(isChanged(run(openedSaved(), typeText(WEIGHT_ID, '')))).toBe(true);
  });

  test('D19 filling a box that was empty is a change', () => {
    expect(isChanged(run(openedSaved(), typeText(FAT_ID, '9')))).toBe(true);
  });

  test('D19 changing a Time is a change; putting the same seconds back is not', () => {
    const edited = run(openedSaved(), {
      type: 'time',
      metricId: PLANK_ID,
      seconds: 130,
      status: 'valid',
    });
    expect(isChanged(edited)).toBe(true);
    const back = run(edited, { type: 'time', metricId: PLANK_ID, seconds: 122, status: 'valid' });
    expect(isChanged(back)).toBe(false);
  });

  test('BR-REC-90 flipping About on a saved assessment is an unsaved change; flipping it back is not', () => {
    const flipped = run(openedSaved(), { type: 'estimated', value: true });
    expect(isChanged(flipped)).toBe(true);
    expect(isChanged(run(flipped, { type: 'estimated', value: false }))).toBe(false);
  });
});

describe('D12 / BR-REC-85 moving to another date', () => {
  test('BR-REC-74 values typed fresh go along to the other date', () => {
    const state = run(emptyEntry(NEW_DATE), typeText(WEIGHT_ID, '94'), {
      type: 'date',
      date: '2026-10-02',
    });
    expect(state.date).toBe('2026-10-02');
    expect(state.inputs[WEIGHT_ID]).toBe('94');
    expect(isChanged(state)).toBe(true);
  });

  test('BR-REC-85 the other date is not loaded yet: its saved assessment and draft are still to come', () => {
    const state = run(emptyEntry(NEW_DATE), loaded(NEW_DATE, null, null), {
      type: 'date',
      date: '2026-10-02',
    });
    expect(state.loadedFor).toBeNull();
    expect(run(state, loaded('2026-10-02', null, null)).loadedFor).toBe('2026-10-02');
  });

  test('BR-REC-85 a date change with nothing typed asks nothing', () => {
    const state = run(emptyEntry(NEW_DATE), { type: 'date', date: '2026-10-02' });
    expect(isChanged(state)).toBe(false);
  });

  test('BR-REC-85 the values of an opened saved assessment stay with that date', () => {
    const state = run(openedSaved(), { type: 'date', date: '2025-03-15' });
    expect(state.date).toBe('2025-03-15');
    expect(state.opened).toBeNull();
    expect(hasTypedValues(state.inputs)).toBe(false);
    expect(state.baseline).toEqual({});
    expect(isChanged(state)).toBe(false);
  });

  test('BR-REC-85 edits typed on an opened saved assessment do not travel to the other date', () => {
    const state = run(openedSaved(), typeText(WEIGHT_ID, '90'), {
      type: 'date',
      date: '2025-03-15',
    });
    expect(hasTypedValues(state.inputs)).toBe(false);
    expect(state.opened).toBeNull();
  });

  test('BR-REC-79 a paper-column chip on an opened saved assessment also leaves it', () => {
    const state = run(openedSaved(), { type: 'paper', date: '2025-06-01' });
    expect(state.date).toBe('2025-06-01');
    expect(state.isEstimated).toBe(true);
    expect(state.opened).toBeNull();
    expect(hasTypedValues(state.inputs)).toBe(false);
  });
});

describe('D12 "Save & next date"', () => {
  const busy = (): EntryState =>
    run(
      emptyEntry(NEW_DATE),
      loaded(NEW_DATE, null, DRAFT),
      answer('restore'),
      { type: 'touch', metricId: WEIGHT_ID },
      { type: 'time', metricId: PLANK_ID, seconds: null, status: 'invalid' },
    );

  test('D12 the date is emptied (the date field takes focus)', () => {
    expect(run(busy(), { type: 'next' }).date).toBe('');
  });

  test('D12 the values and what was left over are cleared', () => {
    const state = run(busy(), { type: 'next' });
    expect(hasTypedValues(state.inputs)).toBe(false);
    expect(state.timeProblems).toEqual({});
    expect(state.touched).toEqual({});
    expect(state.offer).toBeNull();
    expect(state.opened).toBeNull();
    expect(state.baseline).toEqual({});
    expect(state.loadedFor).toBeNull();
  });

  test('D12 nothing is left to save, so leaving asks nothing', () => {
    expect(isChanged(run(busy(), { type: 'next' }))).toBe(false);
  });

  test('D12 after "next" an opened saved assessment is no longer open', () => {
    const state = run(openedSaved(), { type: 'next' });
    expect(state.opened).toBeNull();
    expect(hasTypedValues(state.inputs)).toBe(false);
    expect(state.date).toBe('');
  });

  test('D12 a new date can be picked afterwards and the form works again', () => {
    const state = run(
      busy(),
      { type: 'next' },
      { type: 'date', date: '2025-06-30' },
      typeText(WEIGHT_ID, '97'),
    );
    expect(state.date).toBe('2025-06-30');
    expect(state.inputs[WEIGHT_ID]).toBe('97');
  });
});

// D2: a saved assessment is edited by sending only the fields the trainer changed, so an untouched value is
// never re-rounded (setup C9). `isUnchangedField(state, metricId)`: the box of an OPENED saved assessment still
// holds what it held; a form that is not an opened saved assessment has no unchanged fields.
describe('D2 isUnchangedField: an opened saved assessment, box by box', () => {
  const time = (metricId: string, seconds: number | null): EntryAction => ({
    type: 'time',
    metricId,
    seconds,
    status: seconds === null ? 'empty' : 'valid',
  });

  test('D2 nothing touched: every box is unchanged (stored ones and empty ones)', () => {
    const state = openedSaved();
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(true);
    expect(isUnchangedField(state, PLANK_ID)).toBe(true);
    expect(isUnchangedField(state, FAT_ID)).toBe(true);
  });

  test('D2 a looked-at box (touched, not changed) is still unchanged', () => {
    const state = run(openedSaved(), { type: 'touch', metricId: WEIGHT_ID });
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(true);
  });

  test('D2 a changed Number is not unchanged; only that box', () => {
    const state = run(openedSaved(), typeText(WEIGHT_ID, '90'));
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(false);
    expect(isUnchangedField(state, PLANK_ID)).toBe(true);
    expect(isUnchangedField(state, FAT_ID)).toBe(true);
  });

  test('D2 typed, then put back to what it held: unchanged again', () => {
    const state = run(openedSaved(), typeText(WEIGHT_ID, '90'), typeText(WEIGHT_ID, '94.0'));
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(true);
  });

  test('BR-REC-77 a cleared box is not unchanged (it removes the value); typing it back is', () => {
    const cleared = run(openedSaved(), typeText(WEIGHT_ID, ''));
    expect(isUnchangedField(cleared, WEIGHT_ID)).toBe(false);
    expect(isUnchangedField(run(cleared, typeText(WEIGHT_ID, '94.0')), WEIGHT_ID)).toBe(true);
  });

  test('D2 a box that was empty and is filled is not unchanged', () => {
    const state = run(openedSaved(), typeText(FAT_ID, '9'));
    expect(isUnchangedField(state, FAT_ID)).toBe(false);
  });

  test('D2 a Time box changed, then reverted to the same seconds: unchanged again', () => {
    const changed = run(openedSaved(), time(PLANK_ID, 130));
    expect(isUnchangedField(changed, PLANK_ID)).toBe(false);
    expect(isUnchangedField(run(changed, time(PLANK_ID, 122)), PLANK_ID)).toBe(true);
  });

  test('BR-REC-75 a stored Time of 0 seconds is a value, not blank: untouched is unchanged, cleared is not', () => {
    const state = openedSaved({ ...SAVED, values: { [WEIGHT_ID]: 94, [PLANK_ID]: 0 } });
    expect(isUnchangedField(state, PLANK_ID)).toBe(true);
    expect(isUnchangedField(run(state, time(PLANK_ID, null)), PLANK_ID)).toBe(false);
  });

  test('BR-REC-75 typing 0 seconds into an empty Time box is a change (0 is not blank)', () => {
    const state = openedSaved({ ...SAVED, values: { [WEIGHT_ID]: 94 } });
    expect(isUnchangedField(state, PLANK_ID)).toBe(true);
    expect(isUnchangedField(run(state, time(PLANK_ID, 0)), PLANK_ID)).toBe(false);
  });
});

describe('D2 isUnchangedField: a form that is not an opened saved assessment has none', () => {
  test('D2 a new form: no box is unchanged, typed or not', () => {
    const state = emptyEntry(NEW_DATE);
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(false);
    expect(isUnchangedField(run(state, typeText(WEIGHT_ID, '94')), WEIGHT_ID)).toBe(false);
  });

  test('D2 a date with no saved assessment (loaded, nothing found): no box is unchanged', () => {
    const state = run(emptyEntry(NEW_DATE), loaded(NEW_DATE, null, null));
    for (const id of [WEIGHT_ID, FAT_ID, PLANK_ID]) expect(isUnchangedField(state, id)).toBe(false);
  });

  test('D2 a restored draft on a new date: no box is unchanged', () => {
    const state = run(emptyEntry(NEW_DATE), loaded(NEW_DATE, null, DRAFT), answer('restore'));
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(false);
  });

  test('D2 after moving off an opened saved assessment: no box is unchanged', () => {
    const state = run(openedSaved(), { type: 'date', date: '2025-03-15' });
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(false);
    expect(isUnchangedField(state, PLANK_ID)).toBe(false);
  });

  test('D2 after "Save & next date": no box is unchanged', () => {
    const state = run(openedSaved(), { type: 'next' });
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(false);
  });
});

describe('D2 / R-1 a stored value is never re-rounded: the same value typed another way is still unchanged', () => {
  // 95.55 was stored when the measurement had 2 decimals; today it has 1. The box must show every stored digit.
  const PRECISE: ExistingAssessment = { ...SAVED, values: { [WEIGHT_ID]: 95.55, [PLANK_ID]: 122 } };
  const precise = (): EntryState => openedSaved(PRECISE);

  test('R-1 the box shows "95.55", not "95.6" (never fewer digits than stored)', () => {
    expect(precise().inputs[WEIGHT_ID]).toBe('95.55');
  });

  test('R-1 a stored whole value still shows its decimals ("94.0")', () => {
    expect(openedSaved().inputs[WEIGHT_ID]).toBe('94.0');
  });

  test('D2 untouched, the precise box is unchanged', () => {
    expect(isUnchangedField(precise(), WEIGHT_ID)).toBe(true);
  });

  test.each([
    ['a comma for the point', '95,55'],
    ['a trailing space', '95.55 '],
    ['a leading space', ' 95.55'],
    ['a comma and a trailing space', '95,55 '],
  ])('D2 re-entered with %s ("%s") is still unchanged', (_name, text) => {
    const state = run(precise(), typeText(WEIGHT_ID, text));
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(true);
  });

  test('D2 re-entered the same value another way is not an unsaved change either', () => {
    expect(isChanged(run(precise(), typeText(WEIGHT_ID, '95,55')))).toBe(false);
    expect(isChanged(run(precise(), typeText(WEIGHT_ID, '95.55 ')))).toBe(false);
  });

  test.each([
    ['one hundredth more (95.56 would round to the same 95.6)', '95.56'],
    ['the rounded value (95.6)', '95.6'],
    ['one tenth less (95.5)', '95.5'],
    ['a whole number', '95'],
    ['a different number', '90'],
  ])('D2 a different value (%s, "%s") is a change', (_name, text) => {
    const state = run(precise(), typeText(WEIGHT_ID, text));
    expect(isUnchangedField(state, WEIGHT_ID)).toBe(false);
    expect(isChanged(state)).toBe(true);
  });

  test('D2 saving a re-typed identical value sends nothing and is allowed (About-only style save)', () => {
    const state = run(precise(), typeText(WEIGHT_ID, '95,55'));
    const fields = [WEIGHT, FAT, PLANK].map((metric) => ({
      metricId: metric.id,
      datatype: metric.datatype,
      decimals: (metric.decimals === 0 ? 0 : metric.decimals === 2 ? 2 : 1) as 0 | 1 | 2,
      input: state.inputs[metric.id] ?? (metric.datatype === 'duration' ? null : ''),
      hadValue: state.baseline[metric.id] !== undefined,
      unchanged: isUnchangedField(state, metric.id),
    }));
    const built = buildSaveValues(fields);
    expect(built).toEqual({ ok: true, values: [], filled: 0, removed: 0 });
    if (built.ok) expect(leavesNoValue(fields, built)).toBe(false);
  });
});
