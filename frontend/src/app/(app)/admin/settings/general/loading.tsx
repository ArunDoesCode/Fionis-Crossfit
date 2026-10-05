import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { FormSkeleton } from '@/components/common/Skeletons';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="narrow">
      <PageHeader />
      <FormSkeleton fields={4} />
    </Page>
  );
}
