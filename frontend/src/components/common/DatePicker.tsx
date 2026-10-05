'use client';

import dynamic from 'next/dynamic';
import { useId, useRef, useState } from 'react';
import { FLOATING_BOX_CLASS, FloatingLabel } from '@/components/common/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IsoMonth } from '@/lib/dates/month';
import type { IsoDate } from '@/lib/domain/dates';
import { formatDay } from '@/lib/format';

// BR-REC-192: the one date input. The button shows the day as `dd MMM yyyy`; the calendar opens in a popover,
// or inline inside a sheet (no overlay on an overlay). The calendar library is an on-demand chunk (BR-REC-215),
// fetched on the first pointer-down or focus of the button so the first open is instant.

const CalendarSkeleton = () => <div aria-hidden="true" className="h-80 w-72" />;

const DatePickerCalendar = dynamic(() => import('@/components/common/DatePickerCalendar'), {
  ssr: false,
  loading: CalendarSkeleton,
});

const preload = () => {
  void import('@/components/common/DatePickerCalendar');
};

// `control-trigger` (globals.css) gives it the same white fill, input border and phone height as an input.
const TRIGGER_CLASS = `control-trigger ${FLOATING_BOX_CLASS} peer flex w-full min-w-0 items-end rounded-4xl border border-input px-3 text-left text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40`;

export interface DatePickerProps {
  /** On the button, so the form's "first problem" and any outside label find it. */
  id?: string;
  label: string;
  required?: boolean;
  /** `YYYY-MM-DD`, or `''` for none. */
  value: IsoDate | '';
  onChange: (value: IsoDate) => void;
  onBlur?: () => void;
  /** The gym's today (from `useToday`). */
  today: IsoDate;
  /** Days before `min` or after `max` are greyed out. */
  min?: IsoDate;
  max?: IsoDate;
  /** The month shown when there is no value (default: today's). */
  defaultMonth?: IsoMonth;
  /** Month and year dropdowns between these years (birth date). */
  yearRange?: { from: number; to: number };
  /** `inline` opens the calendar under the button instead of a popover: use it inside a sheet. */
  variant?: 'popover' | 'inline';
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export default function DatePicker({
  id: idProp,
  label,
  required,
  value,
  onChange,
  onBlur,
  today,
  min,
  max,
  defaultMonth,
  yearRange,
  variant = 'popover',
  disabled,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: DatePickerProps) {
  const fallbackId = useId();
  const id = idProp ?? fallbackId;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) onBlur?.();
  };
  const pick = (day: IsoDate) => {
    onChange(day);
    change(false);
    triggerRef.current?.focus();
  };

  const calendar = (
    <DatePickerCalendar
      value={value}
      onSelect={pick}
      today={today}
      min={min}
      max={max}
      defaultMonth={defaultMonth}
      yearRange={yearRange}
    />
  );

  const face = (
    <>
      <span id={`${id}-value`} className="block min-h-6 w-full truncate pb-1 leading-6">
        {value ? formatDay(value) : ''}
      </span>
      <span id={`${id}-label`} className="contents">
        <FloatingLabel htmlFor={id} label={label} required={required} floated={value !== ''} />
      </span>
    </>
  );
  const labelledBy = `${id}-label ${id}-value`;

  if (variant === 'inline') {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative">
          <button
            ref={triggerRef}
            id={id}
            type="button"
            aria-labelledby={labelledBy}
            aria-expanded={open}
            aria-invalid={invalid}
            role="combobox"
            aria-haspopup="dialog"
            aria-required={required || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            onPointerDown={preload}
            onFocus={preload}
            onClick={() => change(!open)}
            className={TRIGGER_CLASS}
          >
            {face}
          </button>
        </div>
        {open && (
          // biome-ignore lint/a11y/noStaticElementInteractions: Esc closes the inline calendar and returns focus to its button
          <div
            className="flex justify-center"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.stopPropagation();
              change(false);
              triggerRef.current?.focus();
            }}
          >
            {calendar}
          </div>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={change}>
      <div className="relative">
        <PopoverTrigger
          render={
            <button
              ref={triggerRef}
              id={id}
              type="button"
              aria-labelledby={labelledBy}
              aria-invalid={invalid}
              role="combobox"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-required={required || undefined}
              aria-describedby={describedBy}
              disabled={disabled}
              onPointerDown={preload}
              onFocus={preload}
              className={TRIGGER_CLASS}
            />
          }
        >
          {face}
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className="w-auto p-0">
        {calendar}
      </PopoverContent>
    </Popover>
  );
}
