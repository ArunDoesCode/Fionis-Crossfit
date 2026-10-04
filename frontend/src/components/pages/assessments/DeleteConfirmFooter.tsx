'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { UI_TEXT } from '@/lib/messages/words';

interface DeleteConfirmFooterProps {
  /** True while deleting: the button shows "Deleting…" with a spinner and both buttons are off. */
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// A second tap of a quick double tap on Delete lands on the confirm button (same place on a phone, and it
// would delete before the sentence is read): taps in the first moments are ignored; nothing looks different.
const ARM_DELAY_MS = 300;

// [ Cancel ] [ Delete assessment ]: focus starts on Cancel, the safe button, so Enter cannot confirm.
export default function DeleteConfirmFooter({
  pending,
  onCancel,
  onConfirm,
}: DeleteConfirmFooterProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const armed = useRef(false);

  useEffect(() => {
    cancelRef.current?.focus();
    const timer = setTimeout(() => {
      armed.current = true;
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Button
        ref={cancelRef}
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={onCancel}
      >
        {UI_TEXT.cancel}
      </Button>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (armed.current) onConfirm();
        }}
      >
        {pending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
        {pending ? ASSESSMENT_TEXT.deleting : ASSESSMENT_TEXT.deleteConfirm}
      </Button>
    </>
  );
}
