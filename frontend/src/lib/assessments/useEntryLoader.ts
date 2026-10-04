'use client';

import { type Dispatch, useEffect } from 'react';
import { browserDraftStorage, draftKey, dropExpiredDrafts, loadDraft } from './draft';
import type { EntryAction, EntryState } from './entryState';
import type { EntryForm } from './types';

interface EntryLoader {
  memberId: string;
  typeId: string;
  state: EntryState;
  dispatch: Dispatch<EntryAction>;
  /** E25 for `state.date`; `fresh` is false while it is cached data or a refetch is under way. */
  data: EntryForm | undefined;
  fresh: boolean;
}

/**
 * Moves what the server and this device know about the picked date into the form, once per date: drops
 * drafts older than 7 days when a form opens (D13), then reads the saved assessment of that date (BR-REC-74)
 * and the draft kept for it (BR-REC-85). The reducer decides what to open or ask (`entryReducer` 'loaded').
 * Only fresh data counts: a cached answer from an earlier visit could miss an assessment saved since.
 */
export function useEntryLoader({
  memberId,
  typeId,
  state,
  dispatch,
  data,
  fresh,
}: EntryLoader): void {
  useEffect(() => {
    const storage = browserDraftStorage();
    if (storage) dropExpiredDrafts(storage, Date.now());
  }, []);

  const { date, loadedFor } = state;
  useEffect(() => {
    if (!data || !fresh || date === '' || loadedFor === date) return;
    const storage = browserDraftStorage();
    const draft = storage ? loadDraft(storage, draftKey(memberId, typeId, date), Date.now()) : null;
    dispatch({ type: 'loaded', date, metrics: data.metrics, existing: data.existing, draft });
  }, [data, fresh, date, loadedFor, memberId, typeId, dispatch]);
}
