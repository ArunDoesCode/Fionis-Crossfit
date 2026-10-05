// Spec: docs/specs/member-records/assessments.md (v3) + ux.md (v6) BR-REC-198 / D-034: the Record assessment
// form is React Hook Form + Zod; the reducer is gone. What stays is the pure questions around the typed values
// (`@/lib/assessments/entryValues`). Intents kept from the old reducer tests:
//   BR-REC-74 opening a saved assessment (values appear), BR-REC-77 emptying a saved box removes it,
//   BR-REC-85 / D13 a draft's text and seconds come back, BR-REC-90 / D19 the leave question only when
//   something differs (date alone, About on a new record, "95.50" vs "95.5" are not changes),
//   BR-REC-75 a Time of 0 seconds is a value, BR-REC-127 / R-1 a stored number shows every stored digit,
//   D2 an unchanged field is never re-sent.
import { describe, expect, test } from 'bun:test';
import type { Draft } from '@/lib/assessments/draft';
import {
  blankValues,
  decideLoaded,
  EMPTY_SESSION,
  type EntrySession,
  hasTypedValues,
  isBlankField,
  isChanged,
  isUnchangedField,
  sameField,
  valuesFromDraft,
  valuesFromSaved,
} from '@/lib/assessments/entryValues';
import type { EntryMetric, ExistingAssessment } from '@/lib/assessments/types';
import type { EntryFormInput, FieldText } from '@/lib/validators/assessments';

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
  tableGroup: null,
  tablePart: null,
  ...over,
});
const WEIGHT = metric({ id: WEIGHT_ID, name: 'Weight', unit: 'kg', decimals: 1 });
const FAT = metric({ id: FAT_ID, name: 'Visceral fat', decimals: 0 });
const PLANK = metric({ id: PLANK_ID, name: 'Plank', datatype: 'duration', decimals: 0 });
const METRICS = [WEIGHT, FAT, PLANK];

const SAVED: ExistingAssessment = {
  assessmentId: ASSESSMENT_ID,
  isEstimated: false,
  values: { [WEIGHT_ID]: 94, [PLANK_ID]: 122 },
};
const DATE = '2026-10-03';

/** The session of a saved assessment just opened: what the boxes held is what `valuesFromSaved` gives. */
const openedSession = (existing: ExistingAssessment = SAVED): EntrySession => ({
  ...EMPTY_SESSION,
  loadedFor: '2025-03-12',
  opened: { assessmentId: existing.assessmentId, isEstimated: existing.isEstimated },
  baseline: { ...existing.values },
  initial: valuesFromSaved(existing, METRICS),
});
/** A new record: nothing opened, nothing initial. */
const newSession = (): EntrySession => ({
  ...EMPTY_SESSION,
  loadedFor: DATE,
  initial: blankValues(METRICS),
});

const form = (
  values: Record<string, FieldText>,
  over: Partial<EntryFormInput> = {},
): EntryFormInput => ({ date: DATE, isEstimated: false, values, ...over });
const duration = (min: string, sec: string): FieldText => ({ min, sec });

describe('D19 blank and typed values', () => {
  test.each<[string, FieldText | undefined, boolean]>([
    ['undefined', undefined, true],
    ['an empty text', '', true],
    ['spaces only', '   ', true],
    ['a number text', '94', false],
    ['text with a mark', '95,', false],
    ['a typed zero', '0', false],
    ['two empty Time boxes', duration('', ''), true],
    ['a Time of 0:00 (a value, not blank)', duration('0', '0'), false],
    ['a Time of 2:02', duration('2', '02'), false],
    ['only seconds typed', duration('', '30'), false],
  ])('D19 isBlankField(%s) is %s', (_name, value, expected) => {
    expect(isBlankField(value)).toBe(expected);
  });

  test('D19 blankValues has one blank box per measurement, a Time as two boxes', () => {
    const blank = blankValues(METRICS);
    expect(isBlankField(blank[WEIGHT_ID])).toBe(true);
    expect(isBlankField(blank[PLANK_ID])).toBe(true);
    expect(Object.keys(blank).sort()).toEqual([WEIGHT_ID, FAT_ID, PLANK_ID].sort());
    expect(hasTypedValues(blank)).toBe(false);
  });

  test('D19 hasTypedValues: nothing typed is false, one filled box is true', () => {
    expect(hasTypedValues({})).toBe(false);
    expect(hasTypedValues({ [WEIGHT_ID]: '  ', [PLANK_ID]: duration('', '') })).toBe(false);
    expect(hasTypedValues({ [WEIGHT_ID]: '', [FAT_ID]: '9' })).toBe(true);
    expect(hasTypedValues({ [PLANK_ID]: duration('0', '0') })).toBe(true);
  });
});

