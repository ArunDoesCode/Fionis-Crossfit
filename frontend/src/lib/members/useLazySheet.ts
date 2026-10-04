'use client';

import { type ComponentType, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const SHEET_LOAD_FAILED = "Couldn't load this. Try again.";

/**
 * The ONE loader of a sheet's code (a second `import()` site makes the bundler emit a second copy of the
 * chunk). Pass `() => import('…')`. Everyone shares one promise, so a preload on pointer-down and the tap
 * itself load it once. A failed load is not kept: the next call imports again (a rejected `React.lazy` /
 * `next/dynamic` would stay rejected until the page is reloaded).
 */
export function sheetLoader<P>(
  importSheet: () => Promise<{ default: ComponentType<P> }>,
): () => Promise<ComponentType<P>> {
  let pending: Promise<ComponentType<P>> | null = null;
  return () => {
    pending ??= importSheet().then(
      (module) => module.default,
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
}

/**
 * Mounts a sheet that is loaded on demand (BR-REC-146) and keeps it mounted, so it plays its exit animation
 * and keeps its content while closing. Pass the caller's own `open` state and what closes it.
 *
 * - `open` turns true → the code is loaded through `load` (see `sheetLoader`). A failed load shows a toast,
 *   calls `onOpenChange(false)` (nothing opens) and the next tap loads again.
 * - The sheet is mounted CLOSED, and its own `open` follows one frame later (and for good): Base UI skips
 *   the slide-up / fade when a sheet is mounted already open, so the first open would be abrupt (R-8).
 *
 * Render `Sheet` (when not null) with `open` from here, not the caller's own flag.
 */
export function useLazySheet<P>(
  load: () => Promise<ComponentType<P>>,
  open: boolean,
  onOpenChange: (open: boolean) => void,
): { Sheet: ComponentType<P> | null; open: boolean } {
  const [loaded, setLoaded] = useState<{ Sheet: ComponentType<P> } | null>(null);
  const [armed, setArmed] = useState(false);
  // `onOpenChange` is usually a new function on every render: it lives in a ref so it cannot restart the load.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open || loaded) return;
    let current = true;
    load().then(
      (Sheet) => {
        if (current) setLoaded({ Sheet });
      },
      () => {
        if (!current) return;
        toast.error(SHEET_LOAD_FAILED);
        onOpenChangeRef.current(false);
      },
    );
    return () => {
      current = false;
    };
  }, [open, loaded, load]);

  useEffect(() => {
    if (!loaded || armed) return;
    const frame = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(frame);
  }, [loaded, armed]);

  return { Sheet: loaded?.Sheet ?? null, open: open && armed };
}
