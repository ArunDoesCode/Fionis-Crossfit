'use client';

import { MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';
import { preloadDueSheet } from '@/components/pages/lazySheets';
import { Button } from '@/components/ui/button';
import { DUE_TEXT } from '@/lib/due/text';

interface DueMoreButtonProps {
  /** What the row is about ("Surya Pratap"): the spoken name is "More for Surya Pratap" (BR-REC-137). */
  name: string;
  onOpen: () => void;
}

// The "⋯" beside a due row (BR-REC-102, 122): an icon button with a 44 px hit area, never inside the row's
// own link. A touch starts loading the sheet's code before the click lands. BR-REC-234: it announces the
// sheet it opens (`aria-haspopup`) and whether it is open (`aria-expanded`): the click opens it, and focus
// can only come back to this button after the sheet has closed.
export default function DueMoreButton({ name, onOpen }: DueMoreButtonProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex shrink-0 items-center pr-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={DUE_TEXT.moreFor(name)}
        onPointerDown={preloadDueSheet}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onFocus={() => {
          preloadDueSheet();
          setExpanded(false);
        }}
        onClick={() => {
          setExpanded(true);
          onOpen();
        }}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="size-5" />
      </Button>
    </div>
  );
}
