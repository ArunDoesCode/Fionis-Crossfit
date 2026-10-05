'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { draftTimeLabel } from '@/lib/assessments/draft';
import type { Offer } from '@/lib/assessments/entryValues';
import { assessmentDateLabel } from '@/lib/assessments/labels';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { UI_TEXT } from '@/lib/messages/words';

interface OfferNoticeProps {
  offer: Offer;
  /** The picked date, for the "already saved on…" question. */
  date: string;
  today: string;
  onAnswer: (answer: 'restore' | 'discard' | 'open' | 'keep') => void;
}

// The two questions the form asks before it changes what is typed: "Restore unsaved results from 10:42?"
// (BR-REC-85) and "Open the saved one?" (BR-REC-74). A question in the page, not a sheet: the form behind it
// stays usable and the phone's Back button keeps its one meaning.
export function OfferNotice({ offer, date, today, onAnswer }: OfferNoticeProps) {
  const [now] = useState(() => Date.now());
  const draft = offer.kind === 'draft';
  const question = draft
    ? ASSESSMENT_TEXT.restoreQuestion(draftTimeLabel(offer.draft.savedAt, now))
    : ASSESSMENT_TEXT.savedQuestion(assessmentDateLabel(date, offer.existing.isEstimated, today));
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border bg-muted p-4">
      <p className="text-base">{question}</p>
      <div className="flex gap-2 *:flex-1">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onAnswer(draft ? 'discard' : 'keep')}
        >
          {draft ? ASSESSMENT_TEXT.discard : ASSESSMENT_TEXT.keepMine}
        </Button>
        <Button type="button" onClick={() => onAnswer(draft ? 'restore' : 'open')}>
          {draft ? ASSESSMENT_TEXT.restore : ASSESSMENT_TEXT.open}
        </Button>
      </div>
    </div>
  );
}

/**
 * The sentence next to the Save bar: "Enter at least one value" (BR-REC-78), "Not saved — check the
 * connection and tap Save again" (BR-REC-86), a refusal of the server (BR-REC-128). It sits at the end of
 * the form, above the bar, and scrolls into view when it appears.
 */
export function StatusLine({ text }: { text: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!text) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [text]);
  return (
    <p
      ref={ref}
      role="alert"
      className="scroll-mb-28 min-h-5 text-base font-medium text-destructive"
    >
      {text}
    </p>
  );
}

/**
 * Save with nothing entered (BR-REC-78, 190): a top alert, never a dead button. A new `tick` mounts a new
 * element, so a screen reader reads it again on every click; the cursor goes to the first measurement.
 */
export function NeedOneValue({ tick }: { tick: number }) {
  if (tick === 0) return null;
  return (
    <p
      key={tick}
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-base font-medium text-destructive"
    >
      {UI_TEXT.needOneValue}
    </p>
  );
}
