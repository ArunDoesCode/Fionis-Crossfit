'use client';

import {
  FloatingLabel,
  FloatingLabelInput,
  FormControl,
  FormField,
  FormGrid,
  FormItem,
  FormMessage,
} from '@/components/common/form';
import ChipGroup from '@/components/pages/members/ChipGroup';
import type { MemberFormControl } from '@/components/pages/members/memberFormControl';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { MEMBER_FIELD_LABELS } from '@/lib/members/formFields';
import { OBJECTIVE_LABELS } from '@/lib/members/labels';
import { OBJECTIVES } from '@/lib/validators/members';

interface MoreDetailsFieldsProps {
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

const NOTES_ID = 'member-notes'; // the floating label points at it

// The optional fields go last under "More details", across both columns of the form (BR-REC-03, 188). The
// fields stay mounted while the block is closed (keepMounted); a failed Save opens it when a problem is inside.
export default function MoreDetailsFields({
  control,
  defaultOpen = false,
}: MoreDetailsFieldsProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="col-span-full flex flex-col gap-2">
      <CollapsibleTrigger className="group flex min-h-12 w-full cursor-pointer items-center text-left font-heading text-lg font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        More details
        <span
          aria-hidden="true"
          className="ml-2 text-muted-foreground group-data-panel-open:hidden"
        >
          +
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <FormGrid maxCols={2}>
          <FormField
            control={control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FloatingLabelInput
                    {...field}
                    value={field.value ?? ''}
                    label={MEMBER_FIELD_LABELS.email}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="objective"
            render={({ field }) => (
              <FormItem label={MEMBER_FIELD_LABELS.objective}>
                <FormControl>
                  <ChipGroup<GoalChoice>
                    options={GOAL_OPTIONS}
                    value={OBJECTIVES.find((option) => option === field.value) ?? 'none'}
                    onChange={(value) => field.onChange(value === 'none' ? '' : value)}
                  />
                </FormControl>
                <FormMessage className="w-full basis-full" />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="notes"
            render={({ field }) => (
              <FormItem className="col-span-full">
                <div className="relative">
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ''}
                      id={NOTES_ID}
                      placeholder=" "
                      rows={4}
                      className="peer min-h-28 pt-6"
                    />
                  </FormControl>
                  <FloatingLabel htmlFor={NOTES_ID} label={MEMBER_FIELD_LABELS.notes} />
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormGrid>
      </CollapsibleContent>
    </Collapsible>
  );
}
