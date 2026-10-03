'use client';

import { Logout01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/lib/api/auth/queries';
import { UI_TEXT } from '@/lib/messages/words';

// Side bar "Sign out" (BR-REC-120, 35): ends this device's sign-in (E03), clears the cache and opens Login.
// Off while the call runs, so a second tap cannot send it twice.
export default function SignOutButton() {
  const { mutate, isPending, isSuccess } = useSignOut();

  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start gap-3 px-4"
      disabled={isPending || isSuccess}
      onClick={() => mutate()}
    >
      <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-6" />
      {UI_TEXT.signOut}
    </Button>
  );
}
