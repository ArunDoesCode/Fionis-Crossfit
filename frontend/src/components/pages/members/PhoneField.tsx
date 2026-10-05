'use client';

import { Alert02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';
import type { Control } from 'react-hook-form';
import {
  FloatingLabelInput,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/common/form';
import { useDuplicatePhone } from '@/lib/api/members/queries';
import { MEMBER_FIELD_LABELS } from '@/lib/members/formFields';
import { cleanPhone, type MemberEditFormInput } from '@/lib/validators/members';

interface PhoneFieldProps {
  control: Control<MemberEditFormInput>;
  /** The member being edited: their own phone is not a duplicate (S8). */
  selfId?: string;
}

// BR-REC-47, 04: when the field is left with a valid phone, other members with the same last 10 digits are
// named under it ("Also used by Anita Rao · Open", archived ones marked). It informs and never blocks
// saving: families share phones. "Open" goes to that member in a new tab, so what is typed here stays.
export default function PhoneField({ control, selfId }: PhoneFieldProps) {
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
