'use client';

import { Controller, useWatch } from 'react-hook-form';
import ChoiceChips from '@/components/common/ChoiceChips';
import MemberDateField from '@/components/pages/members/MemberDateField';
import type { MemberFormControl } from '@/components/pages/members/memberFormControl';
import PhoneField from '@/components/pages/members/PhoneField';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { IsoDate } from '@/lib/domain/dates';
import { birthDateWarning } from '@/lib/members/dateWarning';
import { fieldId } from '@/lib/members/formFields';
import { SEX_LABELS } from '@/lib/members/labels';
import { SEXES } from '@/lib/validators/members';

interface PersonFieldsProps {
  formId: string;
  control: MemberFormControl;
  /** The day after which no date may be picked (BR-REC-48). */
  today: IsoDate;
  /** The member being edited (S8): their own phone is not a duplicate. */
  selfId?: string;
  /** S6 uses this to keep "Starts on" equal to the join date until it is changed on its own. */
  onJoinedOnChange?: (value: string) => void;
}

const SEX_OPTIONS = SEXES.map((value) => ({ value, label: SEX_LABELS[value] }));

// The fields S6 and S8 share (BR-REC-03, 45, 46, 48, 49): full name, phone, date of birth, sex, joined on.
// One column, label above, required ones marked *, checked when a field is left (BR-REC-134).
export default function PersonFields({
  formId,
  control,
  today,
  selfId,
  onJoinedOnChange,
}: PersonFieldsProps) {
  const dateOfBirth = useWatch({ control, name: 'dateOfBirth' });

  return (
    <>
      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={fieldId(formId, 'fullName')}>
              <span>
                Full name<span className="text-destructive"> *</span>
              </span>
            </FieldLabel>
            <Input
              {...field}
              id={fieldId(formId, 'fullName')}
              autoComplete="name"
              autoCapitalize="words"
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.error ? `${fieldId(formId, 'fullName')}-error` : undefined
              }
            />
            <div className="min-h-5">
              <FieldError id={`${fieldId(formId, 'fullName')}-error`} errors={[fieldState.error]} />
            </div>
          </Field>
        )}
      />

      <PhoneField id={fieldId(formId, 'phone')} control={control} selfId={selfId} />

      <Controller
        control={control}
        name="dateOfBirth"
        render={({ field, fieldState }) => (
          <MemberDateField
            id={fieldId(formId, 'dateOfBirth')}
            label="Date of birth"
            required
            value={field.value}
            max={today}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            warning={birthDateWarning(dateOfBirth, today) ?? undefined}
          />
        )}
      />

      <Controller
        control={control}
        name="sex"
        render={({ field, fieldState }) => (
          <div id={fieldId(formId, 'sex')}>
            <ChoiceChips
              legend="Sex"
              required
              options={SEX_OPTIONS}
              value={SEXES.find((option) => option === field.value) ?? null}
              onChange={(value) => {
                field.onChange(value);
                field.onBlur();
              }}
              error={fieldState.error?.message}
            />
          </div>
        )}
      />

      <Controller
        control={control}
        name="joinedOn"
        render={({ field, fieldState }) => (
          <MemberDateField
            id={fieldId(formId, 'joinedOn')}
            label="Joined on"
            required
            value={field.value}
            max={today}
            onChange={(value) => {
              field.onChange(value);
              onJoinedOnChange?.(value);
            }}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
    </>
  );
}
