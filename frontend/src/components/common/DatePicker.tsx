'use client';

import { Calendar01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import dynamic from 'next/dynamic';
import { useId, useRef, useState } from 'react';
import { FLOATING_BOX_CLASS, FloatingLabel } from '@/components/common/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IsoMonth } from '@/lib/dates/month';
import { parseTypedDate } from '@/lib/dates/typedDate';
import type { IsoDate } from '@/lib/domain/dates';
import { formatDay } from '@/lib/format';

// BR-REC-192, 232: the one date input. The box shows the day as `dd MMM yyyy` and takes a typed `dd/mm/yyyy`
// (`-` or `.` allowed, single digits allowed); the calendar button next to it opens the calendar in a popover,
// or inline inside a sheet (no overlay on an overlay). Text that is a real day is passed on at once; text that
// is not one clears the value (`''`), so the form's own Save check says so like for any field. The calendar
// library is an on-demand chunk (BR-REC-215), fetched on the first pointer-down or focus of the box or the
// calendar button so the first open is instant.

const CalendarSkeleton = () => <div aria-hidden="true" className="h-80 w-72" />;

const DatePickerCalendar = dynamic(() => import('@/components/common/DatePickerCalendar'), {
  ssr: false,
  loading: CalendarSkeleton,
});

const preload = () => {
  void import('@/components/common/DatePickerCalendar');
};

const INPUT_CLASS = `peer ${FLOATING_BOX_CLASS} pr-12 placeholder:text-transparent focus:placeholder:text-muted-foreground`;

const OPEN_CALENDAR = 'Open calendar';
const FORMAT_HINT = 'dd/mm/yyyy';

export interface DatePickerProps {
  /** On the button, so the form's "first problem" and any outside label find it. */
  id?: string;
  label: string;
  required?: boolean;
  /** `YYYY-MM-DD`, or `''` for none. */
  value: IsoDate | '';
  /** A real day, or `''` when the box is emptied or holds text that is not a day (the form then asks on Save). */
  onChange: (value: IsoDate | '') => void;
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
  // What is typed while the box is being edited; `null` shows the stored day as `dd MMM yyyy`.
  const [draft, setDraft] = useState<string | null>(null);
  // The day changed from outside the box (calendar, paper column, a reset): typed text that no longer says
  // that day goes away.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (draft !== null && value !== '' && parseTypedDate(draft) !== value) setDraft(null);
  }
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) onBlur?.();
  };
  const pick = (day: IsoDate) => {
    setDraft(null);
    onChange(day);
    change(false);
    inputRef.current?.focus();
  };

  // Leaving the box (or Enter): a real day was already passed on while typing; anything else empties the value.
  const settle = () => {
    if (draft === null) return;
    if (parseTypedDate(draft) !== null) {
      setDraft(null);
      return;
    }
    if (value !== '') onChange('');
    if (draft.trim() === '') setDraft(null);
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

  const box = (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={FORMAT_HINT}
        value={draft ?? (value ? formatDay(value) : '')}
        aria-invalid={invalid}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onFocus={(event) => {
          preload();
          event.target.select(); // typing replaces the shown day
        }}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const day = parseTypedDate(text);
          if (day !== null) onChange(day);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') settle();
        }}
        onBlur={() => {
          settle();
          onBlur?.();
        }}
        className={INPUT_CLASS}
      />
      <FloatingLabel htmlFor={id} label={label} required={required} />
      <div className="absolute inset-y-0 right-0 flex items-center pr-1">
        {variant === 'inline' ? (
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={OPEN_CALENDAR}
            aria-expanded={open}
            aria-haspopup="dialog"
            disabled={disabled}
            onPointerDown={preload}
            onFocus={preload}
            onClick={() => change(!open)}
          >
            <HugeiconsIcon icon={Calendar01Icon} strokeWidth={2} className="size-5" />
          </Button>
        ) : (
          <PopoverTrigger
            render={
              <Button
                ref={triggerRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={OPEN_CALENDAR}
                aria-expanded={open}
                aria-haspopup="dialog"
                disabled={disabled}
                onPointerDown={preload}
                onFocus={preload}
              />
            }
          >
            <HugeiconsIcon icon={Calendar01Icon} strokeWidth={2} className="size-5" />
          </PopoverTrigger>
        )}
      </div>
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="flex flex-col gap-2">
        {box}
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
      {box}
      <PopoverContent align="end" className="w-auto p-0">
        {calendar}
      </PopoverContent>
    </Popover>
  );
}
