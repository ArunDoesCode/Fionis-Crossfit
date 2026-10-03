import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface DateFieldProps {
  id: string;
  label: string;
  required?: boolean;
  /** Calendar day `YYYY-MM-DD` (what a native date input uses, and what the API expects). */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  /** For "no dates in the future" pass today's `YYYY-MM-DD`. */
  max?: string;
  /** One plain sentence under the field (BR-REC-128, 134). */
  error?: string;
  className?: string;
}

// The phone's own date picker (no library). Label above, 48 px, error under it; the error line has
// a reserved height so the form does not jump (BR-REC-143).
export default function DateField({
  id,
  label,
  required,
  value,
  onChange,
  min,
  max,
  error,
  className,
}: DateFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0"
      />
      <p
        id={errorId}
        role={error ? 'alert' : undefined}
        className="min-h-5 text-sm text-destructive"
      >
        {error}
      </p>
    </div>
  );
}
