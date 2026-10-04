'use client';

import type DueSheetComponent from '@/components/pages/due/DueSheet';
import { sheetLoader, useLazySheet } from '@/lib/members/useLazySheet';

// The row sheet (drawer, dialog, date field) only shows after a tap on a row's "⋯", so it is not part of
// Home, S3 or the member page (BR-REC-146, performance tactic 4). Every caller imports this file instead of
// `DueSheet`. Same pattern as `PeriodSheetLazy`: the sheet mounts when the first tap has loaded its code
// and then stays mounted (it opens a frame later so the first open animates; a failed load toasts and the
// next tap loads again; see `useLazySheet`). The "⋯" button calls `preloadDueSheet` on pointer-down and
// focus, so the code is on its way before the click lands. This is the only `import()` of the sheet.
const loadDueSheet = sheetLoader(() => import('@/components/pages/due/DueSheet'));

type DueSheetLazyProps = React.ComponentProps<typeof DueSheetComponent>;

/** Start loading the sheet's code (a no-op once loaded). Safe to call on every pointer-down or focus. */
export function preloadDueSheet() {
  // A failed preload is not an error: the tap loads it again (and says so if that fails too).
  loadDueSheet().catch(() => undefined);
}

export default function DueSheetLazy(props: DueSheetLazyProps) {
  const { Sheet, open } = useLazySheet(loadDueSheet, props.open, props.onOpenChange);
  if (!Sheet) return null;
  return <Sheet {...props} open={open} />;
}
