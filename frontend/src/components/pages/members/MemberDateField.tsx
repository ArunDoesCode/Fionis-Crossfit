import { useId } from 'react';
import { FLOATING_BOX_CLASS, FloatingLabel } from '@/components/common/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MemberDateFieldProps extends Omit<React.ComponentProps<'input'>, 'type' | 'placeholder'> {
  label: string;
  /** Calendar day `YYYY-MM-DD` (what a native date input uses, and what the API expects). */
  value: string;
}

// The date control of the member forms: the floating-label look of the other fields (the label always sits
// up, a date input is never empty-looking). The label, error and warning belong to the FormItem around it.
// U3 replaces the native input with the shared DatePicker; the FormItem around it stays.
export default function MemberDateField({
  label,
  id,
  required,
  className,
  ...props
}: MemberDateFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <div className="relative">
      <Input
        {...props}
        id={inputId}
        type="date"
        aria-required={required || undefined}
        className={cn('peer min-w-0', FLOATING_BOX_CLASS, className)}
      />
      <FloatingLabel htmlFor={inputId} label={label} required={required} floated />
    </div>
  );
}
