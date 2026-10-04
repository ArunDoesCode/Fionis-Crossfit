'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { useRestoreMember } from '@/lib/api/members/queries';
import { UI_TEXT } from '@/lib/messages/words';

// BR-REC-58: the Restore button always works, whatever the membership says. No confirmation (BR-REC-133).
export default function RestoreMemberButton({ memberId }: { memberId: string }) {
  const { mutate, isPending } = useRestoreMember(memberId);

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      disabled={isPending}
      onClick={() => mutate()}
    >
      {isPending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
      {isPending ? UI_TEXT.saving : 'Restore'}
    </Button>
  );
}
