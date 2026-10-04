'use client';

import { PlusMinus01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UI_TEXT } from '@/lib/messages/words';
import { toggleMinus } from '@/lib/numberText';
import { cn } from '@/lib/utils';

interface NumberFieldProps {
  id: string;
  label: string;
  required?: boolean;
  /** Shown inside the field at the right ("kg", "%", "cm"). */
  unit?: string;
  /**
   * Adds a ± button inside the field at the left (the iPhone decimal keypad has no minus key). It flips a
   * leading "-" in the text; the value stays a string and "-" alone is allowed (the screen's parser decides).
   */
  allowNegative?: boolean;
  /** Key label on the phone keyboard: "next" moves to the next field, "done" on the last one (BR-REC-91). */
  enterKeyHint?: 'next' | 'done';
  /** The text typed so far; the screen parses it (a number field is text until Save). */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Line under the field, left: the last value ("Last 95.5 kg · 12 Sep"). Mono font, digits line up. */
  previous?: React.ReactNode;
  /** Line under the field, right: the live change ("▼ 1.5 kg better"). Pass `null` to keep its place free. */
  change?: React.ReactNode;
  /** One plain sentence (BR-REC-128, 134). */
  error?: string;
  className?: string;
}

// A number input for one measurement: 48 px, decimal keypad, unit inside, optional ± button at the left
// (44 px hit area), and the two lines a trainer
// compares against (previous and change). Those lines use the mono font (BR-REC-123) and keep their
// height whether or not they have text, so typing never moves the form (BR-REC-143, 144).
export default function NumberField({
  id,
  label,
  required,
  unit,
  allowNegative = false,
  enterKeyHint,
  value,
  onChange,
  onBlur,
  previous,
  change,
  error,
  className,
}: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const metaId = `${id}-meta`;
  const errorId = `${id}-error`;
  const hasMeta = previous !== undefined || change !== undefined;
  const describedBy = [hasMeta ? metaId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
      </Label>
      <div className="relative">
        {allowNegative && (
          // tabIndex -1: the phone's "Next" key must go from field to field (BR-REC-91); keyboard users type "-".
          <Button
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={-1}
            aria-label={
              value.trimStart().startsWith('-') ? UI_TEXT.makePositive : UI_TEXT.makeNegative
            }
            className="absolute top-1/2 left-0.5 size-11 -translate-y-1/2"
            // Keep the focus (and the keypad) in the input, so tapping ± does not count as leaving the field.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange(toggleMinus(value));
              inputRef.current?.focus();
            }}
          >
            <HugeiconsIcon icon={PlusMinus01Icon} strokeWidth={2} className="size-5" />
          </Button>
        )}
        <Input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          enterKeyHint={enterKeyHint}
          autoComplete="off"
          value={value}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(unit && 'pr-14', allowNegative && 'pl-14')}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {unit && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base text-muted-foreground"
          >
            {unit}
          </span>
        )}
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
    </div>
  );
}
