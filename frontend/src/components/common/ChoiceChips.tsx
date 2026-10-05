'use client';

import { FieldLegend, FieldSet } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/** One chip: at least 44 px, filled when chosen (BR-REC-122). Shared with the chips inside a form field. */
export const CHIP_CLASS =
  'min-h-11 min-w-11 rounded-full px-4 text-base aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground';

interface ChoiceChipsProps<T extends string> {
  /** The question or filter name ("Sex", "Membership", "Show"). */
  legend: string;
  /** Hide the legend visually (it is still spoken): for filter rows like All / Active / Ends soon. */
  hideLegend?: boolean;
  required?: boolean;
  options: readonly { value: T; label: string }[];
  /** The chosen value, or `null` when nothing is chosen yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** One plain sentence under the chips. */
  error?: string;
  className?: string;
}

// One choice out of a few, drawn as chips (Male / Female, Monthly / Quarterly …, All / Active …).
// Each chip is at least 44 px tall and wide with 8 px between neighbours (BR-REC-122); the chosen
// chip is filled (and marked pressed for screen readers), so it is not colour alone. Tapping the
// chosen chip again keeps it chosen.
export default function ChoiceChips<T extends string>({
  legend,
  hideLegend = false,
  required,
  options,
  value,
  onChange,
  error,
  className,
}: ChoiceChipsProps<T>) {
  return (
    <FieldSet className={cn('gap-2', className)}>
      <FieldLegend variant="label" className={cn('mb-0', hideLegend && 'sr-only')}>
        {legend}
        {required && <span className="text-destructive"> *</span>}
      </FieldLegend>
      <ToggleGroup
        value={value === null ? [] : [value]}
        onValueChange={(next) => {
          const chosen = options.find((option) => option.value === next[0]);
          if (chosen) onChange(chosen.value);
        }}
        className="flex-wrap"
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
      <p role={error ? 'alert' : undefined} className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </FieldSet>
  );
}
