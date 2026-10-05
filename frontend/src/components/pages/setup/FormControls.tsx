'use client';

import { type ComponentProps, type ReactNode, useState } from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import {
  ChipGroup,
  DurationInput,
  type DurationText,
  FloatingLabelInput,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  NumberInput,
} from '@/components/common/form';
import { useItemIds } from '@/components/common/form/fieldContext';
import TimeZoneCombobox from '@/components/common/TimeZoneCombobox';
import { FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';

// Small controlled fields for the setup forms: React Hook Form's `FormField` + the shared form primitives
// (one 76 px FormItem per field, so an error never moves the form; BR-REC-187). Every field has a visible
// label linked by `htmlFor` (floating label, or the FieldLabel for the time zone and the switch). The
// forms use `useForm<z.input, unknown, z.output>`; `useController` hands back `PathValue<Values, Name>`,
// which TypeScript cannot narrow for a generic form, so each field states the one kind of value it
// expects and the form's own types guarantee it.

interface BaseProps<Values extends FieldValues, Output extends FieldValues> {
  control: Control<Values, unknown, Output>;
  name: Path<Values>;
  className?: string;
}

const asValue = <Value,>(value: unknown): Value => value as Value;

interface TextFieldProps<V extends FieldValues, O extends FieldValues> extends BaseProps<V, O> {
  label: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}

export function TextField<V extends FieldValues, O extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
}: TextFieldProps<V, O>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className} hint={hint}>
          <FormControl>
            <FloatingLabelInput
              name={field.name}
              ref={field.ref}
              label={label}
              required={required}
              disabled={disabled}
              autoComplete="off"
              value={asValue<string | null>(field.value) ?? ''}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface TimeZoneFieldProps<V extends FieldValues, O extends FieldValues> extends BaseProps<V, O> {
  label: string;
  hint?: string;
  options: readonly string[];
}

// The time-zone picker: a searchable list, because the list is long and a typed name is easy to get wrong.
export function TimeZoneField<V extends FieldValues, O extends FieldValues>({
  control,
  name,
  label,
  hint,
  options,
  className,
}: TimeZoneFieldProps<V, O>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className} hint={hint}>
          <ItemLabel>{label}</ItemLabel>
          <FormControl>
            <TimeZoneComboboxFor
              value={asValue<string>(field.value)}
              onChange={field.onChange}
              onBlur={field.onBlur}
              options={options}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The label of a control that has no floating label of its own; it points at the item's control id. */
function ItemLabel({ children }: { children: ReactNode }) {
  const ids = useItemIds();
  return <FieldLabel htmlFor={ids?.id}>{children}</FieldLabel>;
}

/** FormControl clones `id` and the aria props onto its child; this passes them on to the combobox. */
function TimeZoneComboboxFor({
  id,
  'aria-invalid': invalid,
  ...props
}: {
  id?: string;
  'aria-invalid'?: boolean;
  value: string;
  onChange: (zone: string) => void;
  onBlur: () => void;
  options: readonly string[];
  'aria-describedby'?: string;
}) {
  return <TimeZoneCombobox id={id ?? ''} invalid={invalid} {...props} />;
}

interface NumberFieldProps<V extends FieldValues, O extends FieldValues> extends BaseProps<V, O> {
  label: string;
  required?: boolean;
  unit?: string;
  /** Digits after the point the box accepts (0 = whole numbers). */
  decimals?: 0 | 1 | 2;
  allowNegative?: boolean;
  hint?: string;
}

