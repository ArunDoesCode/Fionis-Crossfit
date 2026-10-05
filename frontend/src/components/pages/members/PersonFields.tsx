'use client';

import { Alert02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';
import { type Control, useWatch } from 'react-hook-form';
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
import { useDuplicatePhone } from '@/lib/api/members/queries';
import { shiftYear } from '@/lib/dates/month';
import type { IsoDate } from '@/lib/domain/dates';
import { birthDateWarning } from '@/lib/members/dateWarning';
import { MEMBER_FIELD_LABELS } from '@/lib/members/formFields';
import { SEX_LABELS } from '@/lib/members/labels';
import { cleanPhone, type MemberEditFormInput, SEXES } from '@/lib/validators/members';

interface PhoneFieldProps {
  control: Control<MemberEditFormInput>;
  /** The member being edited: their own phone is not a duplicate (S8). */
  selfId?: string;
}

// BR-REC-47, 04: when the field is left with a valid phone, other members with the same last 10 digits are
// named under it ("Also used by Anita Rao · Open", archived ones marked). It informs and never blocks
// saving: families share phones. "Open" goes to that member in a new tab, so what is typed here stays.
function PhoneField({ control, selfId }: PhoneFieldProps) {
  const [checkedPhone, setCheckedPhone] = useState<string | null>(null);
  const { data: matches } = useDuplicatePhone(checkedPhone, selfId);

  return (
    <FormField
      control={control}
      name="phone"
      render={({ field, fieldState }) => (
        <FormItem>
          <FormControl>
            <FloatingLabelInput
              {...field}
              label={MEMBER_FIELD_LABELS.phone}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              onBlur={() => {
                field.onBlur();
                setCheckedPhone(cleanPhone(field.value));
              }}
            />
          </FormControl>
          <FormMessage />
          {!fieldState.error && matches && matches.length > 0 && (
            <p role="status" className="flex items-start gap-2 text-sm text-warning">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                Also used by{' '}
                {matches.map((match, index) => (
                  <span key={match.id}>
                    {index > 0 && ', '}
                    {match.label} ·{' '}
                    <a
                      href={`/admin/members/${match.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                    >
                      Open<span className="sr-only"> {match.label}, opens in a new tab</span>
                    </a>
                  </span>
                ))}
              </span>
            </p>
          )}
        </FormItem>
      )}
    />
  );
}

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
