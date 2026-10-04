'use client';

import { useEffect } from 'react';
import { browserDraftStorage, saveDraft } from './draft';
import type { Inputs } from './types';

interface DraftAutosave {
  /** `draftKey(member, assessment, date)`, or null while there is no date. */
  key: string | null;
  /** Off while a draft is still being offered (writing now would erase it) or the date's data is loading. */
  active: boolean;
  isEstimated: boolean;
  inputs: Inputs;
}

/**
 * Keeps what is typed on this device after every change (BR-REC-85, D13): a locked phone or a closed tab
 * loses nothing. A write is a few hundred bytes, so there is no delay to lose a last key to. When every box
 * is empty the draft is removed instead; blocked storage means no drafts and the form works as before.
 */
export function useDraftAutosave({ key, active, isEstimated, inputs }: DraftAutosave): void {
  useEffect(() => {
    if (!active || key === null) return;
    const storage = browserDraftStorage();
    if (storage) saveDraft(storage, key, { savedAt: Date.now(), isEstimated, values: inputs });
  }, [key, active, isEstimated, inputs]);
}
