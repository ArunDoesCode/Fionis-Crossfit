'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/** One chip: at least 44 px, filled when chosen (BR-REC-122). */
const CHIP_CLASS =
  'min-h-11 min-w-11 rounded-full px-4 text-base aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground';

interface ChipGroupProps<T extends string>
  extends Omit<
    React.ComponentProps<typeof ToggleGroup>,
    'value' | 'onChange' | 'onValueChange' | 'children'
  > {
  options: readonly { value: T; label: string }[];
  /** The chosen value, or `null` when nothing is chosen yet. */
  value: T | null;
  onChange: (value: T) => void;
}

// The chips of one choice (Sex, Membership, Goal, Repeat…): the one chip implementation. The label and the error
// belong to the field's FormItem / FormMessage (or to ChoiceChips for a standalone filter row). Tapping the chosen chip keeps it.
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  className,
  ...props
}: ChipGroupProps<T>) {
  return (
    <ToggleGroup
      {...props}
      value={value === null ? [] : [value]}
      onValueChange={(next) => {
        const chosen = options.find((option) => option.value === next[0]);
        if (chosen) onChange(chosen.value);
      }}
      className={cn('flex-wrap', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          variant="outline"
          className={CHIP_CLASS}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
