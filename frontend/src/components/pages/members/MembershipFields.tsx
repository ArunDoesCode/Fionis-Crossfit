'use client';

import { useWatch } from 'react-hook-form';
import DatePicker from '@/components/common/DatePicker';
import { ChipGroup, FormControl, FormField, FormItem, FormMessage } from '@/components/common/form';
import type { PeriodFormControl } from '@/components/pages/members/memberFormControl';
import { formatDay } from '@/lib/format';
import { MEMBER_FIELD_LABELS } from '@/lib/members/formFields';
import { PLAN_LABELS } from '@/lib/members/membershipText';
import { entryEnd } from '@/lib/members/renew';
import { useToday } from '@/lib/members/useToday';
import { PLANS } from '@/lib/validators/members';

interface MembershipFieldsProps {
  control: PeriodFormControl;
  /** Called when the trainer changes "Starts on" by hand; until then it follows the join date (BR-REC-50). */
  onStartOnChange?: () => void;
}

const PLAN_OPTIONS = PLANS.map((value) => ({ value, label: PLAN_LABELS[value] }));

// S6 and S9 (BR-REC-05, 50, 51, 54): the plan and the start of one membership, as cells of the form's
// FormGrid. On Add no plan is pre-selected, the trainer picks one; "Starts on" begins as the join date and
// may be later but not before it. On Renew / Edit membership both start filled. The end date is worked out
// live so it can be checked before saving.
export default function MembershipFields({ control, onStartOnChange }: MembershipFieldsProps) {
  const today = useToday();
  const [plan, startOn] = useWatch({ control, name: ['plan', 'startOn'] });
  const chosen = PLANS.find((option) => option === plan);
  const end = entryEnd(plan, startOn);

  return (
    <>
      <FormField
        control={control}
        name="plan"
        render={({ field }) => (
          <FormItem label={MEMBER_FIELD_LABELS.plan} required>
            <FormControl>
              <ChipGroup
                options={PLAN_OPTIONS}
                value={chosen ?? null}
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
        name="startOn"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <DatePicker
                label={MEMBER_FIELD_LABELS.startOn}
                required
                value={field.value}
                today={today}
                onBlur={field.onBlur}
                onChange={(value) => {
                  onStartOnChange?.();
                  field.onChange(value);
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <p aria-live="polite" className="min-h-6 self-start pt-3 text-base font-medium">
        {end && `Ends ${formatDay(end)}`}
      </p>
    </>
  );
}
