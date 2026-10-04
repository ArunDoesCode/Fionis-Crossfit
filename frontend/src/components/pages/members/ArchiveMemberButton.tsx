'use client';

import { useState } from 'react';
import ConfirmSheet from '@/components/common/ConfirmSheet';
import { Button } from '@/components/ui/button';
import { useArchiveMember } from '@/lib/api/members/queries';
import { WORDS } from '@/lib/messages/words';

interface ArchiveMemberButtonProps {
  memberId: string;
  fullName: string;
}

// BR-REC-06, 58, 133: archiving is the one thing on the member page that asks first. They are hidden from
// search and Home, nothing is deleted, and Restore brings them back.
export default function ArchiveMemberButton({ memberId, fullName }: ArchiveMemberButtonProps) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useArchiveMember(memberId);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        {WORDS.archive}
      </Button>
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={`Archive ${fullName}?`}
        description="They'll be hidden from search and Home. You can restore them later."
        confirmLabel="Archive"
        destructive
        pending={isPending}
        onConfirm={() => mutate(undefined, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
