'use client';

import type { ComponentProps } from 'react';
import type PeriodSheetComponent from '@/components/pages/members/PeriodSheet';
import { sheetLoader, useLazySheet } from '@/lib/members/useLazySheet';

// The Renew / Edit membership sheet (form, zod resolver, drawer, dialog) only shows after a tap, so it is
// not part of Home, the member page or S4 (BR-REC-146, performance tactic 4). Every caller imports this
// file instead of `PeriodSheet`. It is mounted when the first tap has loaded the code and then stays
// mounted, so the exit animation and the "which member" memory of `useRenewTarget` work as before; see
// `useLazySheet` (opens after the mount so the first open animates, a failed load toasts and the next tap
// loads again). The trigger calls `preloadPeriodSheet` on pointer-down and focus, so the code is on its
// way before the click lands. This is the only `import()` of the sheet.
const loadPeriodSheet = sheetLoader(() => import('@/components/pages/members/PeriodSheet'));

type PeriodSheetLazyProps = ComponentProps<typeof PeriodSheetComponent>;

/** Start loading the sheet's code (a no-op once loaded). Safe to call on every pointer-down or focus. */
export function preloadPeriodSheet() {
  // A failed preload is not an error: the tap loads it again (and says so if that fails too).
  loadPeriodSheet().catch(() => undefined);
}

export default function PeriodSheetLazy(props: PeriodSheetLazyProps) {
  const { Sheet, open } = useLazySheet(loadPeriodSheet, props.open, props.onOpenChange);
  if (!Sheet) return null;
  return <Sheet {...props} open={open} />;
}
