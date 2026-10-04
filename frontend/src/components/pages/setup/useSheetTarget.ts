'use client';

import { useState } from 'react';

interface SheetState<Target> {
  /** A new key for every opening, so each opening starts a fresh form. */
  key: number;
  target: Target;
  open: boolean;
}

// Open/close state of an edit sheet and what it edits. The sheet stays mounted while it slides away
// (`open` false) and is remounted with a new key the next time, so its form always starts from the
// current values and never shows the previous opening's edits.
export function useSheetTarget<Target>() {
  const [state, setState] = useState<SheetState<Target> | null>(null);

  return {
    state,
    show: (target: Target) =>
      setState((current) => ({ key: (current?.key ?? 0) + 1, target, open: true })),
    onOpenChange: (open: boolean) => setState((current) => current && { ...current, open }),
  };
}
