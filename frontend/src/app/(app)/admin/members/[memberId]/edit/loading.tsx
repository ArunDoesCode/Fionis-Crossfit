import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { FormSkeleton } from '@/components/common/Skeletons';
import { UI_TEXT } from '@/lib/messages/words';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="narrow">
      <PageHeader title={UI_TEXT.screens.editMember} backHref="/admin/members" />
      <FormSkeleton fields={6} />
    </Page>
  );
}
