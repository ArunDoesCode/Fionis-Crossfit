'use client';

import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { MonthGridProps } from '@/lib/dates/dayPicker';
import { formatMonthYear } from '@/lib/format';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

// BR-REC-194: a month filter. Popover with a year stepper and 12 month buttons; the value stays `YYYY-MM`
// (what the Reports address keeps). The grid comes from the same on-demand chunk as the day calendar.

const GridSkeleton = () => <div aria-hidden="true" className="h-64 w-64" />;

const MonthGrid = dynamic(
  () => import('@/components/common/DatePickerCalendar').then((module) => module.MonthGrid),
  { ssr: false, loading: GridSkeleton },
);

const preload = () => {
  void import('@/components/common/DatePickerCalendar');
};

interface MonthPickerProps {
  id: string;
  label: string;
  /** `YYYY-MM`, or `''` for none. */
  value: string;
  /** A whole month, or `''` when cleared. */
  onChange: (value: string) => void;
  /** Months before `min` or after `max` (`YYYY-MM`) are disabled. */
  min?: string;
  max?: string;
  /** Gym today, for the year shown while nothing is chosen. */
  today: string;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  className?: string;
}

export default function MonthPicker({
  id,
  label,
  value,
  onChange,
  min,
  max,
  today,
  placeholder = UI_TEXT.anyMonth,
  className,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const gridProps: Omit<MonthGridProps, 'onSelect'> = {
    value,
    fallbackYear: Number(today.slice(0, 4)),
    min,
    max,
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              onPointerDown={preload}
              onFocus={preload}
              className="w-full justify-between px-3 text-base font-normal"
            />
          }
        >
          <span className={value === '' ? 'truncate text-muted-foreground' : 'truncate'}>
            {value ? formatMonthYear(`${value}-01`) : placeholder}
          </span>
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <MonthGrid
            {...gridProps}
            onSelect={(month) => {
              onChange(month);
              setOpen(false);
            }}
          />
          {value !== '' && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {UI_TEXT.clear}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
