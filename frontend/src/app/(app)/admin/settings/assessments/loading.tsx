import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { RowSkeletons } from '@/components/common/Skeletons';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="narrow">
      <PageHeader pattern="/admin/settings/assessments" />
      <RowSkeletons count={5} />
    </Page>
  );
}
