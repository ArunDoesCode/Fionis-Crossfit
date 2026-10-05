'use client';

import { CHIP_CLASS } from '@/components/common/ChoiceChips';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

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

// The chips of one form field (Sex, Membership, Goal). The label and the error belong to the field's
// FormItem / FormMessage, so unlike ChoiceChips this draws neither. Tapping the chosen chip keeps it.
export default function ChipGroup<T extends string>({
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
