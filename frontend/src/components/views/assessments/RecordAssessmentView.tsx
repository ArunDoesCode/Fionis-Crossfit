import Page from '@/components/common/Page';
import EntryLoading from '@/components/pages/assessments/EntryLoading';
import RecordAssessment from '@/components/pages/assessments/RecordAssessment';
import AfterHydration from '@/components/pages/members/AfterHydration';

interface RecordAssessmentViewProps {
  memberId: string;
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
