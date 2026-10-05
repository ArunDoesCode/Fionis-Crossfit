'use client';

import ConfirmSheet from '@/components/common/ConfirmSheet';
import { LEAVE_FORM_TEXT } from '@/lib/members/formFields';

interface UnsavedChangesSheetProps {
  open: boolean;
  /** [Stay], Escape, swipe-down or a tap outside: nothing is lost. */
  onStay: () => void;
  onLeave: () => void;
}

// "Leave without saving?" [Stay] [Leave] when Add / Edit member is left with typing that is not saved (#49).
// Back-to-close is off: the leave guard owns the browser's Back while this is asked.
export default function UnsavedChangesSheet({ open, onStay, onLeave }: UnsavedChangesSheetProps) {
  return (
    <ConfirmSheet
      open={open}
      onOpenChange={(next) => !next && onStay()}
      title={LEAVE_FORM_TEXT.title}
      description={LEAVE_FORM_TEXT.body}
      cancelLabel={LEAVE_FORM_TEXT.stay}
      confirmLabel={LEAVE_FORM_TEXT.leave}
      backToClose={false}
      onConfirm={onLeave}
    />
  );
}
