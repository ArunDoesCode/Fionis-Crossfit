'use client';

import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  /** One plain sentence. Default "Couldn't load this." (BR-REC-131). */
  message?: string;
  onRetry?: () => void;
  className?: string;
}

// A part that fails to load shows this in its own place; the rest of the screen keeps working.
export default function ErrorState({
  message = UI_TEXT.loadError,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-4 text-danger',
        className,
      )}
    >
      <p className="text-base">{message}</p>
      {onRetry && (
        <Button variant="secondary" type="button" onClick={onRetry}>
          {UI_TEXT.tryAgain}
        </Button>
      )}
    </div>
  );
}
