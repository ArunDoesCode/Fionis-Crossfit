import type { Viewport } from 'next';
import RecordAssessmentView from '@/components/views/assessments/RecordAssessmentView';

// BR-REC-91: Save stays visible above the keyboard. Where the browser supports it (Chrome on Android) the
// keyboard shrinks the layout, so the fixed bar sits right above it; other browsers keep the default.
export const viewport: Viewport = { interactiveWidget: 'resizes-content' };

// S10. The id is runtime data: the route's loading.tsx is the boundary while it resolves; `?type=` and
// `?date=` are read by the client leaf (nuqs), so the page itself stays static around it.
export default async function RecordAssessmentPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <RecordAssessmentView memberId={memberId} />;
}
