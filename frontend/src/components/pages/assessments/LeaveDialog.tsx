'use client';

import ConfirmSheet from '@/components/common/ConfirmSheet';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';

interface LeaveDialogProps {
  open: boolean;
  /** [Stay], Escape, swipe-down or a tap outside: nothing is lost. */
  onStay: () => void;
  onLeave: () => void;
}

// "Leave without saving? Your entries stay as a draft." [Stay] [Leave] (BR-REC-90). Back-to-close is off on
// purpose: this question is itself asked while the leave guard is working on the history, so it must not
// add an entry (the guard owns the browser's Back).
export default function LeaveDialog({ open, onStay, onLeave }: LeaveDialogProps) {
  return (
    <ConfirmSheet
      open={open}
      onOpenChange={(next) => !next && onStay()}
      title={ASSESSMENT_TEXT.leaveTitle}
      description={ASSESSMENT_TEXT.leaveBody}
      cancelLabel={ASSESSMENT_TEXT.stay}
      confirmLabel={ASSESSMENT_TEXT.leave}
      backToClose={false}
      onConfirm={onLeave}
    />
  );
}
