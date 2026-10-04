import PageHeader from '@/components/common/PageHeader';
import EntrySkeleton from '@/components/pages/assessments/EntrySkeleton';
import { UI_TEXT } from '@/lib/messages/words';

// Record assessment while it loads: the header and grey shapes in the real layout (BR-REC-129, 143). Used by
// the route's loading.tsx and as the fallback until the browser has taken over (the date starts as the
// device's day, so the real screen is drawn in the browser only, as Add member).
export default function EntryLoading() {
  return (
    <>
      <PageHeader title={UI_TEXT.screens.recordAssessment} backHref="/admin/members" />
      <EntrySkeleton />
    </>
  );
}
