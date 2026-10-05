'use client';

import { ChipGroup } from '@/components/common/form/ChipGroup';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { cn } from '@/lib/utils';

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
      <FieldLegend variant="label" className={hideLegend ? 'mb-0 sr-only' : 'mb-0'}>
        {legend}
        {required && <span className="text-destructive"> *</span>}
      </FieldLegend>
      <ChipGroup options={options} value={value} onChange={onChange} />
      <p role={error ? 'alert' : undefined} className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </FieldSet>
  );
}
