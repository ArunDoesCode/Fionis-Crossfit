'use client';

import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import { Button } from '@/components/ui/button';
import type { FlaggedField } from '@/lib/assessments/fieldView';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';

interface CheckValuesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every value that looks odd, one line each (BR-REC-82). */
  lines: FlaggedField[];
  onGoBack: () => void;
  onSaveAnyway: () => void;
}

// One sheet for all of them: "Check these values" · Visceral fat 17.5 (last time 8) · [Go back] [Save anyway].
// The server never blocks these values (BR-REC-21). The list scrolls inside the sheet: on desktop the
// dialog does not (shared issue #18).
export default function CheckValuesSheet({
  open,
  onOpenChange,
  lines,
  onGoBack,
  onSaveAnyway,
}: CheckValuesSheetProps) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={ASSESSMENT_TEXT.checkValuesTitle}
      description={ASSESSMENT_TEXT.checkValuesBody}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onGoBack}>
            {ASSESSMENT_TEXT.goBack}
          </Button>
          <Button type="button" onClick={onSaveAnyway}>
            {ASSESSMENT_TEXT.saveAnyway}
          </Button>
        </>
      }
    >
      <ul className="flex max-h-[min(50dvh,24rem)] flex-col gap-2 overflow-y-auto">
        {lines.map((line) => (
          <li key={line.metricId} className="text-base">
            {line.line}
          </li>
        ))}
      </ul>
    </ResponsiveSheet>
  );
}
