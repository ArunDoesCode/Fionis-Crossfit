import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface NumberFieldProps {
  id: string;
  label: string;
  required?: boolean;
  /** Shown inside the field at the right ("kg", "%", "cm"). */
  unit?: string;
  /** The text typed so far; the screen parses it (a number field is text until Save). */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Line under the field, left: the last value ("Last 95.5 kg · 12 Sep"). Mono font, digits line up. */
  previous?: React.ReactNode;
  /** Line under the field, right: the live change ("▼ 1.5 kg better"). Pass `null` to keep its place free. */
  change?: React.ReactNode;
  /** One plain sentence (BR-REC-128, 134). */
  error?: string;
  className?: string;
}

// A number input for one measurement: 48 px, decimal keypad, unit inside, and the two lines a trainer
// compares against (previous and change). Those lines use the mono font (BR-REC-123) and keep their
// height whether or not they have text, so typing never moves the form (BR-REC-143, 144).
export default function NumberField({
  id,
  label,
  required,
  unit,
  value,
  onChange,
  onBlur,
  previous,
  change,
  error,
  className,
}: NumberFieldProps) {
  const metaId = `${id}-meta`;
  const errorId = `${id}-error`;
  const hasMeta = previous !== undefined || change !== undefined;
  const describedBy = [hasMeta ? metaId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={unit ? 'pr-14' : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {unit && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base text-muted-foreground"
          >
            {unit}
          </span>
        )}
      </div>
      {hasMeta && (
        <div
          id={metaId}
          className="flex min-h-5 items-center justify-between gap-3 font-mono text-sm text-muted-foreground tabular-nums"
        >
          <span>{previous}</span>
          <span className="text-right">{change}</span>
        </div>
      )}
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
