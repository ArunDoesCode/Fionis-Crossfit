'use client';

import { useEffect, useRef } from 'react';
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

/** At most one write per this many ms while typing (BR-REC-211); `pagehide` writes the last state at once. */
const AUTOSAVE_THROTTLE_MS = 300;

/**
 * Keeps what is typed on this device (BR-REC-85, D13): a locked phone or a closed tab loses nothing.
 * A write is delayed up to 300 ms and flushed on `pagehide`, so the last key is never lost. When every box
 * is empty the draft is removed instead; blocked storage means no drafts and the form works as before.
 */
export function useDraftAutosave({ key, active, isEstimated, inputs }: DraftAutosave): void {
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || key === null) return;
    const storage = browserDraftStorage();
    if (!storage) return;
    const write = () => {
      pending.current = null;
      saveDraft(storage, key, { savedAt: Date.now(), isEstimated, values: inputs });
    };
    pending.current = write;
    const timer = setTimeout(write, AUTOSAVE_THROTTLE_MS);
    return () => clearTimeout(timer);
  }, [key, active, isEstimated, inputs]);

  useEffect(() => {
    const flush = () => pending.current?.();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush(); // leaving the screen (or changing key) keeps the last edit
    };
  }, []);
}
