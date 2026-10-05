'use client';

import { type ReactNode, useId } from 'react';
import { Input } from '@/components/ui/input';
import { FLOATING_BOX_CLASS, FloatingLabel } from './FloatingLabelInput';

/** The two boxes as typed; the schema turns them into seconds. */
export interface DurationText {
  min: string;
  sec: string;
}

interface DurationInputProps {
  /** The one label over both boxes, e.g. "Plank (min:sec)". */
  label: ReactNode;
  value: DurationText;
  onChange: (value: DurationText) => void;
  onBlur?: () => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** Key label of the seconds box on the phone keyboard (the minutes box says "next", BR-REC-91). */
  enterKeyHint?: 'next' | 'done';
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

const digits = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

/** Minutes and seconds in two boxes under one floating label (one FormItem, BR-REC-187). */
export function DurationInput({
  label,
  value,
  onChange,
  onBlur,
  id,
  required,
  disabled,
  enterKeyHint = 'next',
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: DurationInputProps) {
  const fallbackId = useId();
  const base = id ?? fallbackId;
  const box = (part: keyof DurationText, max: number, unit: string, ariaLabel: string) => (
    <div className="relative min-w-0 flex-1">
      <Input
        id={`${base}-${part}`}
        value={value[part]}
        inputMode="numeric"
        enterKeyHint={part === 'sec' ? enterKeyHint : 'next'}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-required={required || undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled}
        className={`${FLOATING_BOX_CLASS} pr-12`}
        onChange={(event) => onChange({ ...value, [part]: digits(event.target.value, max) })}
        onBlur={part === 'sec' ? onBlur : undefined}
      />
      <span className="pointer-events-none absolute right-3 bottom-1.5 text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
  );
  return (
    <fieldset aria-labelledby={`${base}-label`} className="relative flex gap-2">
      <FloatingLabel
        htmlFor={`${base}-min`}
        label={<span id={`${base}-label`}>{label}</span>}
        required={required}
        floated
      />
      {box('min', 3, 'min', 'Minutes')}
      {box('sec', 2, 'sec', 'Seconds')}
    </fieldset>
  );
}
