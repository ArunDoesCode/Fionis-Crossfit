// Spec: assessments.md BR-REC-78 + ux.md BR-REC-190 (v6): saving a NEW record with no value is refused with
// "Enter at least one value" (word-list key needOneValue) and sends nothing; saving an EDIT with no change
// sends nothing and closes silently. Headless part: the pure decisions the save flow is built from.
// The request count itself (0 requests, no toast, alert re-announced, focus) needs React rendering: MANUAL-ONLY.
import { describe, expect, test } from 'bun:test';
import {
  blankValues,
  EMPTY_SESSION,
  type EntrySession,
  isChanged,
  isUnchangedField,
  valuesFromSaved,
} from '@/lib/assessments/entryValues';
import { buildSaveValues, leavesNoValue, type SaveField } from '@/lib/assessments/saveBody';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { EntryMetric, ExistingAssessment } from '@/lib/assessments/types';
import { UI_TEXT } from '@/lib/messages/words';

const W = '11111111-1111-4111-8111-111111111111';
const P = '33333333-3333-4333-8333-333333333333';
const metrics: EntryMetric[] = [
  {
    id: W,
    name: 'Weight',
    unit: 'kg',
    datatype: 'number',
    decimals: 1,
    better: 'none',
    plausibleMin: null,
    plausibleMax: null,
    previous: null,
    tableGroup: null,
    tablePart: null,
  },
  {
    id: P,
    name: 'Plank',
    unit: '',
    datatype: 'duration',
    decimals: 0,
    better: 'higher',
    plausibleMin: null,
    plausibleMax: null,
    previous: null,
    tableGroup: null,
    tablePart: null,
  },
];

describe('BR-REC-190 the "Enter at least one value" text', () => {
  test('BR-REC-190 the word-list key needOneValue says "Enter at least one value"', () => {
    expect((UI_TEXT as Record<string, unknown>).needOneValue).toBe('Enter at least one value');
  });
  test('BR-REC-190 the save flow uses that same text', () => {
    expect(ASSESSMENT_TEXT.noValues).toBe('Enter at least one value');
  });
});

describe('BR-REC-190 new record with nothing filled: refused, nothing to send', () => {
  const fields: SaveField[] = [
    {
      metricId: W,
      datatype: 'number',
      decimals: 1,
      input: '  ',
      hadValue: false,
      unchanged: false,
    },
    {
      metricId: P,
      datatype: 'duration',
      decimals: 0,
      input: null,
      hadValue: false,
      unchanged: false,
    },
  ];
  test('BR-REC-190 no values are built and the save leaves no value', () => {
    const built = buildSaveValues(fields);
    expect(built).toEqual({ ok: true, values: [], filled: 0, removed: 0 });
    if (built.ok) expect(leavesNoValue(fields, built)).toBe(true);
  });
  test('BR-REC-190 one filled box is allowed', () => {
    const filled = [{ ...fields[0], input: '94' } as SaveField, fields[1] as SaveField];
    const built = buildSaveValues(filled);
    expect(built.ok && built.values).toEqual([{ metricId: W, value: 94 }]);
    if (built.ok) expect(leavesNoValue(filled, built)).toBe(false);
  });
  test('BR-REC-190 a Time of 0 seconds counts as filled', () => {
    const filled = [fields[0] as SaveField, { ...fields[1], input: 0 } as SaveField];
    const built = buildSaveValues(filled);
    if (built.ok) expect(leavesNoValue(filled, built)).toBe(false);
  });
});

describe('BR-REC-190 / Q8 an edit with no change sends nothing', () => {
  const existing: ExistingAssessment = {
    assessmentId: '99999999-9999-4999-8999-999999999999',
    isEstimated: false,
    values: { [W]: 94, [P]: 122 },
  };
  const session: EntrySession = {
    ...EMPTY_SESSION,
    loadedFor: '2025-03-12',
    opened: { assessmentId: existing.assessmentId, isEstimated: false },
    baseline: { ...existing.values },
    initial: valuesFromSaved(existing, metrics),
  };

  test('BR-REC-190 untouched: isChanged is false, so Save closes with no request', () => {
    const values = valuesFromSaved(existing, metrics);
    expect(isChanged({ date: '2025-03-12', isEstimated: false, values }, session)).toBe(false);
  });
  test('BR-REC-190 every box is unchanged and builds no values', () => {
    const values = valuesFromSaved(existing, metrics);
    const fields: SaveField[] = metrics.map((m) => ({
      metricId: m.id,
      datatype: m.datatype,
      decimals: 1,
      input: m.datatype === 'duration' ? 122 : '94.0',
      hadValue: m.id in session.baseline,
      unchanged: isUnchangedField(session, values, m.id),
    }));
    expect(buildSaveValues(fields)).toEqual({ ok: true, values: [], filled: 0, removed: 0 });
  });
  test('BR-REC-190 a real change is not "nothing to save"', () => {
    const values = { ...valuesFromSaved(existing, metrics), [W]: '90' };
    expect(isChanged({ date: '2025-03-12', isEstimated: false, values }, session)).toBe(true);
  });
  test('BR-REC-190 a new record is never an "unchanged edit"', () => {
    const fresh: EntrySession = {
      ...EMPTY_SESSION,
      loadedFor: '2026-10-03',
      initial: blankValues(metrics),
    };
    expect(isUnchangedField(fresh, blankValues(metrics), W)).toBe(false);
  });
});
