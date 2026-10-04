'use client';

import { Controller } from 'react-hook-form';
import ChoiceChips from '@/components/common/ChoiceChips';
import type { MemberFormControl } from '@/components/pages/members/memberFormControl';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { fieldId } from '@/lib/members/formFields';
import { OBJECTIVE_LABELS } from '@/lib/members/labels';
import { OBJECTIVES } from '@/lib/validators/members';

interface MoreDetailsFieldsProps {
  formId: string;
  control: MemberFormControl;
  /** Start open (S8 when the member already has a goal, an email or notes). */
  defaultOpen?: boolean;
}

// "Not set" is a chip of its own: a goal that was picked can be cleared again (null clears, E19).
type GoalChoice = (typeof OBJECTIVES)[number] | 'none';
const GOAL_OPTIONS: { value: GoalChoice; label: string }[] = [
  { value: 'none', label: 'Not set' },
  ...OBJECTIVES.map((value) => ({ value, label: OBJECTIVE_LABELS[value] })),
];

const TEXTAREA =
  'min-h-28 w-full rounded-2xl border border-input px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20';

// The optional fields go last under "More details" (BR-REC-03, 134). The block is a native <details>, so
// its fields stay in the form while it is closed; Save opens it when a problem is inside.
export default function MoreDetailsFields({
  formId,
  control,
  defaultOpen = false,
}: MoreDetailsFieldsProps) {
  return (
    <details open={defaultOpen} className="group flex flex-col gap-4">
      <summary className="flex min-h-12 cursor-pointer list-none items-center font-heading text-lg font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        More details
        <span aria-hidden="true" className="ml-2 text-muted-foreground group-open:hidden">
          +
        </span>
      </summary>
      <div className="flex flex-col gap-4">
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId(formId, 'email')}>Email</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ''}
                id={fieldId(formId, 'email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.error ? `${fieldId(formId, 'email')}-error` : undefined
                }
              />
              <div className="min-h-5">
                <FieldError id={`${fieldId(formId, 'email')}-error`} errors={[fieldState.error]} />
              </div>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="objective"
          render={({ field, fieldState }) => (
            <div id={fieldId(formId, 'objective')}>
              <ChoiceChips<GoalChoice>
                legend="Goal"
                options={GOAL_OPTIONS}
                value={OBJECTIVES.find((option) => option === field.value) ?? 'none'}
                onChange={(value) => field.onChange(value === 'none' ? '' : value)}
                error={fieldState.error?.message}
              />
            </div>
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId(formId, 'notes')}>Notes</FieldLabel>
              <textarea
                {...field}
                value={field.value ?? ''}
                id={fieldId(formId, 'notes')}
                data-slot="input"
                rows={4}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.error ? `${fieldId(formId, 'notes')}-error` : undefined
                }
                className={TEXTAREA}
              />
              <div className="min-h-5">
                <FieldError id={`${fieldId(formId, 'notes')}-error`} errors={[fieldState.error]} />
              </div>
            </Field>
          )}
        />
      </div>
    </details>
  );
}