/** A number typed as text; the schema turns the text into a number. */
export function NumberField<V extends FieldValues, O extends FieldValues>({
  control,
  name,
  label,
  required,
  unit,
  decimals = 0,
  allowNegative,
  hint,
  className,
}: NumberFieldProps<V, O>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className} hint={hint}>
          <FormControl>
            <NumberInput
              name={field.name}
              ref={field.ref}
              label={label}
              required={required}
              unit={unit}
              decimals={decimals}
              allowNegative={allowNegative}
              value={asValue<string | null>(field.value) ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface DurationFieldProps<V extends FieldValues, O extends FieldValues> extends BaseProps<V, O> {
  label: string;
}

const toSeconds = ({ min, sec }: DurationText): string =>
  min === '' && sec === '' ? '' : String(Number(min) * 60 + Number(sec));

const split = (seconds: string): DurationText => {
  const total = Number(seconds);
  if (seconds === '' || !Number.isFinite(total)) return { min: '', sec: '' };
  return { min: String(Math.floor(total / 60)), sec: String(total % 60) };
};

/** Minutes and seconds in two boxes under one label; the form keeps whole seconds as text ("" = empty). */
export function DurationField<V extends FieldValues, O extends FieldValues>({
  control,
  name,
  label,
  className,
}: DurationFieldProps<V, O>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormControl>
            <DurationBoxes
              label={label}
              seconds={asValue<string | null>(field.value) ?? ''}
              aria-invalid={fieldState.invalid}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// The boxes keep what was typed ("1" in minutes stays "1", an emptied box stays empty); the form gets the
// seconds. The typed text is only replaced when the form value changes from outside (a reset).
function DurationBoxes({
  seconds,
  onChange,
  ...props
}: Omit<ComponentProps<typeof DurationInput>, 'value' | 'onChange'> & {
  seconds: string;
  onChange: (seconds: string) => void;
}) {
  const [typed, setTyped] = useState<DurationText>(() => split(seconds));
  const shown = toSeconds(typed) === seconds ? typed : split(seconds);
  return (
    <DurationInput
      {...props}
      value={shown}
      onChange={(next) => {
        setTyped(next);
        onChange(toSeconds(next));
      }}
    />
  );
}

interface ChipsFieldProps<V extends FieldValues, O extends FieldValues, Choice extends string>
  extends BaseProps<V, O> {
  legend: string;
  hideLegend?: boolean;
  required?: boolean;
  options: readonly { value: Choice; label: string }[];
  /** Runs after the form value changed (for example to clear a field that no longer applies). */
  onPick?: (value: Choice) => void;
  /** Turn the stored value into the chip's text, and the chip's text back (for stored numbers). */
  toChip?: (value: unknown) => Choice | null;
  fromChip?: (value: Choice) => unknown;
}

export function ChipsField<V extends FieldValues, O extends FieldValues, Choice extends string>({
  control,
  name,
  legend,
  hideLegend,
  required,
  options,
  onPick,
  toChip,
  fromChip,
  className,
}: ChipsFieldProps<V, O, Choice>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={className}
          label={hideLegend ? <span className="sr-only">{legend}</span> : legend}
          required={required}
        >
          <FormControl>
            <ChipGroup
              options={options}
              value={toChip ? toChip(field.value) : asValue<Choice | null>(field.value)}
              onChange={(value) => {
                field.onChange(fromChip ? fromChip(value) : value);
                onPick?.(value);
              }}
            />
          </FormControl>
          <FormMessage className="w-full basis-full" />
        </FormItem>
      )}
    />
  );
}

interface SwitchFieldProps<V extends FieldValues, O extends FieldValues> extends BaseProps<V, O> {
  label: string;
  hint?: string;
}

/** The On/Off switch of an assessment or a measurement (BR-REC-66: off, never deleted). */
export function SwitchField<V extends FieldValues, O extends FieldValues>({
  control,
  name,
  label,
  hint,
  className,
}: SwitchFieldProps<V, O>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className ?? 'col-span-full'}>
          <SwitchRow
            label={label}
            hint={hint}
            checked={asValue<boolean>(field.value)}
            onChange={field.onChange}
            name={field.name}
          />
        </FormItem>
      )}
    />
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  name,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name: string;
}) {
  const ids = useItemIds();
  const hintId = `${ids?.id}-hint`;
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <FieldContent>
        <FieldLabel htmlFor={ids?.id}>{label}</FieldLabel>
        {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      </FieldContent>
      <Switch
        id={ids?.id}
        name={name}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
        aria-describedby={hint ? hintId : undefined}
      />
    </div>
  );
}
