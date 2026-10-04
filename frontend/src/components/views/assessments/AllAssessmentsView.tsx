import Page from '@/components/common/Page';
import AllAssessments from '@/components/pages/assessments/AllAssessments';

interface AllAssessmentsViewProps {
  memberId: string;
}

// S11 All assessments (`/admin/members/[memberId]/assessments`, 720 px wide, BR-REC-139). The filter and the
// assessment to open are in the address (`?type=`, `?open=`), read by the client leaf under the route's
// loading.tsx; the rows come from the browser's own requests.
export default function AllAssessmentsView({ memberId }: AllAssessmentsViewProps) {
  return (
    <Page width="narrow">
      <AllAssessments memberId={memberId} />
    </Page>
  );
}
