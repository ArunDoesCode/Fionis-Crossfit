'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { useEverOpened } from '@/lib/members/useEverOpened';

// The Renew / Edit membership sheet (form, zod resolver, drawer, dialog) only shows after a tap, so it is
// not part of Home, the member page or S4 (BR-REC-146, performance tactic 4). Every caller imports this
// file instead of `PeriodSheet`. It is mounted on the first tap and then stays mounted, so the exit
// animation and the "which member" memory of `useRenewTarget` work as before. The trigger calls
// `preloadPeriodSheet` on pointer-down and focus, so the code is on its way before the click lands.
const loadPeriodSheet = () => import('@/components/pages/members/PeriodSheet');
const PeriodSheet = dynamic(loadPeriodSheet, { ssr: false });

type PeriodSheetLazyProps = ComponentProps<typeof PeriodSheet>;

/** Start loading the sheet's code (a no-op once loaded). Safe to call on every pointer-down or focus. */
export function preloadPeriodSheet() {
  // A failed preload is not an error: the tap loads it again through `dynamic`.
  loadPeriodSheet().catch(() => undefined);
}

export default function PeriodSheetLazy(props: PeriodSheetLazyProps) {
  const mounted = useEverOpened(props.open);
  if (!mounted) return null;
  return <PeriodSheet {...props} />;
}
