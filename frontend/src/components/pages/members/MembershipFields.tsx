'use client';

import { type Control, Controller, useWatch } from 'react-hook-form';
import ChoiceChips from '@/components/common/ChoiceChips';
import MemberDateField from '@/components/pages/members/MemberDateField';
import { type IsoDate, isIsoDate } from '@/lib/domain/dates';
import { membershipEnd } from '@/lib/domain/membership';
import { formatDayWithYear } from '@/lib/members/dayText';
import { fieldId } from '@/lib/members/formFields';
import { PLAN_LABELS } from '@/lib/members/membershipText';
import { type MemberFormInput, type MemberFormValues, PLANS } from '@/lib/validators/members';

interface MembershipFieldsProps {
  formId: string;
  control: Control<MemberFormInput, unknown, MemberFormValues>;
  /** Called when the trainer changes "Starts on" by hand; until then it follows the join date (BR-REC-50). */
  onStartOnChange: () => void;
}

const PLAN_OPTIONS = PLANS.map((value) => ({ value, label: PLAN_LABELS[value] }));

// S6 only (BR-REC-05, 50, 51): the first membership. No plan is pre-selected, the trainer picks one;
// "Starts on" begins as the join date and may be later but not before it; the end date is worked out
// live so it can be checked before saving (BR-REC-54).
export default function MembershipFields({
  formId,
  control,
  onStartOnChange,
}: MembershipFieldsProps) {
  const [plan, startOn] = useWatch({ control, name: ['plan', 'startOn'] });
  const chosen = PLANS.find((option) => option === plan);
  const end: IsoDate | null = chosen && isIsoDate(startOn) ? membershipEnd(chosen, startOn) : null;

  return (
    <>
      <Controller
        control={control}
        name="plan"
        render={({ field, fieldState }) => (
          <div id={fieldId(formId, 'plan')}>
            <ChoiceChips
              legend="Membership"
              required
              options={PLAN_OPTIONS}
              value={chosen ?? null}
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
        name="startOn"
        render={({ field, fieldState }) => (
          <MemberDateField
            id={fieldId(formId, 'startOn')}
            label="Starts on"
            required
            value={field.value}
            onChange={(value) => {
              onStartOnChange();
              field.onChange(value);
            }}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      <p aria-live="polite" className="-mt-2 min-h-6 text-base font-medium">
        {end && `Ends ${formatDayWithYear(end)}`}
      </p>
    </>
  );
}
