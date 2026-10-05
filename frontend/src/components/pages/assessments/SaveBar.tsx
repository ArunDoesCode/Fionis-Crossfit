'use client';

import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { UI_TEXT } from '@/lib/messages/words';

interface SaveBarProps {
  /** The id of the `<form>`: the buttons sit in the page header, outside it. */
  formId: string;
  saving: boolean;
  /** "Save & next date" is the one saving. */
  savingNext: boolean;
}

// The screen's one main action (BR-REC-121): "Save" with "Save & next date" beside it (BR-REC-84). Both are
// submit buttons of the form, so Enter in a field saves; Save comes first in the page so it is the form's
// default button (Enter never means "next date"), and the row is reversed to show it on the right. Both stay
// tappable with problems (Save then jumps to the first one, BR-REC-189) and are off only while saving.
export default function SaveBar({ formId, saving, savingNext }: SaveBarProps) {
  const spinner = (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      className="animate-spin"
      aria-hidden="true"
    />
  );
  return (
    <div className="flex w-full flex-row-reverse gap-2 *:flex-1 lg:w-auto lg:*:flex-none">
      <Button type="submit" form={formId} disabled={saving}>
        {saving && !savingNext && spinner}
        {saving && !savingNext ? UI_TEXT.saving : ASSESSMENT_TEXT.save}
      </Button>
      <Button type="submit" form={formId} data-next="true" variant="secondary" disabled={saving}>
        {savingNext && spinner}
        {savingNext ? UI_TEXT.saving : ASSESSMENT_TEXT.saveNextDate}
      </Button>
    </div>
  );
}
