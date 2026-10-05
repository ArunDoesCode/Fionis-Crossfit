import { Alert02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Change } from '@/lib/assessments/change';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { cn } from '@/lib/utils';

const ARROWS = { up: '▲', down: '▼' } as const;

/** The live change next to a field: "▼ −1.5 kg better" (BR-REC-81). Never colour alone: arrow + words. */
export function ChangeLine({ change }: { change: Change }) {
  const tone =
    change.verdict === 'better'
      ? 'text-success'
      : change.verdict === 'worse'
        ? 'text-warning'
        : undefined;
  return (
    <span className={cn('inline-flex items-center gap-1', tone)}>
      {change.arrow !== 'none' && (
        <>
          <span aria-hidden="true">{ARROWS[change.arrow]}</span>
          <span className="sr-only">
            {change.arrow === 'up' ? ASSESSMENT_TEXT.up : ASSESSMENT_TEXT.down}
          </span>
        </>
      )}
      <span>{change.amount}</span>
      {change.verdict && <span>{change.verdict}</span>}
    </span>
  );
}

/** An emptied saved field says so until Save (BR-REC-77). */
export function RemovedNote() {
  return <span className="text-warning">{ASSESSMENT_TEXT.willBeRemoved}</span>;
}

/**
 * "Please check — last time 8" in the line under a field (BR-REC-21, 82): amber, with an icon and words, never
 * an error. It takes the place of the "Last …" line inside the field's own height, so it never moves the form;
 * a field has a warning only when it has a readable value, so it never shares the line with a number error.
 */
export function WarningLine({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm text-warning">
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        aria-hidden="true"
        className="size-4 shrink-0"
      />
      {text}
    </p>
  );
}
