'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { UI_TEXT } from '@/lib/messages/words';

interface SaveBarProps {
  saving: boolean;
  /** "Save & next date" is the one saving. */
  savingNext: boolean;
  onSave: (next: boolean) => void;
}

// The screen's one main action (BR-REC-121): "Save" with "Save & next date" beside it (BR-REC-84). Both stay
// tappable with problems (Save then jumps to the first one, BR-REC-134) and are off only while saving.
export default function SaveBar({ saving, savingNext, onSave }: SaveBarProps) {
  const spinner = (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      className="animate-spin"
      aria-hidden="true"
    />
  );
  return (
    <div className="flex w-full gap-2 *:flex-1 lg:w-auto lg:*:flex-none">
      <Button type="button" variant="secondary" disabled={saving} onClick={() => onSave(true)}>
        {savingNext && spinner}
        {savingNext ? UI_TEXT.saving : ASSESSMENT_TEXT.saveNextDate}
      </Button>
      <Button type="button" disabled={saving} onClick={() => onSave(false)}>
        {saving && !savingNext && spinner}
        {saving && !savingNext ? UI_TEXT.saving : ASSESSMENT_TEXT.save}
      </Button>
    </div>
  );
}
