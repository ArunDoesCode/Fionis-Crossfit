import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import ProgressSkeleton from '@/components/pages/progress/ProgressSkeleton';
import { UI_TEXT } from '@/lib/messages/words';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="wide">
      <PageHeader title={UI_TEXT.screens.gymProgress} />
      <ProgressSkeleton />
    </Page>
  );
}
