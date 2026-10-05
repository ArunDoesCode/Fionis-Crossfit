import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import AllAssessmentsSkeleton from '@/components/pages/assessments/AllAssessmentsSkeleton';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143): the header, the filter chips and
// the rows.
export default function Loading() {
  return (
    <Page width="narrow">
      <PageHeader pattern="/admin/members/[memberId]/assessments" />
      <AllAssessmentsSkeleton />
    </Page>
  );
}
