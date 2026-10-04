import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface MemberDateFieldProps {
  id: string;
  label: string;
  required?: boolean;
  /** Calendar day `YYYY-MM-DD` (what a native date input uses, and what the API expects). */
  value: string;
  onChange: (value: string) => void;
  /** Called when the field is left: the form checks it then (BR-REC-134). */
  onBlur?: () => void;
  /** For "no dates in the future" pass today's `YYYY-MM-DD`. */
  max?: string;
  /** A problem: one plain sentence, red, blocks saving. */
  error?: string;
  /** A hint that never blocks saving ("Please check the date", BR-REC-48). Shown only when there is no error. */
  warning?: string;
  className?: string;
}

// Same look as the shared DateField (label above, 48 px, the phone's own picker, a reserved line under it),
// plus the two things S6/S8 need that it does not have: a blur callback and a non-blocking warning.
// The warning has its own words and icon-free text colour so it is never taken for an error (BR-REC-125).
export default function MemberDateField({
  id,
  label,
  required,
  value,
  onChange,
  onBlur,
  max,
  error,
  warning,
  className,
}: MemberDateFieldProps) {
  const noteId = `${id}-note`;
  const note = error ?? warning;
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
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="min-w-0"
      />
      <p
        id={noteId}
        role={error ? 'alert' : warning ? 'status' : undefined}
        className={cn('min-h-5 text-sm', error ? 'text-destructive' : 'text-warning')}
      >
        {note}
      </p>
    </div>
  );
}
