'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';
import { SETUP_TEXT } from '@/lib/setup/text';

interface SheetFooterProps {
  /** The form in the sheet body: Save sits outside it (in the sheet's button row) and submits by id. */
  formId: string;
  saving: boolean;
  onCancel: () => void;
  /** Lets the sheet put focus back on Save after its confirmation step. */
  saveRef?: React.Ref<HTMLButtonElement>;
}

// [ Cancel ] [ Save ] (BR-REC-134): Save stays tappable until the call runs, then reads "Saving…" with a
// spinner. No Reset button. Listed Cancel first; ResponsiveSheet puts the action on top on phones.
export default function SheetFooter({ formId, saving, onCancel, saveRef }: SheetFooterProps) {
  return (
    <>
      <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
        {UI_TEXT.cancel}
      </Button>
      <Button ref={saveRef} type="submit" form={formId} disabled={saving}>
        {saving && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
        {saving ? UI_TEXT.saving : SETUP_TEXT.sheet.save}
      </Button>
    </>
  );
}
