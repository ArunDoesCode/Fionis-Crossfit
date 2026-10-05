import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { RowSkeletons } from '@/components/common/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143): the header, the repeat line
// and the measurement rows.
export default function Loading() {
  return (
    <Page width="narrow">
      <PageHeader pattern="/admin/settings/assessments/[typeId]" />
      <Skeleton className="h-6 w-48 max-w-full" />
      <RowSkeletons count={5} />
    </Page>
  );
}
