import { lazySheet } from '@/lib/members/useLazySheet';

// Every sheet that is not needed for a page's first paint (BR-REC-146, performance tactic 4) is loaded on
// demand here: ONE `import()` per sheet (a second site would make the bundler emit a second copy of the
// chunk), mounted closed after the first open so it animates, kept mounted so it can animate out, a failed
// load toasts and the next tap loads again (see `lazySheet`). `preload…` runs on pointer-down / focus / when
// the rows are on screen, so the code is on its way before the click lands.
export const { Lazy: PeriodSheet, preload: preloadPeriodSheet } = lazySheet(
  () => import('@/components/pages/members/PeriodSheet'),
);
export const { Lazy: DueSheet, preload: preloadDueSheet } = lazySheet(
  () => import('@/components/pages/due/DueSheet'),
);
export const { Lazy: AssessmentSheet, preload: preloadAssessmentSheet } = lazySheet(
  () => import('@/components/pages/assessments/AssessmentSheet'),
);
export const { Lazy: ChooseAssessmentSheet } = lazySheet(
  () => import('@/components/pages/assessments/ChooseAssessmentSheet'),
);
const check = lazySheet(() => import('@/components/pages/assessments/CheckValuesSheet'));
const leave = lazySheet(
  () => import('@/components/pages/assessments/LeaveDialog'),
  (props) => props.onStay(),
);
export const CheckValuesSheet = check.Lazy;
export const LeaveDialog = leave.Lazy;

/** Start loading the two sheets a typing person may need (a no-op once loaded). */
export function preloadEntrySheets() {
  check.preload();
  leave.preload();
}
