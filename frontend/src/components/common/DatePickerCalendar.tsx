'use client';

import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  type DayCalendarProps,
  dateToIso,
  isoToDate,
  type MonthGridProps,
  WEEK_STARTS_ON,
} from '@/lib/dates/dayPicker';
import { isMonthDisabled, shiftYear, yearOf } from '@/lib/dates/month';
import { monthShortName } from '@/lib/format';
import { UI_TEXT } from '@/lib/messages/words';

// The on-demand chunk (BR-REC-215): the only importer of components/ui/calendar (react-day-picker). The day
// grid and the month grid live here so one chunk serves both pickers. Loaded with next/dynamic.

const clamp = (day: string, min?: string, max?: string): string => {
  if (min !== undefined && day < min) return min;
  if (max !== undefined && day > max) return max;
  return day;
};

export default function DatePickerCalendar({
  value,
  onSelect,
  today,
  min,
  max,
  defaultMonth,
  yearRange,
}: DayCalendarProps) {
  const shown = value || clamp(defaultMonth ? `${defaultMonth}-01` : today, min, max);
  const disabled = [
    ...(min ? [{ before: isoToDate(min) }] : []),
    ...(max ? [{ after: isoToDate(max) }] : []),
  ];
  const startMonth = yearRange ? new Date(yearRange.from, 0, 1) : min ? isoToDate(min) : undefined;
  const endMonth = yearRange ? new Date(yearRange.to, 11, 1) : max ? isoToDate(max) : undefined;

  return (
    <Calendar
      mode="single"
      autoFocus
      required={false}
      weekStartsOn={WEEK_STARTS_ON}
      selected={value ? isoToDate(value) : undefined}
      onSelect={(date) => {
        if (date) onSelect(dateToIso(date));
      }}
      defaultMonth={isoToDate(shown)}
      today={isoToDate(today)}
      disabled={disabled}
      startMonth={startMonth}
      endMonth={endMonth}
      captionLayout={yearRange ? 'dropdown' : 'label'}
      showOutsideDays={false}
      className="[--cell-size:--spacing(9)] pointer-coarse:[--cell-size:--spacing(11)]"
    />
  );
}

/** Year stepper and 12 month buttons (BR-REC-194). Months outside min / max are disabled. */
export function MonthGrid({ value, onSelect, fallbackYear, min, max }: MonthGridProps) {
  const [year, setYear] = useState(value ? yearOf(value) : fallbackYear);
  const months = Array.from({ length: 12 }, (_, index) => ({
    key: shiftYear(`${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`, 0),
    name: monthShortName(index + 1),
  }));
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={UI_TEXT.previousYear}
          onClick={() => setYear(year - 1)}
          disabled={min !== undefined && year <= yearOf(min)}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
        </Button>
        <span aria-live="polite" className="text-sm font-medium">
          {year}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={UI_TEXT.nextYear}
          onClick={() => setYear(year + 1)}
          disabled={max !== undefined && year >= yearOf(max)}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {months.map(({ key, name }) => (
          <Button
            key={key}
            type="button"
            variant={key === value ? 'default' : 'ghost'}
            aria-pressed={key === value}
            disabled={isMonthDisabled(key, min, max)}
            onClick={() => onSelect(key)}
            className="h-control"
          >
            {name}
          </Button>
        ))}
      </div>
    </div>
  );
}
