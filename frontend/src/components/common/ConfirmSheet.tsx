'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';

interface ConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is about to happen, as a question or a plain statement ("Archive Surya?"). */
  title: string;
  /** What it means, in one plain sentence ("He will no longer show on Home or in search."). */
  description?: string;
  /** The verb on the button ("Archive", "Delete assessment"). Never "OK" or "Yes". */
  confirmLabel: string;
  /** Red button: for archive, delete, sign out everywhere, hard-to-undo changes (BR-REC-133). */
  destructive?: boolean;
  /** True while saving: the button shows "Saving…" with a spinner and both buttons are off. */
  pending?: boolean;
  /** The cancel button's text. Default "Cancel". */
  cancelLabel?: string;
  /** Back closes the sheet. Default true; off when the caller already owns the history. */
  backToClose?: boolean;
  onConfirm: () => void;
}

// Only destructive or hard-to-undo actions ask for confirmation (BR-REC-133): renew, assess and the like never do.
export default function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending = false,
  cancelLabel = UI_TEXT.cancel,
  backToClose = true,
  onConfirm,
}: ConfirmSheetProps) {
  return (
    <ResponsiveSheet
      alert
      backToClose={backToClose}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && (
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
            )}
            {pending ? UI_TEXT.saving : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
