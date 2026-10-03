'use client';

import { useState } from 'react';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { durationFromParts, durationToParts } from '@/lib/domain/duration';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface DurationFieldProps {
  id: string;
  label: string;
  required?: boolean;
  /** Total seconds, or `null` while empty or not a valid time. */
  value: number | null;
  onChange: (seconds: number | null) => void;
  onBlur?: () => void;
  /** Same two lines as NumberField: last value (left) and live change (right), mono font. */
  previous?: React.ReactNode;
  change?: React.ReactNode;
  error?: string;
  className?: string;
}

const digits = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

function toTexts(seconds: number | null): { minText: string; secText: string } {
  if (seconds === null) return { minText: '', secText: '' };
  const { minutes, seconds: rest } = durationToParts(seconds);
  return { minText: String(minutes), secText: String(rest).padStart(2, '0') };
}

// "Time (min:sec)" typed in two boxes, minutes and seconds, each with the number keypad (BR-REC-75).
// Blank seconds count as 0; seconds above 59 or minutes above 599 give `null` (the screen shows its error).
export default function DurationField({
  id,
  label,
  required,
  value,
  onChange,
  onBlur,
  previous,
  change,
  error,
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
    const seconds =
      next.minText === '' && next.secText === ''
        ? null
        : durationFromParts(Number(next.minText || '0'), Number(next.secText || '0'));
    setEmitted(seconds);
    onChange(seconds);
  }

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
            { part: 'min', unit: UI_TEXT.minutes, text: texts.minText, max: 3 },
            { part: 'sec', unit: UI_TEXT.seconds, text: texts.secText, max: 2 },
          ] as const
        ).map(({ part, unit, text, max }) => (
          <div key={part} className="relative w-32">
            <Input
              id={`${id}-${part}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={text}
              aria-labelledby={`${legendId} ${id}-${part}-unit`}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              className="pr-14"
              onChange={(event) =>
                update(
                  part === 'min'
                    ? { minText: digits(event.target.value, max), secText: texts.secText }
                    : { minText: texts.minText, secText: digits(event.target.value, max) },
                )
              }
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
