import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { RowSkeletons } from '@/components/common/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page>
      <PageHeader pattern="/admin/memberships" />
      <Skeleton className="h-12 w-full rounded-4xl" />
      <RowSkeletons count={8} />
    </Page>
  );
}
