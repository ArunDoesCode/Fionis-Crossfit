'use client';

import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { FormSkeleton } from '@/components/common/Skeletons';
import EditMemberForm from '@/components/pages/members/EditMemberForm';
import MemberSaveButton from '@/components/pages/members/MemberSaveButton';
import { memberMutationKeys, useMember } from '@/lib/api/members/queries';

interface EditMemberViewProps {
  memberId: string;
}

const FORM_ID = 'edit-member-form';

// Loads the member for S8: grey shapes of the form while it loads, "Couldn't load this." with Try again
// when it fails (BR-REC-129, 131). The form itself starts only once the member is here.
function EditMemberLoader({ memberId, formId }: { memberId: string; formId: string }) {
  const { data: member, isError, refetch } = useMember(memberId);

  if (member) return <EditMemberForm formId={formId} member={member} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  return <FormSkeleton fields={6} />;
}

// S8 Edit member (`/admin/members/[memberId]/edit`, 720 px wide): the Add form without the membership
// fields. The one main action is "Save". Archived members can be edited too (BR-REC-58).
export default function EditMemberView({ memberId }: EditMemberViewProps) {
  return (
    <Page>
      <PageHeader
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
