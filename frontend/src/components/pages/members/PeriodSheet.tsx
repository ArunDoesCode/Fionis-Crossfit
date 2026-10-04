'use client';

import { useIsMutating } from '@tanstack/react-query';
import { useId } from 'react';
import ErrorState from '@/components/common/ErrorState';
import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import { FormSkeleton } from '@/components/common/Skeletons';
import MemberSaveButton from '@/components/pages/members/MemberSaveButton';
import PeriodForm from '@/components/pages/members/PeriodForm';
import { Button } from '@/components/ui/button';
import { memberMutationKeys, useMember } from '@/lib/api/members/queries';
import type { MemberPeriod } from '@/lib/members/types';
import { UI_TEXT } from '@/lib/messages/words';

interface PeriodSheetProps {
  /** Whose membership; `null` until a list row is chosen. The member is read (E18) while the sheet is open. */
  memberId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The period to edit ("Edit membership"); none = "Renew membership". */
  period?: MemberPeriod;
}

// S9 (BR-REC-09, 54, 55, 58, 133, 138): a bottom sheet on phones, a centred dialog from 1024 px. It works on
// the member page and on the Memberships ending rows (Home, S4), where the member is loaded when the sheet
// opens: grey shapes first, "Couldn't load this." with Try again if that fails (BR-REC-129, 131).
export default function PeriodSheet({ memberId, open, onOpenChange, period }: PeriodSheetProps) {
  const formId = useId();
  const { data: member, isError, refetch } = useMember(memberId, open);
  const mutationKey = memberMutationKeys.period(memberId ?? '');
  const saving = useIsMutating({ mutationKey }) > 0;
  const editing = period !== undefined;

  let body: React.ReactNode;
  if (member) {
    body = (
      <PeriodForm
        key={period?.id ?? 'renew'}
        formId={formId}
        member={member}
        period={period}
        onDone={() => onOpenChange(false)}
      />
    );
  } else if (isError) {
    body = <ErrorState onRetry={() => void refetch()} />;
  } else {
    body = <FormSkeleton fields={2} />;
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit membership' : 'Renew membership'}
      description={member?.fullName}
      footer={
        member && (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {UI_TEXT.cancel}
            </Button>
            <MemberSaveButton
              formId={formId}
              label={editing ? 'Save' : 'Renew'}
              mutationKey={mutationKey}
            />
          </>
        )
      }
    >
      {body}
    </ResponsiveSheet>
  );
}
