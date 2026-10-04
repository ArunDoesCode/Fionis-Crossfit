'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useArchiveMember } from '@/lib/api/members/queries';
import { sheetLoader, useLazySheet } from '@/lib/members/useLazySheet';
import { WORDS } from '@/lib/messages/words';

// The confirm sheet (drawer, dialog) only shows after a tap, so it loads on demand and not with the member
// page (BR-REC-146, performance tactic 4). The button starts the load on pointer-down and focus; the sheet
// is mounted when the first tap has loaded it and then stays mounted for its exit animation (see
// `useLazySheet`: opens after the mount so the first open animates; a failed load toasts and the next tap
// loads again). This is the only `import()` of the sheet here.
const loadConfirmSheet = sheetLoader(() => import('@/components/common/ConfirmSheet'));

function preloadConfirmSheet() {
  // A failed preload is not an error: the tap loads it again (and says so if that fails too).
  loadConfirmSheet().catch(() => undefined);
}

interface ArchiveMemberButtonProps {
  memberId: string;
  fullName: string;
}

// BR-REC-06, 58, 133: archiving is the one thing on the member page that asks first. They are hidden from
// search and Home, nothing is deleted, and Restore brings them back.
export default function ArchiveMemberButton({ memberId, fullName }: ArchiveMemberButtonProps) {
  const [open, setOpen] = useState(false);
  const { Sheet, open: sheetOpen } = useLazySheet(loadConfirmSheet, open, setOpen);
  const { mutate, isPending } = useArchiveMember(memberId);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-fit"
        onPointerDown={preloadConfirmSheet}
        onFocus={preloadConfirmSheet}
        onClick={() => setOpen(true)}
      >
        {WORDS.archive}
      </Button>
      {Sheet && (
        <Sheet
          open={sheetOpen}
          onOpenChange={setOpen}
          title={`Archive ${fullName}?`}
          description="They'll be hidden from search and Home. You can restore them later."
          confirmLabel="Archive"
          destructive
          pending={isPending}
          onConfirm={() => mutate(undefined, { onSuccess: () => setOpen(false) })}
        />
      )}
    </>
  );
}
