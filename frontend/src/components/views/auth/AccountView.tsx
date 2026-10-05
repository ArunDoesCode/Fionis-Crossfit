'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useIsMutating } from '@tanstack/react-query';
import { useState } from 'react';
import ConfirmSheet from '@/components/common/ConfirmSheet';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import ChangePasswordForm from '@/components/pages/auth/ChangePasswordForm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authKeys, useMe, useSignOut, useSignOutAll } from '@/lib/api/auth/queries';
import { UI_TEXT } from '@/lib/messages/words';

const FORM_ID = 'change-password-form';
const SIGN_OUT_ALL = 'Sign out all devices';

// The screen's one main action (BR-REC-121). It sits in the page header / action bar, outside the form, so
// it submits by `form` id and reads "is the password being saved" from the mutation instead of a prop.
function ChangePasswordButton({ formId }: { formId: string }) {
  const saving = useIsMutating({ mutationKey: authKeys.changePassword() }) > 0;

  return (
    <Button type="submit" form={formId} disabled={saving}>
      {saving && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
      {saving ? UI_TEXT.saving : 'Change password'}
    </Button>
  );
}

// "Signed in as admin" (E05). Its own loading and error state: the rest of the screen keeps working (BR-REC-131).
function SignedInAs() {
  const { data, isLoading, isError, refetch } = useMe();

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div aria-busy="true" role="status" className="flex min-h-11 items-center">
        <span className="sr-only">{UI_TEXT.loading}</span>
        <Skeleton className="h-6 w-48" />
      </div>
    );
  }
  return (
    <p className="flex min-h-11 items-center text-base">
      <span>
        Signed in as <span className="font-semibold">{data.username}</span>
      </span>
    </p>
  );
}

// S17 sign-out buttons (BR-REC-35). "Sign out" asks nothing; "Sign out all devices" asks first because it
// cannot be undone from here (BR-REC-133). Both end by opening Login with the cache cleared (signOut.ts).
function SignOutSection() {
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

// S17 Settings → Account (`/admin/settings/account`), 720 px wide. The one main action is "Change password"
// (header on desktop, bar on phones, tabs hidden because this is a form: BR-REC-120, 121).
export default function AccountView() {
  return (
    <Page>
      <PageHeader form action={<ChangePasswordButton formId={FORM_ID} />} />
      <SignedInAs />
      <ChangePasswordForm formId={FORM_ID} />
      <SignOutSection />
    </Page>
  );
}