describe('D2 / R-1 sameField: a box holds the same value however it is spelled', () => {
  test.each<[string, FieldText, FieldText, boolean]>([
    ['blank vs blank', '', '  ', true],
    ['95.5 vs 95,5', '95.5', '95,5', true],
    ['95.50 vs 95.5', '95.50', '95.5', true],
    ['trailing space', '95.55 ', '95.55', true],
    ['95.56 vs 95.55 (never rounded)', '95.56', '95.55', false],
    ['95.6 vs 95.55', '95.6', '95.55', false],
    ['filled vs blank', '0', '', false],
    ['Time 2:02 vs 2:2', duration('2', '02'), duration('2', '2'), true],
    ['Time 2:02 vs 2:03', duration('2', '02'), duration('2', '03'), false],
    ['Time 0:00 vs blank', duration('0', '0'), duration('', ''), false],
  ])('D2 sameField(%s) is %s', (_name, a, b, expected) => {
    expect(sameField(a, b)).toBe(expected);
  });
});

describe('BR-REC-90 / D19 isChanged on a new record', () => {
  test('D19 nothing typed is not a change, even with a date', () => {
    expect(isChanged(form(blankValues(METRICS)), newSession())).toBe(false);
  });
  test('D19 the date alone is not a change', () => {
    expect(isChanged(form(blankValues(METRICS), { date: '2026-09-01' }), newSession())).toBe(false);
  });
  test('D19 About on a new record is not a change', () => {
    expect(isChanged(form(blankValues(METRICS), { isEstimated: true }), newSession())).toBe(false);
  });
  test('D19 typing a number is a change; clearing it again is not', () => {
    const typed = { ...blankValues(METRICS), [WEIGHT_ID]: '94' };
    expect(isChanged(form(typed), newSession())).toBe(true);
    expect(isChanged(form({ ...typed, [WEIGHT_ID]: '  ' }), newSession())).toBe(false);
  });
});

describe('BR-REC-90 / D19 isChanged on an opened saved assessment', () => {
  const saved = () => ({ ...valuesFromSaved(SAVED, METRICS) });

  test('D19 opened and left alone asks nothing', () => {
    expect(isChanged(form(saved()), openedSession())).toBe(false);
  });
  test('D19 the date alone is not a change', () => {
    expect(isChanged(form(saved(), { date: '2025-03-15' }), openedSession())).toBe(false);
  });
  test('D19 a changed Number is a change; the same value spelled another way is not', () => {
    expect(isChanged(form({ ...saved(), [WEIGHT_ID]: '90' }), openedSession())).toBe(true);
    expect(isChanged(form({ ...saved(), [WEIGHT_ID]: '94,0' }), openedSession())).toBe(false);
    expect(isChanged(form({ ...saved(), [WEIGHT_ID]: '94' }), openedSession())).toBe(false);
  });
  test('BR-REC-77 emptying a saved box is a change', () => {
    expect(isChanged(form({ ...saved(), [WEIGHT_ID]: '' }), openedSession())).toBe(true);
  });
  test('D19 filling an empty box is a change', () => {
    expect(isChanged(form({ ...saved(), [FAT_ID]: '9' }), openedSession())).toBe(true);
  });
  test('D19 a changed Time is a change; the same seconds put back are not', () => {
    expect(isChanged(form({ ...saved(), [PLANK_ID]: duration('2', '10') }), openedSession())).toBe(
      true,
    );
    expect(isChanged(form({ ...saved(), [PLANK_ID]: duration('2', '2') }), openedSession())).toBe(
      false,
    );
  });
  test('BR-REC-90 flipping About on a saved assessment is a change; flipping it back is not', () => {
    expect(isChanged(form(saved(), { isEstimated: true }), openedSession())).toBe(true);
    expect(isChanged(form(saved(), { isEstimated: false }), openedSession())).toBe(false);
  });
});

