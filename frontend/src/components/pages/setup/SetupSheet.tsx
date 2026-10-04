'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useRef } from 'react';
import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import SheetBody from '@/components/pages/setup/SheetBody';
import SheetFooter from '@/components/pages/setup/SheetFooter';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';

/** The question asked before saving (BR-REC-70, 71, 133): the sheet's second step. */
export interface SetupSheetConfirm {
  title: string;
  description: string;
  /** The verb on the button ("Change repeat"). */
  confirmLabel: string;
  /** True while saving: the button shows "Saving…" with a spinner and both buttons are off. */
  pending: boolean;
  /** Back to the form; every typed value is still there. */
  onCancel: () => void;
  onConfirm: () => void;
}

interface SetupSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The form's title ("Edit assessment"). */
  title: string;
  /** The id of the form in the body: Save sits outside it and submits by id. */
  formId: string;
  saving: boolean;
  /** The question to ask before saving, or `null` while the form is shown. */
  confirm: SetupSheetConfirm | null;
  /** The form. It stays in the sheet (hidden) while the question is shown, so nothing typed is lost. */
  children: React.ReactNode;
}

// The edit sheet of the setup screens: the form, and (when a change needs a question first) the question
// as a second step of the SAME sheet. One sheet means one Back entry (BR-REC-138): Back closes the whole
// sheet, and Cancel on the question returns to the form with every typed value kept. A second sheet on
// top would push a second Back entry (useBackToClose is not stack-aware). The footer's buttons are
// replaced between steps, so focus is moved on purpose: Cancel on the question (never the action, so a
// double tap on Save cannot confirm), Save again when back at the form.
export default function SetupSheet({
  open,
  onOpenChange,
  title,
  formId,
  saving,
  confirm,
  children,
}: SetupSheetProps) {
  const saveRef = useRef<HTMLButtonElement>(null);
  const asking = confirm !== null;
  const wasAsking = useRef(false);

  useEffect(() => {
    if (wasAsking.current && !asking) saveRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={confirm ? confirm.title : title}
      description={confirm?.description}
      footer={
        confirm ? (
          <ConfirmFooter confirm={confirm} />
        ) : (
          <SheetFooter
            formId={formId}
            saving={saving}
            onCancel={() => onOpenChange(false)}
            saveRef={saveRef}
          />
        )
      }
    >
      <SheetBody hidden={asking}>{children}</SheetBody>
    </ResponsiveSheet>
  );
}

// [ Cancel ] [ the action ] — the same pair as the old confirmation sheet, with the same "Saving…" state.
function ConfirmFooter({ confirm }: { confirm: SetupSheetConfirm }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <>
      <Button
        ref={cancelRef}
        type="button"
        variant="secondary"
        disabled={confirm.pending}
        onClick={confirm.onCancel}
      >
        {UI_TEXT.cancel}
      </Button>
      <Button type="button" disabled={confirm.pending} onClick={confirm.onConfirm}>
        {confirm.pending && (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
        )}
        {confirm.pending ? UI_TEXT.saving : confirm.confirmLabel}
      </Button>
    </>
  );
}
