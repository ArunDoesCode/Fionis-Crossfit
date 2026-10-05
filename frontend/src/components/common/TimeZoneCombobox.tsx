'use client';

import { useState } from 'react';
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

// BR-REC-196: a searchable list instead of a native select ("kolk" finds Asia/Kolkata). The zone list is long.
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
            className="h-(--control-height) w-full justify-start px-3 text-base font-normal"
          />
        }
      >
        {value}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Command>
          <CommandInput placeholder="Search time zones" />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            <CommandGroup>
              {options.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  data-checked={zone === value}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  {zone}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
