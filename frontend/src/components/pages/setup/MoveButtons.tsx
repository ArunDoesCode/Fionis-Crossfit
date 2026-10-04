'use client';

import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { SETUP_TEXT } from '@/lib/setup/text';

interface MoveButtonsProps {
  /** The row's name, so each button has its own spoken name ("Move up, Weight"). */
  name: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: 'up' | 'down') => void;
}

// BR-REC-67 "Move up / Move down": two icon buttons beside a row. 44 px hit areas with 8 px between them
// (BR-REC-122); off at the first and last place. Never inside the row's own link or button.
export default function MoveButtons({ name, canMoveUp, canMoveDown, onMove }: MoveButtonsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 pr-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        disabled={!canMoveUp}
        aria-label={`${SETUP_TEXT.assessments.moveUp}, ${name}`}
        onClick={() => onMove('up')}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        disabled={!canMoveDown}
        aria-label={`${SETUP_TEXT.assessments.moveDown}, ${name}`}
        onClick={() => onMove('down')}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-5" />
      </Button>
    </div>
  );
}
