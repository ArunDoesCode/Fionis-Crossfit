'use client';

import {
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
  useController,
} from 'react-hook-form';
import ChoiceChips from '@/components/common/ChoiceChips';
import DurationField from '@/components/common/DurationField';
import NumberField from '@/components/common/NumberField';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Small controlled fields for the setup forms (React Hook Form + the shared components). Every field has a
// visible label linked by `htmlFor` (or a legend), its error sits under it (BR-REC-134) and is read out.
// `useController` hands back `PathValue<Values, Name>`, which TypeScript cannot narrow for a generic form;
// each control states the one kind of value it expects and the form's own types guarantee it.

interface BaseProps<Values extends FieldValues> {
  control: Control<Values>;
  name: Path<Values>;
  id: string;
}

const asValue = <Value,>(value: unknown): Value => value as Value;

const Required = () => <span className="text-destructive"> *</span>;

interface TextControlProps<Values extends FieldValues> extends BaseProps<Values> {
  label: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
  autoComplete?: string;
}

export function TextControl<Values extends FieldValues>({
  control,
  name,
  id,
  label,
  required,
  hint,
  disabled,
  autoComplete = 'off',
}: TextControlProps<Values>) {
  const { field, fieldState } = useController({ control, name });
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, fieldState.error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={id}>
        <span>
          {label}
          {required && <Required />}
        </span>
      </FieldLabel>
      <Input
        id={id}
        name={field.name}
        ref={field.ref}
        value={asValue<string>(field.value)}
        onChange={field.onChange}
        onBlur={field.onBlur}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={fieldState.invalid}
        aria-describedby={describedBy || undefined}
      />
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      <div className="min-h-5">
        <FieldError id={errorId} errors={[fieldState.error]} />
      </div>
    </Field>
  );
}

interface SelectControlProps<Values extends FieldValues> extends BaseProps<Values> {
  label: string;
  hint?: string;
  options: readonly string[];
}

// The phone's own picker (a native select): the list of time zones is long, and a typed name is easy to get wrong.
export function SelectControl<Values extends FieldValues>({
  control,
  name,
  id,
  label,
  hint,
  options,
}: SelectControlProps<Values>) {
  const { field, fieldState } = useController({ control, name });
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, fieldState.error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        name={field.name}
        ref={field.ref}
        data-slot="input"
        value={asValue<string>(field.value)}
        onChange={field.onChange}
        onBlur={field.onBlur}
        aria-invalid={fieldState.invalid}
        aria-describedby={describedBy || undefined}
        className={cn(
          'h-12 w-full min-w-0 rounded-4xl border border-input px-3 text-base outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20',
        )}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      <div className="min-h-5">
        <FieldError id={errorId} errors={[fieldState.error]} />
      </div>
    </Field>
  );
}

interface NumberControlProps<Values extends FieldValues> extends BaseProps<Values> {
  label: string;
  required?: boolean;
  unit?: string;
}

/** Whole or decimal numbers typed as text; the form's resolver turns the text into a number. */
export function NumberControl<Values extends FieldValues>({
  control,
  name,
  id,
  label,
  required,
  unit,
}: NumberControlProps<Values>) {
  const { field, fieldState } = useController({ control, name });
  return (
    <NumberField
      id={id}
      label={label}
      required={required}
      unit={unit}
      value={asValue<string>(field.value)}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}

interface DurationControlProps<Values extends FieldValues> extends BaseProps<Values> {
  label: string;
}

/** Minutes and seconds in two boxes; the form keeps whole seconds as text ("" = empty). */
export function DurationControl<Values extends FieldValues>({
  control,
  name,
  id,
  label,
}: DurationControlProps<Values>) {
  const { field, fieldState } = useController({ control, name });
  const text = asValue<string>(field.value);
  const seconds = text === '' ? null : Number(text);
  return (
    <DurationField
      id={id}
      label={label}
      value={seconds !== null && Number.isFinite(seconds) ? seconds : null}
      onChange={(next) => field.onChange(next === null ? '' : String(next))}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}

interface ChipsControlProps<Values extends FieldValues, Choice extends string>
  extends Omit<BaseProps<Values>, 'id'> {
  legend: string;
  hideLegend?: boolean;
  required?: boolean;
  options: readonly { value: Choice; label: string }[];
  /** Runs after the form value changed (for example to clear a field that no longer applies). */
  onPick?: (value: Choice) => void;
}

export function ChipsControl<Values extends FieldValues, Choice extends string>({
  control,
  name,
  legend,
  hideLegend,
  required,
  options,
  onPick,
}: ChipsControlProps<Values, Choice>) {
  const { field, fieldState } = useController({ control, name });
  return (
    <ChoiceChips
      legend={legend}
      hideLegend={hideLegend}
      required={required}
      options={options}
      value={asValue<Choice | null>(field.value)}
      onChange={(value) => {
        field.onChange(value as PathValue<Values, Path<Values>>);
        onPick?.(value);
      }}
      error={fieldState.error?.message}
    />
  );
}

interface SwitchControlProps<Values extends FieldValues> extends BaseProps<Values> {
  label: string;
  hint?: string;
}

/** The On/Off switch of an assessment or a measurement (BR-REC-66: off, never deleted). */
export function SwitchControl<Values extends FieldValues>({
  control,
  name,
  id,
  label,
  hint,
}: SwitchControlProps<Values>) {
  const { field } = useController({ control, name });
  const hintId = `${id}-hint`;
  return (
    <Field orientation="horizontal" className="min-h-12 items-center justify-between">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      </FieldContent>
      <Switch
        id={id}
        name={field.name}
        checked={asValue<boolean>(field.value)}
        onCheckedChange={(checked) => field.onChange(checked)}
        aria-describedby={hint ? hintId : undefined}
      />
    </Field>
  );
}