describe('D2 isUnchangedField', () => {
  const saved = () => ({ ...valuesFromSaved(SAVED, METRICS) });

  test('D2 nothing touched: every box of an opened assessment is unchanged', () => {
    for (const id of [WEIGHT_ID, FAT_ID, PLANK_ID]) {
      expect(isUnchangedField(openedSession(), saved(), id)).toBe(true);
    }
  });
  test('D2 a changed Number is not unchanged; only that box', () => {
    const values = { ...saved(), [WEIGHT_ID]: '90' };
    expect(isUnchangedField(openedSession(), values, WEIGHT_ID)).toBe(false);
    expect(isUnchangedField(openedSession(), values, PLANK_ID)).toBe(true);
    expect(isUnchangedField(openedSession(), values, FAT_ID)).toBe(true);
  });
  test('BR-REC-77 a cleared box is not unchanged; typing it back is', () => {
    expect(isUnchangedField(openedSession(), { ...saved(), [WEIGHT_ID]: '' }, WEIGHT_ID)).toBe(
      false,
    );
    expect(isUnchangedField(openedSession(), { ...saved(), [WEIGHT_ID]: '94.0' }, WEIGHT_ID)).toBe(
      true,
    );
  });
  test('BR-REC-75 a stored Time of 0 seconds is a value: untouched unchanged, cleared not', () => {
    const existing = { ...SAVED, values: { [WEIGHT_ID]: 94, [PLANK_ID]: 0 } };
    const session = openedSession(existing);
    const values = valuesFromSaved(existing, METRICS);
    expect(isUnchangedField(session, values, PLANK_ID)).toBe(true);
    expect(isUnchangedField(session, { ...values, [PLANK_ID]: duration('', '') }, PLANK_ID)).toBe(
      false,
    );
  });
  test('BR-REC-75 typing 0 seconds into an empty Time box is a change', () => {
    const existing = { ...SAVED, values: { [WEIGHT_ID]: 94 } };
    const values = { ...valuesFromSaved(existing, METRICS), [PLANK_ID]: duration('0', '0') };
    expect(isUnchangedField(openedSession(existing), values, PLANK_ID)).toBe(false);
  });
  test('D2 a form that is not an opened saved assessment has no unchanged box', () => {
    const typed = { ...blankValues(METRICS), [WEIGHT_ID]: '94' };
    expect(isUnchangedField(newSession(), blankValues(METRICS), WEIGHT_ID)).toBe(false);
    expect(isUnchangedField(newSession(), typed, WEIGHT_ID)).toBe(false);
  });

  describe('R-1 a stored value is never re-rounded', () => {
    // 95.55 was stored when the measurement had 2 decimals; today it has 1.
    const PRECISE: ExistingAssessment = {
      ...SAVED,
      values: { [WEIGHT_ID]: 95.55, [PLANK_ID]: 122 },
    };
    const base = () => valuesFromSaved(PRECISE, METRICS);

    test('R-1 the box shows "95.55", not "95.6"', () => {
      expect(base()[WEIGHT_ID]).toBe('95.55');
    });
    test.each(['95,55', '95.55 ', ' 95.55', '95,55 '])(
      'D2 re-entered as %j is unchanged',
      (text) => {
        expect(
          isUnchangedField(openedSession(PRECISE), { ...base(), [WEIGHT_ID]: text }, WEIGHT_ID),
        ).toBe(true);
        expect(isChanged(form({ ...base(), [WEIGHT_ID]: text }), openedSession(PRECISE))).toBe(
          false,
        );
      },
    );
    test.each(['95.56', '95.6', '95.5', '95', '90'])(
      'D2 a different value %j is a change',
      (text) => {
        expect(
          isUnchangedField(openedSession(PRECISE), { ...base(), [WEIGHT_ID]: text }, WEIGHT_ID),
        ).toBe(false);
        expect(isChanged(form({ ...base(), [WEIGHT_ID]: text }), openedSession(PRECISE))).toBe(
          true,
        );
      },
    );
  });
});

