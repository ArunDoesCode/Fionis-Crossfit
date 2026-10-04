import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import EditMemberLoader from '@/components/pages/members/EditMemberLoader';
import MemberSaveButton from '@/components/pages/members/MemberSaveButton';
import { memberMutationKeys } from '@/lib/api/members/queries';
import { UI_TEXT } from '@/lib/messages/words';

interface EditMemberViewProps {
  memberId: string;
}

const FORM_ID = 'edit-member-form';

// S8 Edit member (`/admin/members/[memberId]/edit`, 720 px wide): the Add form without the membership
// fields. The one main action is "Save". Archived members can be edited too (BR-REC-58).
export default function EditMemberView({ memberId }: EditMemberViewProps) {
  return (
    <Page width="narrow">
      <PageHeader
        title={UI_TEXT.screens.editMember}
        backHref={`/admin/members/${memberId}`}
        form
        action={
          <MemberSaveButton
            formId={FORM_ID}
            label="Save"
            mutationKey={memberMutationKeys.update(memberId)}
          />
        }
      />
      <EditMemberLoader memberId={memberId} formId={FORM_ID} />
    </Page>
  );
}
