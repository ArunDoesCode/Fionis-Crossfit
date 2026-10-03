'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useIsMutating } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { authKeys } from '@/lib/api/auth/queries';
import { UI_TEXT } from '@/lib/messages/words';

// The screen's one main action (BR-REC-121). It sits in the page header / action bar, outside the form, so
// it submits by `form` id and reads "is the password being saved" from the mutation instead of a prop.
export default function ChangePasswordButton({ formId }: { formId: string }) {
  const saving = useIsMutating({ mutationKey: authKeys.changePassword() }) > 0;

  return (
    <Button type="submit" form={formId} disabled={saving}>
      {saving && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
      {saving ? UI_TEXT.saving : 'Change password'}
    </Button>
  );
}
