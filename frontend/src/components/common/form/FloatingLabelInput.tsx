'use client';

import { type ReactNode, useId } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Look of the text box under a floating label; reuse it for number, date and select triggers. */
export const FLOATING_BOX_CLASS = 'h-12 pt-5 pb-1';

interface FloatingLabelProps {
  htmlFor: string;
  label: ReactNode;
  required?: boolean;
  /** Force the label up (`true`) or down (`false`) for controls that are not a text input, e.g. a date
   * trigger with a value. Leave it out beside an `<Input className="peer" placeholder=" ">`. */
  floated?: boolean;
  className?: string;
}

/** The label that sits inside the field and floats up when it has a value or focus. */
export function FloatingLabel({
  htmlFor,
  label,
  required,
  floated,
  className,
}: FloatingLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'pointer-events-none absolute left-3 z-10 origin-left truncate text-muted-foreground transition-all peer-aria-invalid:text-destructive',
        floated === undefined &&
          'top-1.5 text-xs peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:top-1.5 peer-focus:text-xs',
        floated === true && 'top-1.5 text-xs',
        floated === false && 'top-3.5 text-base',
        className,
      )}
    >
      {label}
      {required ? <span aria-hidden="true"> *</span> : null}
    </label>
  );
}

export interface FloatingLabelInputProps
  extends Omit<React.ComponentProps<'input'>, 'placeholder' | 'size'> {
  label: ReactNode;
  /** Shown at the right inside the box (a unit such as "kg"). */
  suffix?: ReactNode;
  /** A control at the right edge inside the box (e.g. the ± button); it must be at most 44 px wide. */
  action?: ReactNode;
}

export function FloatingLabelInput({
  label,
  suffix,
  action,
  id,
  required,
  className,
  ...props
}: FloatingLabelInputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <div className="relative">
      <Input
        {...props}
        id={inputId}
        placeholder=" "
        required={false}
        aria-required={required || undefined}
        className={cn(
          'peer',
          FLOATING_BOX_CLASS,
          action && suffix ? 'pr-24' : action || suffix ? 'pr-12' : undefined,
          className,
        )}
      />
      <FloatingLabel htmlFor={inputId} label={label} required={required} />
      {suffix ? (
        <span
          className={cn(
            'pointer-events-none absolute bottom-1.5 text-sm text-muted-foreground',
            action ? 'right-12' : 'right-3',
          )}
        >
          {suffix}
        </span>
      ) : null}
      {action ? <div className="absolute inset-y-0 right-0 flex items-center">{action}</div> : null}
    </div>
  );
}
