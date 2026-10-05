'use client';

import type { ReactNode } from 'react';
import type { Decimals } from '@/lib/assessments/types';
import { toggleMinus } from '@/lib/forms/numberText';
import { UI_TEXT } from '@/lib/messages/words';
import { FloatingLabelInput, type FloatingLabelInputProps } from './FloatingLabelInput';

interface NumberInputProps
  extends Omit<
    FloatingLabelInputProps,
    'type' | 'inputMode' | 'onChange' | 'value' | 'suffix' | 'action'
  > {
  /** The typed text: a number field is text until Save (BR-REC-76), the schema parses it. */
  value: string;
  onChange: (text: string) => void;
  unit?: ReactNode;
  decimals?: Decimals;
  allowNegative?: boolean;
}

/**
 * Text box for a number: number keypad, only digits, one "." or "," and (if allowed) a leading "-". The
 * iPhone decimal keypad has no minus key, so with `allowNegative` a ± button inside the box flips the sign.
 */
export function NumberInput({
  value,
  onChange,
  unit,
  decimals = 0,
  allowNegative = false,
  ...props
}: NumberInputProps) {
  const clean = (text: string): string => {
    const negative = allowNegative && text.trimStart().startsWith('-') ? '-' : '';
    const body = text.replace(decimals === 0 ? /\D/g : /[^\d.,]/g, '');
    const mark = body.search(/[.,]/);
    const single =
      mark < 0 ? body : body.slice(0, mark + 1) + body.slice(mark + 1).replace(/[.,]/g, '');
    return negative + single;
  };
  return (
    <FloatingLabelInput
      {...props}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={value}
      suffix={unit}
      action={
        allowNegative ? (
          <button
            type="button"
            disabled={props.disabled}
            aria-label={
              value.trimStart().startsWith('-') ? UI_TEXT.makePositive : UI_TEXT.makeNegative
            }
            onClick={() => onChange(toggleMinus(value))}
            className="flex size-11 items-center justify-center rounded-full text-base text-muted-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <span aria-hidden="true">±</span>
          </button>
        ) : undefined
      }
      onChange={(event) => onChange(clean(event.target.value))}
    />
  );
}
