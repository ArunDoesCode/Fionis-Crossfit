'use client';

import ErrorState from '@/components/common/ErrorState';
import { FormSkeleton } from '@/components/common/Skeletons';
import EditMemberForm from '@/components/pages/members/EditMemberForm';
import { useMember } from '@/lib/api/members/queries';

interface EditMemberLoaderProps {
  memberId: string;
  formId: string;
}

// Loads the member for S8: grey shapes of the form while it loads, "Couldn't load this." with Try again
// when it fails (BR-REC-129, 131). The form itself starts only once the member is here.
export default function EditMemberLoader({ memberId, formId }: EditMemberLoaderProps) {
  const { data: member, isError, refetch } = useMember(memberId);

  if (member) return <EditMemberForm formId={formId} member={member} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  return <FormSkeleton fields={6} />;
}
