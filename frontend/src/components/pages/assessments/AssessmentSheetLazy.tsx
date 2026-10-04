'use client';

import type { ComponentProps } from 'react';
import type AssessmentSheetComponent from '@/components/pages/assessments/AssessmentSheet';
import { sheetLoader, useLazySheet } from '@/lib/members/useLazySheet';

// The assessment sheet is not needed for the first paint of All assessments (BR-REC-146, performance
// tactic 4): its code loads on demand through `sheetLoader` (ONE `import()` site, a failed load is retried)
// and `useLazySheet` (mounted closed, opens a frame later so it animates, stays mounted so it can animate
// out). A failed load toasts and nothing opens.
const loadAssessmentSheet = sheetLoader(
  () => import('@/components/pages/assessments/AssessmentSheet'),
);

/** Start loading the sheet's code once the rows are on screen (a no-op once loaded). */
export function preloadAssessmentSheet() {
  void loadAssessmentSheet().catch(() => undefined);
}

export default function AssessmentSheetLazy(
  props: ComponentProps<typeof AssessmentSheetComponent>,
) {
  const { Sheet, open } = useLazySheet(loadAssessmentSheet, props.open, props.onOpenChange);
  return Sheet ? <Sheet {...props} open={open} /> : null;
}
