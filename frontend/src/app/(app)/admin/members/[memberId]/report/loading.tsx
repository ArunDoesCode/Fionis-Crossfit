import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import ReportSkeleton from '@/components/pages/progress/ReportSkeleton';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="wide">
      <PageHeader />
      <ReportSkeleton />
    </Page>
  );
}
