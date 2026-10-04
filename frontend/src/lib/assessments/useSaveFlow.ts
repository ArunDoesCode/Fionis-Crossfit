'use client';

import { type Dispatch, useRef, useState } from 'react';
import { useSaveAssessment } from '@/lib/api/assessments/queries';
import { browserDraftStorage, clearDraft, draftKey } from './draft';
import { type EntryAction, type EntryState, isUnchangedField } from './entryState';
import { type FlaggedField, flaggedFields } from './fieldView';
import { dateDomId, fieldDomId, focusField } from './focusField';
import { entryDateIssue } from './labels';
import { buildSaveValues, leavesNoValue, type SaveField } from './saveBody';
import { saveFailureText } from './saveError';
import { ASSESSMENT_TEXT } from './text';
import { asDecimals, type EntryMetric } from './types';

interface SaveFlowInput {
  memberId: string;
  typeId: string;
  member: { fullName: string; joinedOn: string };
  today: string;
  /** The form's id: field ids are built from it. */
  formId: string;
  metrics: EntryMetric[];
  state: EntryState;
  dispatch: Dispatch<EntryAction>;
  /** After a successful Save: back to where the entry started (D12). */
  exitToStart: () => void;
}

export interface SaveFlow {
  saving: boolean;
  /** The "Save & next date" button is the one saving. */
  savingNext: boolean;
  /** Save was tapped once: every field now shows its own problems (BR-REC-134). */
  attempted: boolean;
  /** The sentence next to the Save bar: nothing filled, not saved, a refusal. */
  status: string | null;
  /** The "Check these values" sheet; `lines` keep their text while it closes. */
  check: { open: boolean; lines: FlaggedField[] };
  save: (next: boolean) => void;
  goBack: () => void;
  saveAnyway: () => void;
}

interface Prepared {
  values: { metricId: string; value: number | null }[];
  next: boolean;
}

/**
 * Save and "Save & next date" (BR-REC-19, 76–78, 82–84, 86). Order of the checks: a date is picked and not
 * in the future, no Time box out of range, every number readable, the assessment would still hold a value
 * (BR-REC-78, D2), then the one "Check these values" sheet when a value being sent looks odd (BR-REC-82).
 * A saved assessment sends only the boxes that changed (D2): an untouched value is never rewritten. A
 * failed Save keeps everything and says so next to the bar; saving again is the same E26 upsert, never a
 * second assessment (BR-REC-86).
 */
export function useSaveFlow(input: SaveFlowInput): SaveFlow {
  const { memberId, typeId, member, today, formId, metrics, state, dispatch, exitToStart } = input;
  const mutation = useSaveAssessment(member.fullName);
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checkLines, setCheckLines] = useState<FlaggedField[]>([]);
  const [checkOpen, setCheckOpen] = useState(false);
  const [nextWanted, setNextWanted] = useState(false);
  const prepared = useRef<Prepared | null>(null);

  function send({ values, next }: Prepared) {
    setStatus(null);
    mutation.mutate(
      { memberId, typeId, date: state.date, isEstimated: state.isEstimated, values },
      {
        onSuccess: () => {
          const storage = browserDraftStorage();
          if (storage) clearDraft(storage, draftKey(memberId, typeId, state.date));
          if (!next) {
            exitToStart();
            return;
          }
          dispatch({ type: 'next' });
          setAttempted(false);
          requestAnimationFrame(() => focusField(dateDomId(formId)));
        },
        onError: (error) => setStatus(saveFailureText(error)),
      },
    );
  }

  function save(next: boolean) {
    if (mutation.isPending) return;
    setNextWanted(next);
    setAttempted(true);
    setStatus(null);

    if (state.date === '') {
      focusField(dateDomId(formId)); // the date field says "Pick a date"
      return;
    }
    const issue = entryDateIssue({
      date: state.date,
      today,
      joinedOn: member.joinedOn,
      memberName: member.fullName,
    });
    if (issue.kind === 'future') {
      focusField(dateDomId(formId)); // the date field shows the sentence
      return;
    }
    const badTime = metrics.find((metric) => state.timeProblems[metric.id]);
    if (badTime) {
      focusField(fieldDomId(formId, badTime.id));
      return;
    }

    const fields: SaveField[] = metrics.map((metric) => ({
      metricId: metric.id,
      datatype: metric.datatype,
      decimals: asDecimals(metric.decimals),
      input: state.inputs[metric.id] ?? null,
      hadValue: metric.id in state.baseline,
      unchanged: isUnchangedField(state, metric.id),
    }));
    const built = buildSaveValues(fields);
    if (!built.ok) {
      const first = built.problems[0];
      if (first) focusField(fieldDomId(formId, first.metricId));
      return;
    }
    if (leavesNoValue(fields, built)) {
      setStatus(ASSESSMENT_TEXT.noValues);
      return;
    }

    prepared.current = { values: built.values, next };
    const sent = metrics.filter((metric) => !isUnchangedField(state, metric.id));
    const odd = flaggedFields(sent, state.inputs);
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
    attempted,
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
