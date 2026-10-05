'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UI_TEXT } from '@/lib/messages/words';
import { timeZoneLabel } from '@/lib/setup/timezones';

interface TimeZoneComboboxProps {
  /** Id of the trigger: the field's `<Label htmlFor>` points here. */
  id: string;
  value: string;
  onChange: (zone: string) => void;
  /** IANA names, e.g. "Asia/Kolkata". */
  options: readonly string[];
  onBlur?: () => void;
  invalid?: boolean;
  'aria-describedby'?: string;
}

// BR-REC-196, 233: a searchable list instead of a native select ("kolk" and "india" find Asia/Kolkata). The
// zone list is long; each row reads "India (Kolkata) · IST" while the saved value stays the zone name.
export default function TimeZoneCombobox({
  id,
  value,
  onChange,
  options,
  onBlur,
  invalid,
  'aria-describedby': describedBy,
}: TimeZoneComboboxProps) {
  const [open, setOpen] = useState(false);
  const labelled = useMemo(
    () => options.map((zone) => ({ zone, label: timeZoneLabel(zone) })),
    [options],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onBlur={onBlur}
            className="control-trigger border-input h-[var(--control-height)] w-full justify-start px-3 text-base font-normal"
          />
        }
      >
        {timeZoneLabel(value)}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
        <Command>
          <CommandInput placeholder={UI_TEXT.searchTimeZones} />
          <CommandList>
            <CommandEmpty>{UI_TEXT.noTimeZone}</CommandEmpty>
            <CommandGroup>
              {labelled.map(({ zone, label }) => (
                <CommandItem
                  key={zone}
                  value={`${zone} ${label}`}
                  data-checked={zone === value}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
