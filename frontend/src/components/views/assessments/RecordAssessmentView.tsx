'use client';

import dynamic from 'next/dynamic';
import { useQueryStates } from 'nuqs';
import Page from '@/components/common/Page';
import EntryLoading from '@/components/pages/assessments/EntryLoading';
import EntryScreen from '@/components/pages/assessments/EntryScreen';
import AfterHydration from '@/components/pages/members/AfterHydration';
import { dateFromParam, entryParams, typeFromParam } from '@/lib/assessments/entryParams';
import { useToday } from '@/lib/members/useToday';

interface RecordAssessmentViewProps {
  memberId: string;
}

// Only `/assess` without `type` shows it, and it brings the member and assessment-list reads: loaded when
// needed, so the form itself stays light (BR-REC-146). The browser draws this screen only, so no server pass.
const ChooseGate = dynamic(() => import('@/components/pages/assessments/ChooseGate'), {
  ssr: false,
  loading: () => <EntryLoading />,
});

// Its content (`/admin/members/[memberId]/assess?type=&date=`: with an assessment in the address the form, without
// one the choose-assessment sheet (BR-REC-73). Drawn in the browser only (see the View): the date defaults
// to the device's day. The form is re-keyed when the member or the assessment changes.
function RecordAssessment({ memberId }: RecordAssessmentViewProps) {
  const [{ type, date }, setParams] = useQueryStates(entryParams);
  const today = useToday();
  const typeId = typeFromParam(type);

  if (typeId === null) {
    return (
      <ChooseGate
        memberId={memberId}
        today={today}
        onPick={(picked) => void setParams({ type: picked })}
      />
    );
  }
  return (
    <EntryScreen
      key={`${memberId}:${typeId}`}
      memberId={memberId}
      typeId={typeId}
      initialDate={dateFromParam(date, today)}
      today={today}
    />
  );
}

// S10 Record assessment (`/admin/members/[memberId]/assess`, wide form, BR-REC-182). The screen starts with
// "date = today" (the device's day, which the server cannot know), so it is drawn in the browser only; the
// server and the first paint show the same grey shapes as the route's loading.tsx.
export default function RecordAssessmentView({ memberId }: RecordAssessmentViewProps) {
  return (
    <Page width="wide">
      <AfterHydration fallback={<EntryLoading />}>
        <RecordAssessment memberId={memberId} />
      </AfterHydration>
    </Page>
  );
}
