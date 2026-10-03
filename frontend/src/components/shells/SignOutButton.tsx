'use client';

import { Logout01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';

// Inert until auth lands (Stream A replaces this file: it calls E03 logout, clears the cache and goes to
// /login). Until then the button is drawn but off, so nobody taps something that does nothing.
export default function SignOutButton() {
  return (
    <Button type="button" variant="ghost" className="w-full justify-start gap-3 px-4" disabled>
      <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-6" />
      {UI_TEXT.signOut}
    </Button>
  );
}
