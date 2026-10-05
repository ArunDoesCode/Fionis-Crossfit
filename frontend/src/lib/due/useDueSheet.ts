'use client';

import { useCallback, useState } from 'react';
import type { DueTarget } from './target';

/**
 * Which row's sheet a list shows (one sheet for the whole list, not one per row), like `useRenewTarget`.
 * `target` stays after the sheet closes so it can finish closing with its content; `open` is what shows it.
 * `session` counts the opens: the sheet starts on its first step every time it is opened.
 */
export function useDueSheet() {
  const [state, setState] = useState<{ target: DueTarget | null; session: number }>({
    target: null,
    session: 0,
  });
  const [open, setOpen] = useState(false);
  const show = useCallback((target: DueTarget) => {
    setState((current) => ({ target, session: current.session + 1 }));
    setOpen(true);
  }, []);
  // `openTarget` is the row whose sheet is showing right now (null when closed): a row's "⋯" reads it for
  // `aria-expanded`, so the button never claims "open" for a sheet that has closed.
  return {
    target: state.target,
    openTarget: open ? state.target : null,
    session: state.session,
    open,
    show,
    onOpenChange: setOpen,
  };
}
