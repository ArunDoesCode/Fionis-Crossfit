'use client';

import { useCallback, useRef, useState } from 'react';
import { useSaveAssessment } from '@/lib/api/assessments/queries';
import type { EntryFormInput, EntryFormValues } from '@/lib/validators/assessments';
import { browserDraftStorage, clearDraft, draftKey } from './draft';
import { type EntrySession, isUnchangedField } from './entryValues';
import { type FlaggedField, flaggedFields } from './fieldView';
import { buildSaveValues, leavesNoValue, type SaveField, stillDueAfter } from './saveBody';
import { saveFailureText } from './saveError';
import { ASSESSMENT_TEXT } from './text';
import { asDecimals, type EntryMetric } from './types';

interface SaveFlowInput {
  memberId: string;
  typeId: string;
  member: { fullName: string };
  metrics: EntryMetric[];
  session: EntrySession;
  /** Something differs from what was opened (D19); an opened assessment left alone saves nothing. */
  changed: boolean;
  /** What is typed right now (the text of every box). */
  getTyped: () => EntryFormInput;
  /** After "Save & next date": the screen empties the form and puts the cursor on the date. */
  onNext: () => void;
  /** After a successful Save: back to where the entry started (D12). */
  exitToStart: () => void;
  /** Save with nothing entered: the cursor goes to the first measurement (BR-REC-190). */
  focusFirstValue: () => void;
}

export interface SaveFlow {
  saving: boolean;
  /** The "Save & next date" button is the one saving. */
  savingNext: boolean;
  /** Counts the Save clicks that found nothing to save; 0 = none. A new count re-announces the alert. */
  needOne: number;
  /** Any edit takes the "Enter at least one value" alert away. */
  clearNeedOne: () => void;
  /** The sentence at the end of the form: not saved, a refusal of the server. */
  status: string | null;
  /** The "Check these values" sheet; `lines` keep their text while it closes. */
  check: { open: boolean; lines: FlaggedField[] };
  /** Runs after the schema accepted the form (React Hook Form's `handleSubmit`). */
  save: (values: EntryFormValues, next: boolean) => void;
  goBack: () => void;
  saveAnyway: () => void;
}

interface Prepared {
  values: { metricId: string; value: number | null }[];
  date: string;
  isEstimated: boolean;
  next: boolean;
  /** Measurements still empty after this save (the partial-save toast, BR-REC-230). */
  stillDue: number;
}

/**
 * Save and "Save & next date" (BR-REC-19, 76–78, 82–84, 86). The schema has already checked the date and that
 * every number is readable; here: the assessment would still hold a value (BR-REC-78, D2), then the one "Check
 * these values" sheet when a value being sent looks odd (BR-REC-82). A saved assessment sends only the boxes
 * that changed (D2): an untouched value is never rewritten, and one left alone sends no request at
 * all and closes without a word (BR-REC-190). A failed Save keeps everything and says so at the end of the
 * form; saving again is the same E26 upsert, never a second assessment (BR-REC-86).
 */
export function useSaveFlow(input: SaveFlowInput): SaveFlow {
  const { memberId, typeId, member, metrics, session, changed, getTyped } = input;
  const mutation = useSaveAssessment(member.fullName);
  const [status, setStatus] = useState<string | null>(null);
  const [needOne, setNeedOne] = useState(0);
  const [checkLines, setCheckLines] = useState<FlaggedField[]>([]);
  const [checkOpen, setCheckOpen] = useState(false);
  const [nextWanted, setNextWanted] = useState(false);
  const prepared = useRef<Prepared | null>(null);
  const clearNeedOne = useCallback(() => setNeedOne(0), []);

  /** The assessment is saved (or there was nothing to write): drop the draft, then leave or start the next date. */
  function finish(date: string, next: boolean) {
    const storage = browserDraftStorage();
    if (storage) clearDraft(storage, draftKey(memberId, typeId, date));
    if (next) input.onNext();
    else input.exitToStart();
  }

  function send({ values, date, isEstimated, next, stillDue }: Prepared) {
    setStatus(null);
    mutation.mutate(
      { memberId, typeId, date, isEstimated, values, stillDue },
      {
        onSuccess: () => finish(date, next),
        onError: (error) => setStatus(saveFailureText(error)),
      },
    );
  }

  function save(valid: EntryFormValues, next: boolean) {
    if (mutation.isPending) return;
    setNextWanted(next);
    setStatus(null);

    // An opened saved assessment (still on its own date) left alone: nothing to write (D2).
    if (session.opened !== null && !changed) {
      finish(valid.date, next);
      return;
    }

    const typed = getTyped().values;
    const fields: SaveField[] = metrics.map((metric) => ({
      metricId: metric.id,
      datatype: metric.datatype,
      decimals: asDecimals(metric.decimals),
      input: valid.values[metric.id] ?? null,
      hadValue: metric.id in session.baseline,
      unchanged: isUnchangedField(session, typed, metric.id),
    }));
    const built = buildSaveValues(fields);
    if (!built.ok) {
      setStatus(ASSESSMENT_TEXT.numberError); // the schema already caught these; never send a bad number
      return;
    }
    if (leavesNoValue(fields, built)) {
      setNeedOne((count) => count + 1);
      input.focusFirstValue();
      return;
    }

    prepared.current = {
      values: built.values,
      date: valid.date,
      isEstimated: valid.isEstimated,
      next,
      stillDue: stillDueAfter(
        metrics.map((metric) => metric.id),
        Object.keys(session.baseline),
        built.values,
      ),
    };
    const sent = metrics.filter((metric) => !isUnchangedField(session, typed, metric.id));
    const odd = flaggedFields(sent, valid.values);
    if (odd.length > 0) {
      setCheckLines(odd);
      setCheckOpen(true);
    } else {
      send(prepared.current);
    }
  }

  return {
    saving: mutation.isPending,
    savingNext: mutation.isPending && nextWanted,
    needOne,
    clearNeedOne,
    status,
    check: { open: checkOpen, lines: checkLines },
    save,
    goBack: () => setCheckOpen(false),
    saveAnyway: () => {
      setCheckOpen(false);
      if (prepared.current) send(prepared.current);
    },
  };
}
