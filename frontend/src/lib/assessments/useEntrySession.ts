'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { EntryFormInput, EntryFormValues } from '@/lib/validators/assessments';
import { browserDraftStorage, clearDraft, draftKey, dropExpiredDrafts, loadDraft } from './draft';
import {
  blankValues,
  decideLoaded,
  EMPTY_SESSION,
  type EntrySession,
  hasTypedValues,
  valuesFromDraft,
  valuesFromSaved,
} from './entryValues';
import type { EntryForm, ExistingAssessment } from './types';

export type EntryFormApi = UseFormReturn<EntryFormInput, unknown, EntryFormValues>;

interface EntrySessionInput {
  form: EntryFormApi;
  memberId: string;
  typeId: string;
  /** The picked date (`watch('date')`). */
  date: string;
  /** E25 for `date`; `fresh` is false while it is cached data or a refetch is under way. */
  data: EntryForm | undefined;
  fresh: boolean;
}

export interface EntrySessionApi {
  session: EntrySession;
  /** Another date (or a paper column, which also ticks About): typed values go along, a saved one stays behind. */
  moveToDate: (date: string, estimated?: boolean) => void;
  answerOffer: (answer: 'restore' | 'discard' | 'open' | 'keep') => void;
  /** "Save & next date": empty form, no date, nothing opened. */
  startNext: () => void;
}

/**
 * What the server and this device know about the picked date, moved into the form once per date: drops drafts
 * older than 7 days when a form opens (D13), then reads the saved assessment of that date (BR-REC-74) and the
 * draft kept for it (BR-REC-85). Only fresh data counts: a cached answer from an earlier visit could miss an
 * assessment saved since. The typed values stay in React Hook Form; this keeps the rest (`EntrySession`).
 */
export function useEntrySession({
  form,
  memberId,
  typeId,
  date,
  data,
  fresh,
}: EntrySessionInput): EntrySessionApi {
  const [session, setSession] = useState<EntrySession>(EMPTY_SESSION);
  const metrics = data?.metrics;

  useEffect(() => {
    const storage = browserDraftStorage();
    if (storage) dropExpiredDrafts(storage, Date.now());
  }, []);

  const dropDraft = useCallback(
    (day: string) => {
      const storage = browserDraftStorage();
      if (storage && day !== '') clearDraft(storage, draftKey(memberId, typeId, day));
    },
    [memberId, typeId],
  );

  // The saved assessment fills the boxes and becomes what "unchanged" is measured against.
  const openSaved = useCallback(
    (existing: ExistingAssessment, day: string) => {
      if (!metrics) return;
      const values = valuesFromSaved(existing, metrics);
      form.reset({ date: day, isEstimated: existing.isEstimated, values });
      setSession((was) => ({
        ...was,
        offer: null,
        opened: { assessmentId: existing.assessmentId, isEstimated: existing.isEstimated },
        baseline: { ...existing.values },
        initial: values,
      }));
    },
    [form, metrics],
  );

  useEffect(() => {
    if (!data || !fresh || date === '' || session.loadedFor === date) return;
    const storage = browserDraftStorage();
    const draft = storage ? loadDraft(storage, draftKey(memberId, typeId, date), Date.now()) : null;
    const current = form.getValues();
    // The first answer makes the fields exist (blank); later ones keep what is typed.
    if (Object.keys(current.values).length === 0) {
      form.reset({ date, isEstimated: false, values: blankValues(data.metrics) });
    }
    const decision = decideLoaded({
      typed: hasTypedValues(current.values),
      hasDraft: draft !== null,
      hasSaved: data.existing !== null,
    });
    const base = { ...EMPTY_SESSION, loadedFor: date };
    const { existing } = data;
    if (decision === 'offer-draft' && draft) {
      setSession({ ...base, offer: { kind: 'draft', draft, existing } });
    } else if (decision === 'offer-saved' && existing) {
      setSession({ ...base, offer: { kind: 'saved', existing } });
    } else {
      setSession(base);
      if (decision === 'open-saved' && existing) openSaved(existing, date);
    }
  }, [data, fresh, date, session.loadedFor, memberId, typeId, form, openSaved]);

  const moveToDate = useCallback(
    (next: string, estimated = false) => {
      const current = form.getValues();
      if (next !== current.date) {
        const carried = session.opened === null;
        if (carried) {
          if (hasTypedValues(current.values)) dropDraft(current.date); // the draft goes with the values
          form.setValue('date', next, { shouldValidate: true });
        } else {
          form.reset({ date: next, isEstimated: false, values: blankValues(metrics ?? []) });
        }
        setSession(EMPTY_SESSION);
      }
      if (estimated) form.setValue('isEstimated', true, { shouldDirty: true });
    },
    [form, metrics, session.opened, dropDraft],
  );

  const answerOffer = useCallback(
    (answer: 'restore' | 'discard' | 'open' | 'keep') => {
      const { offer } = session;
      if (!offer || !metrics) return;
      const day = form.getValues('date');
      if (offer.kind === 'saved') {
        if (answer === 'open') openSaved(offer.existing, day);
        else setSession((was) => ({ ...was, offer: null }));
        return;
      }
      if (answer === 'discard') dropDraft(day);
      if (offer.existing) openSaved(offer.existing, day);
      else setSession((was) => ({ ...was, offer: null }));
      if (answer === 'restore') {
        // Defaults stay the saved (or blank) boxes, so what the draft changed counts as typed.
        form.reset(
          {
            date: day,
            isEstimated: offer.draft.isEstimated,
            values: valuesFromDraft(offer.draft, metrics),
          },
          { keepDefaultValues: true },
        );
      }
    },
    [session, metrics, form, openSaved, dropDraft],
  );

  const startNext = useCallback(() => {
    form.reset({ date: '', isEstimated: false, values: blankValues(metrics ?? []) });
    setSession(EMPTY_SESSION);
  }, [form, metrics]);

  return { session, moveToDate, answerOffer, startNext };
}
