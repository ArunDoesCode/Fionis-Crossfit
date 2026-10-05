'use client';

import { useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import { ChooseAssessmentSheet } from '@/components/pages/lazySheets';
import { Button } from '@/components/ui/button';
import { useMemberDue } from '@/lib/api/assessments/queries';
import { isApiError } from '@/lib/api/errors';
import { useMember } from '@/lib/api/members/queries';
import { useAssessmentTypes } from '@/lib/api/setup/queries';
import { afterHistorySettles } from '@/lib/assessments/leave';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { useLeaveGuard } from '@/lib/assessments/useLeaveGuard';
import { messageForCode } from '@/lib/messages/errors';

interface ChooseGateProps {
  memberId: string;
  today: string;
  /** Called with the picked assessment once the sheet is out of the history. */
  onPick: (typeId: string) => void;
}

// `/assess` without `type`: the choose-assessment sheet opens over an empty page (BR-REC-73). Closing it
// without choosing leaves "Choose assessment" to open it again; the close arrow leaves the page.
export default function ChooseGate({ memberId, today, onPick }: ChooseGateProps) {
  const member = useMember(memberId);
  const types = useAssessmentTypes(false); // turned-on assessments only (D4)
  const due = useMemberDue(memberId);
  const [open, setOpen] = useState(true);
  const memberHref = `/admin/members/${memberId}` as const;
  useLeaveGuard(false, memberHref); // the close arrow goes back in the history, like after a Save (D12)
  const firstName = member.data?.fullName.trim().split(/\s+/)[0] ?? '';

  // The sheet keeps one extra history entry while it is open; picking must wait until it has been taken
  // off, else the address change would land on that entry and Back would reopen the sheet.
  const pick = (typeId: string) => {
    setOpen(false);
    afterHistorySettles(() => onPick(typeId));
  };

  const missing = isApiError(member.error) && member.error.status === 404;

  return (
    <>
      <PageHeader subtitle={member.data?.fullName} />
      {member.isError ? (
        <ErrorState
          message={missing ? messageForCode('NOT_FOUND') : undefined}
          onRetry={missing ? undefined : () => void member.refetch()}
        />
      ) : (
        <EmptyState
          title={ASSESSMENT_TEXT.choosePrompt}
          action={
            <Button type="button" onClick={() => setOpen(true)}>
              {ASSESSMENT_TEXT.chooseButton}
            </Button>
          }
        />
      )}
      {!member.isError && (
        <ChooseAssessmentSheet
          open={open}
          onOpenChange={setOpen}
          firstName={firstName}
          assessments={types.data?.map(({ id, name }) => ({ id, name }))}
          loadFailed={types.isError}
          onRetry={() => void types.refetch()}
          due={due.data}
          today={today}
          onPick={pick}
        />
      )}
    </>
  );
}
