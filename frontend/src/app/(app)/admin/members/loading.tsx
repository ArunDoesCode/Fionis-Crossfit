import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { RowSkeletons } from '@/components/common/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="wide">
      <PageHeader title={UI_TEXT.screens.members} />
      <Skeleton className="h-12 w-full rounded-4xl" />
      <Skeleton className="h-11 w-full rounded-full" />
      <RowSkeletons count={8} />
    </Page>
  );
}
