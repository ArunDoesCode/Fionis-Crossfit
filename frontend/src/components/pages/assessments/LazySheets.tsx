'use client';

import type { ComponentProps } from 'react';
import type CheckValuesSheetComponent from '@/components/pages/assessments/CheckValuesSheet';
import type ChooseAssessmentSheetComponent from '@/components/pages/assessments/ChooseAssessmentSheet';
import type LeaveDialogComponent from '@/components/pages/assessments/LeaveDialog';
import { sheetLoader, useLazySheet } from '@/lib/members/useLazySheet';

// None of these is needed for the first paint of Record assessment (BR-REC-146, performance tactic 4): the
// choose sheet only when no assessment is in the address, the check sheet only on a Save with an odd value,
// the leave question only after something is typed. Each is loaded on demand through `sheetLoader` (ONE
// `import()` site per sheet, a failed load is retried) and `useLazySheet` (mounted closed, opens a frame
// later so it animates, stays mounted so it can animate out). A failed load toasts and nothing opens.
const loadChoose = sheetLoader(
  () => import('@/components/pages/assessments/ChooseAssessmentSheet'),
);
const loadCheck = sheetLoader(() => import('@/components/pages/assessments/CheckValuesSheet'));
const loadLeave = sheetLoader(() => import('@/components/pages/assessments/LeaveDialog'));

/** Start loading the code of the two sheets a typing person may need (a no-op once loaded). */
export function preloadEntrySheets() {
  void loadCheck().catch(() => undefined);
  void loadLeave().catch(() => undefined);
}

export function ChooseAssessmentSheetLazy(
  props: ComponentProps<typeof ChooseAssessmentSheetComponent>,
) {
  const { Sheet, open } = useLazySheet(loadChoose, props.open, props.onOpenChange);
  return Sheet ? <Sheet {...props} open={open} /> : null;
}

export function CheckValuesSheetLazy(props: ComponentProps<typeof CheckValuesSheetComponent>) {
  const { Sheet, open } = useLazySheet(loadCheck, props.open, props.onOpenChange);
  return Sheet ? <Sheet {...props} open={open} /> : null;
}

export function LeaveDialogLazy(props: ComponentProps<typeof LeaveDialogComponent>) {
  const { Sheet, open } = useLazySheet(loadLeave, props.open, () => props.onStay());
  return Sheet ? <Sheet {...props} open={open} /> : null;
}
