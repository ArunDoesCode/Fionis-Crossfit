'use client';

import { useState } from 'react';
import ConfirmSheet from '@/components/common/ConfirmSheet';
import { Button } from '@/components/ui/button';
import { useSignOut, useSignOutAll } from '@/lib/api/auth/queries';
import { UI_TEXT } from '@/lib/messages/words';

const SIGN_OUT_ALL = 'Sign out all devices';

// S17 sign-out buttons (BR-REC-35). "Sign out" asks nothing; "Sign out all devices" asks first because it
// cannot be undone from here (BR-REC-133). Both end by opening Login with the cache cleared (signOut.ts).
export default function SignOutSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const signOut = useSignOut();
  const signOutAll = useSignOutAll();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        className="h-12 w-full"
        disabled={signOut.isPending || signOut.isSuccess}
        onClick={() => signOut.mutate()}
      >
        {UI_TEXT.signOut}
      </Button>
      <Button
        type="button"
        variant="destructive"
        className="h-12 w-full"
        onClick={() => setConfirmOpen(true)}
      >
        {SIGN_OUT_ALL}
      </Button>
      <p className="text-sm text-muted-foreground">
        Use this if a phone is lost or a trainer leaves.
      </p>
      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${SIGN_OUT_ALL}?`}
        description="Everyone using this login, including this device, will have to sign in again."
        confirmLabel={SIGN_OUT_ALL}
        destructive
        pending={signOutAll.isPending || signOutAll.isSuccess}
        onConfirm={() => signOutAll.mutate()}
      />
    </div>
  );
}
