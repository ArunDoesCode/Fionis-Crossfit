'use client';

import { MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { preloadDueSheet } from '@/components/pages/lazySheets';
import { Button } from '@/components/ui/button';
import { DUE_TEXT } from '@/lib/due/text';

interface DueMoreButtonProps {
  /** What the row is about ("Surya Pratap"): the spoken name is "More for Surya Pratap" (BR-REC-137). */
  name: string;
  onOpen: () => void;
}

// The "⋯" beside a due row (BR-REC-102, 122): an icon button with a 44 px hit area, never inside the row's
// own link. A touch starts loading the sheet's code before the click lands.
export default function DueMoreButton({ name, onOpen }: DueMoreButtonProps) {
  return (
    <div className="flex shrink-0 items-center pr-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={DUE_TEXT.moreFor(name)}
        onPointerDown={preloadDueSheet}
        onFocus={preloadDueSheet}
        onClick={onOpen}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="size-5" />
      </Button>
    </div>
  );
}
