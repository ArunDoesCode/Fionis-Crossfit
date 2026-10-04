'use client';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';

interface LeaveDialogProps {
  open: boolean;
  /** [Stay], Escape or a tap outside: nothing is lost. */
  onStay: () => void;
  onLeave: () => void;
}

// "Leave without saving? Your entries stay as a draft." [Stay] [Leave] (BR-REC-90). Not a ResponsiveSheet on
// purpose: a sheet keeps its own history entry (`useBackToClose`), and this question is itself asked while
// the leave guard is working on the history, so it must not add one (the guard owns the browser's Back).
export default function LeaveDialog({ open, onStay, onLeave }: LeaveDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ASSESSMENT_TEXT.leaveTitle}</AlertDialogTitle>
          <AlertDialogDescription>{ASSESSMENT_TEXT.leaveBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="*:h-12">
          <Button type="button" variant="secondary" onClick={onStay}>
            {ASSESSMENT_TEXT.stay}
          </Button>
          <Button type="button" onClick={onLeave}>
            {ASSESSMENT_TEXT.leave}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
