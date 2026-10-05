import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { FormSkeleton } from '@/components/common/Skeletons';
import AddMemberForm from '@/components/pages/members/AddMemberForm';
import AfterHydration from '@/components/pages/members/AfterHydration';
import MemberSaveButton from '@/components/pages/members/MemberSaveButton';
import { memberMutationKeys } from '@/lib/api/members/queries';
import { UI_TEXT } from '@/lib/messages/words';

const FORM_ID = 'add-member-form';

// S6 Add member (`/admin/members/new`, 720 px wide). The one main action is "Add member" (header on
// desktop, bar on phones with the tabs hidden because this is a form: BR-REC-120, 121).
export default function AddMemberView() {
  return (
    <Page width="narrow">
      <PageHeader
        form
        action={
          <MemberSaveButton
            formId={FORM_ID}
            label={UI_TEXT.screens.addMember}
            mutationKey={memberMutationKeys.create()}
          />
        }
      />
      <AfterHydration fallback={<FormSkeleton fields={7} />}>
        <AddMemberForm formId={FORM_ID} />
      </AfterHydration>
    </Page>
  );
}
