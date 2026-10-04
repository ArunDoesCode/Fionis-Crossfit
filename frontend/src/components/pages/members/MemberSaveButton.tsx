'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useIsMutating } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';

interface MemberSaveButtonProps {
  /** The form it submits (the button sits in the page header / action bar, outside the form). */
  formId: string;
  /** "Add member" or "Save". */
  label: string;
  /** The key of the form's mutation (`memberMutationKeys`). */
  mutationKey: readonly unknown[];
}

// The screen's one main action (BR-REC-121). Always tappable except while saving: a tap with a problem
// still runs the check and jumps to the first one (BR-REC-134).
export default function MemberSaveButton({ formId, label, mutationKey }: MemberSaveButtonProps) {
  const saving = useIsMutating({ mutationKey }) > 0;

  return (
    <Button type="submit" form={formId} disabled={saving}>
      {saving && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
      {saving ? UI_TEXT.saving : label}
    </Button>
  );
}
