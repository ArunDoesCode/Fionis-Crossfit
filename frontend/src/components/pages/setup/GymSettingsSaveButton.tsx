'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useIsMutating } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { setupMutationKeys } from '@/lib/api/setup/queries';
import { UI_TEXT } from '@/lib/messages/words';
import { SETUP_TEXT } from '@/lib/setup/text';

// S16's one main action (BR-REC-121). It sits in the page header / action bar, outside the form, so it
// submits by `form` id and reads "is it being saved" from the mutation. Off only while the call runs.
export default function GymSettingsSaveButton({ formId }: { formId: string }) {
  const saving = useIsMutating({ mutationKey: setupMutationKeys.updateSettings() }) > 0;

  return (
    <Button type="submit" form={formId} disabled={saving}>
      {saving && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
      {saving ? UI_TEXT.saving : SETUP_TEXT.general.save}
    </Button>
  );
}
