'use client';

import { useState } from 'react';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { durationFromParts, durationToParts, parseDuration } from '@/lib/domain/duration';
import { type DurationStatus, durationStatus } from '@/lib/durationStatus';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface DurationFieldProps {
  id: string;
  label: string;
  required?: boolean;
  /** Total seconds, or `null` while empty or not a valid time. */
  value: number | null;
  /** `seconds` is `null` for both empty and invalid; `status` tells them apart (the typed boxes are kept). */
  onChange: (seconds: number | null, status: DurationStatus) => void;
  onBlur?: () => void;
  /** Same two lines as NumberField: last value (left) and live change (right), mono font. */
  previous?: React.ReactNode;
  change?: React.ReactNode;
  /** Replaces the field's own "Enter seconds from 0 to 59" / "Enter minutes from 0 to 599" line. */
  error?: string;
  /** Key label of the seconds box on the phone keyboard (the minutes box always says "next", BR-REC-91). */
  enterKeyHint?: 'next' | 'done';
  className?: string;
}

const digits = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

function toTexts(seconds: number | null): { minText: string; secText: string } {
  if (seconds === null) return { minText: '', secText: '' };
  const { minutes, seconds: rest } = durationToParts(seconds);
  return { minText: String(minutes), secText: String(rest).padStart(2, '0') };
}

// A whole time arriving in one go ("2:02", "1:05:30"; pasted, autofilled or typed as one change) split
// over both boxes (BR-REC-75). Out-of-range "m:ss" such as "2:75" still fills both so the screen shows
// its seconds error; anything else with a ":" gives null and is ignored (never read as one long number).
function splitWholeTime(raw: string): { minText: string; secText: string } | null {
  const text = raw.trim();
  const seconds = parseDuration(text);
  if (seconds !== null) return toTexts(seconds);
  const parts = /^(\d{1,3}):(\d{1,2})$/.exec(text);
  return parts ? { minText: parts[1] ?? '', secText: parts[2] ?? '' } : null;
}

// "Time (min:sec)" typed in two boxes, minutes and seconds, each with the number keypad (BR-REC-75).
// Blank seconds count as 0; seconds above 59 or minutes above 599 give `null` with status "invalid", the typed
// boxes stay, and the field says what is wrong itself unless the screen passes its own `error`.
export default function DurationField({
  id,
  label,
  required,
  value,
  onChange,
  onBlur,
  previous,
  change,
  error: errorProp,
  enterKeyHint = 'next',
  className,
}: DurationFieldProps) {
  const [texts, setTexts] = useState(() => toTexts(value));
  const [emitted, setEmitted] = useState<number | null>(value);

  // A value that did not come from our own typing (form reset, loaded data) replaces the boxes.
  if (value !== emitted) {
    setEmitted(value);
    setTexts(toTexts(value));
  }

  function update(next: { minText: string; secText: string }) {
    setTexts(next);
    const status = durationStatus(next.minText, next.secText);
    const seconds =
      status === 'valid'
        ? durationFromParts(Number(next.minText || '0'), Number(next.secText || '0'))
        : null;
    setEmitted(seconds);
    onChange(seconds, status);
  }

  // True when `raw` held a whole time and both boxes were filled from it.
  function fillBoth(raw: string): boolean {
    const both = splitWholeTime(raw);
    if (both) update(both);
    return both !== null;
  }

  function handleChange(part: 'min' | 'sec', max: number, raw: string) {
    if (raw.includes(':')) {
      // A ":" typed right after the minutes means "now the seconds": keep the minutes, move on.
      if (!fillBoth(raw) && part === 'min' && /^\d{0,3}:$/.test(raw)) {
        update({ minText: digits(raw, max), secText: texts.secText });
        document.getElementById(`${id}-sec`)?.focus();
      }
      return;
    }
    update(
      part === 'min'
        ? { minText: digits(raw, max), secText: texts.secText }
        : { minText: texts.minText, secText: digits(raw, max) },
    );
  }

  // Two digits of seconds or three of minutes are the most a box takes, so an invalid time never gets fixed
  // by typing more: the line can show at once.
  const ownError =
    durationStatus(texts.minText, texts.secText) === 'invalid'
      ? durationFromParts(Number(texts.minText || '0'), 0) === null
        ? UI_TEXT.minutesRange
        : UI_TEXT.secondsRange
      : undefined;
  const error = errorProp ?? ownError;
  const metaId = `${id}-meta`;
  const errorId = `${id}-error`;
  const hasMeta = previous !== undefined || change !== undefined;
  const describedBy = [hasMeta ? metaId : null, error ? errorId : null].filter(Boolean).join(' ');
  const legendId = `${id}-legend`;

  return (
    <FieldSet className={cn('gap-2', className)}>
      <FieldLegend id={legendId} variant="label" className="mb-0">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </FieldLegend>
      <div className="flex items-center gap-3">
        {(
          [
            { part: 'min', unit: UI_TEXT.minutes, text: texts.minText, max: 3, hint: 'next' },
            { part: 'sec', unit: UI_TEXT.seconds, text: texts.secText, max: 2, hint: enterKeyHint },
          ] as const
        ).map(({ part, unit, text, max, hint }) => (
          <div key={part} className="relative w-32">
            <Input
              id={`${id}-${part}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint={hint}
              autoComplete="off"
              value={text}
              aria-labelledby={`${legendId} ${id}-${part}-unit`}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              className="pr-14"
              onChange={(event) => handleChange(part, max, event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text');
                if (!pasted.includes(':')) return; // plain digits go through onChange as usual
                event.preventDefault();
                fillBoth(pasted);
              }}
              onBlur={onBlur}
            />
            <Label
              id={`${id}-${part}-unit`}
              htmlFor={`${id}-${part}`}
              className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base font-normal text-muted-foreground"
            >
              {unit}
            </Label>
          </div>
        ))}
      </div>
      {hasMeta && (
        <div
          id={metaId}
          className="flex min-h-5 items-center justify-between gap-3 font-mono text-sm text-muted-foreground tabular-nums"
        >
          <span>{previous}</span>
          <span className="text-right">{change}</span>
        </div>
      )}
      <p
        id={errorId}
        role={error ? 'alert' : undefined}
        className="min-h-5 text-sm text-destructive"
      >
        {error}
      </p>
    </FieldSet>
  );
}
