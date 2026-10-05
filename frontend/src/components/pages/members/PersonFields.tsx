'use client';

import { useWatch } from 'react-hook-form';
import DatePicker from '@/components/common/DatePicker';
import {
  ChipGroup,
  FloatingLabelInput,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/common/form';
import type { MemberFormControl } from '@/components/pages/members/memberFormControl';
import PhoneField from '@/components/pages/members/PhoneField';
import { shiftYear } from '@/lib/dates/month';
import type { IsoDate } from '@/lib/domain/dates';
import { birthDateWarning } from '@/lib/members/dateWarning';
import { MEMBER_FIELD_LABELS } from '@/lib/members/formFields';
import { SEX_LABELS } from '@/lib/members/labels';
import { SEXES } from '@/lib/validators/members';

interface PersonFieldsProps {
  control: MemberFormControl;
  /** The day after which no date may be picked (BR-REC-48). */
  today: IsoDate;
  /** The member being edited (S8): their own phone is not a duplicate. */
  selfId?: string;
  /** S6 uses this to keep "Starts on" equal to the join date until it is changed on its own. */
  onJoinedOnChange?: (value: string) => void;
}

/** The oldest birth year the picker offers (BR-REC-192). */
const BIRTH_FROM_YEAR = 1900;

const SEX_OPTIONS = SEXES.map((value) => ({ value, label: SEX_LABELS[value] }));

// The fields S6 and S8 share (BR-REC-03, 45, 46, 48, 49): full name, phone, date of birth, sex, joined on.
// They are cells of the form's FormGrid, in this order; required ones are marked *, each is checked when
// it is left (BR-REC-189).
export default function PersonFields({
  control,
  today,
  selfId,
  onJoinedOnChange,
}: PersonFieldsProps) {
  const dateOfBirth = useWatch({ control, name: 'dateOfBirth' });
  const warning = birthDateWarning(dateOfBirth, today);

  return (
    <>
      <FormField
        control={control}
        name="fullName"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <FloatingLabelInput
                {...field}
                label={MEMBER_FIELD_LABELS.fullName}
                required
                autoComplete="name"
                autoCapitalize="words"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <PhoneField control={control} selfId={selfId} />

      <FormField
        control={control}
        name="dateOfBirth"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormControl>
              <DatePicker
                label={MEMBER_FIELD_LABELS.dateOfBirth}
                required
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                max={today}
                today={today}
                yearRange={{ from: BIRTH_FROM_YEAR, to: Number(today.slice(0, 4)) }}
                defaultMonth={shiftYear(today.slice(0, 7), -30)}
              />
            </FormControl>
            <FormMessage />
            {!fieldState.error && warning && (
              <p role="status" className="text-sm text-warning">
                {warning}
              </p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="sex"
        render={({ field }) => (
          <FormItem label={MEMBER_FIELD_LABELS.sex} required>
            <FormControl>
              <ChipGroup
                options={SEX_OPTIONS}
                value={SEXES.find((option) => option === field.value) ?? null}
                onChange={(value) => {
                  field.onChange(value);
                  field.onBlur();
                }}
              />
            </FormControl>
            <FormMessage className="w-full basis-full" />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="joinedOn"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <DatePicker
                label={MEMBER_FIELD_LABELS.joinedOn}
                required
                value={field.value}
                max={today}
                today={today}
                onBlur={field.onBlur}
                onChange={(value) => {
                  field.onChange(value);
                  onJoinedOnChange?.(value);
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