describe('BR-REC-74 / BR-REC-127 valuesFromSaved', () => {
  test('BR-REC-127 a stored Number shows its decimals; a stored Time is two boxes', () => {
    const values = valuesFromSaved(SAVED, METRICS);
    expect(values[WEIGHT_ID]).toBe('94.0');
    expect(sameField(values[PLANK_ID], duration('2', '2'))).toBe(true);
    expect(isBlankField(values[FAT_ID])).toBe(true);
  });
  test('BR-REC-127 0, 1 and 2 decimals show as stored', () => {
    const waist = metric({
      id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
      name: 'Waist',
      decimals: 2,
    });
    const values = valuesFromSaved(
      { ...SAVED, values: { [WEIGHT_ID]: 95.5, [FAT_ID]: 12, [waist.id]: 7.25 } },
      [...METRICS, waist],
    );
    expect(values[WEIGHT_ID]).toBe('95.5');
    expect(values[FAT_ID]).toBe('12');
    expect(values[waist.id]).toBe('7.25');
  });
});

describe('BR-REC-85 / D13 valuesFromDraft', () => {
  const draft: Draft = {
    savedAt: Date.UTC(2026, 9, 3, 10, 42),
    isEstimated: true,
    values: { [WEIGHT_ID]: '95', [PLANK_ID]: 150 },
  };
  test('BR-REC-85 the typed text and the seconds come back', () => {
    const values = valuesFromDraft(draft, METRICS);
    expect(values[WEIGHT_ID]).toBe('95');
    expect(sameField(values[PLANK_ID], duration('2', '30'))).toBe(true);
    expect(isBlankField(values[FAT_ID])).toBe(true);
  });
  test('BR-REC-85 a value of the wrong kind (the setting changed) is dropped', () => {
    const odd: Draft = { ...draft, values: { [WEIGHT_ID]: '95', [PLANK_ID]: '150' } };
    expect(isBlankField(valuesFromDraft(odd, METRICS)[PLANK_ID])).toBe(true);
  });
  test('BR-REC-85 an empty draft gives blank boxes', () => {
    expect(hasTypedValues(valuesFromDraft({ ...draft, values: {} }, METRICS))).toBe(false);
  });
});

describe('BR-REC-74 / BR-REC-85 decideLoaded: what to do with the saved assessment and the draft of a date', () => {
  test.each<[string, { typed: boolean; hasDraft: boolean; hasSaved: boolean }, string]>([
    ['nothing typed, a draft', { typed: false, hasDraft: true, hasSaved: false }, 'offer-draft'],
    [
      'nothing typed, draft and saved',
      { typed: false, hasDraft: true, hasSaved: true },
      'offer-draft',
    ],
    ['nothing typed, saved only', { typed: false, hasDraft: false, hasSaved: true }, 'open-saved'],
    [
      'typed, saved only: asks "Open the saved one?"',
      { typed: true, hasDraft: false, hasSaved: true },
      'offer-saved',
    ],
    ['nothing anywhere', { typed: false, hasDraft: false, hasSaved: false }, 'nothing'],
    ['typed, nothing saved', { typed: true, hasDraft: false, hasSaved: false }, 'nothing'],
  ])('decideLoaded: %s -> %s', (_name, input, expected) => {
    expect(decideLoaded(input)).toBe(expected);
  });
});
