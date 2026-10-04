'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useArchiveMember } from '@/lib/api/members/queries';
import { useEverOpened } from '@/lib/members/useEverOpened';
import { WORDS } from '@/lib/messages/words';

// The confirm sheet (drawer, dialog) only shows after a tap, so it loads on demand and not with the member
// page (BR-REC-146, performance tactic 4). The button starts the load on pointer-down and focus; the sheet
// is mounted on the first tap and then stays mounted for its exit animation.
const loadConfirmSheet = () => import('@/components/common/ConfirmSheet');
const ConfirmSheet = dynamic(loadConfirmSheet, { ssr: false });

function preloadConfirmSheet() {
  // A failed preload is not an error: the tap loads it again through `dynamic`.
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
  const mounted = useEverOpened(open);
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
      {mounted && (
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
      )}
    </>
  );
}
