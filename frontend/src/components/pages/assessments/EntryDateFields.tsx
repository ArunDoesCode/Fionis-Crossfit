'use client';

import ChoiceChips from '@/components/common/ChoiceChips';
import DateField from '@/components/common/DateField';
import { FormControl, FormField, FormGrid, FormItem } from '@/components/common/form';
import StatusBadge from '@/components/common/StatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import type { EntryControl } from '@/lib/assessments/entryErrors';
import { assessmentDateLabel, entryDateIssue } from '@/lib/assessments/labels';
import { paperColumnDate } from '@/lib/assessments/paperColumns';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { useDeferredDate } from '@/lib/assessments/useDeferredDate';

const COLUMNS = [1, 2, 3, 4] as const;
const COLUMN_OPTIONS = COLUMNS.map((column) => ({ value: `q${column}`, label: `Q${column}` }));

interface EntryDateFieldsProps {
  control: EntryControl;
  date: string;
  isEstimated: boolean;
  /** The saved assessment shown in the form, or null. */
  opened: { assessmentId: string; isEstimated: boolean } | null;
  member: { fullName: string; joinedOn: string };
  today: string;
  /** Another date (and, for a paper column, About ticked). */
  onMoveToDate: (date: string, estimated?: boolean) => void;
}

// The date, About and the paper-column chips (BR-REC-19, 79, 80, 83). A date after today is refused with the
// sentence of DATE_IN_FUTURE; one before the join date only warns. Q1–Q4 set the date to the join date + 0 / 3
// / 6 / 9 months and tick About; the chosen chip shows only while both still match. The typed date reaches
// the form when the box is left or a finished date has stood still for 300 ms (R-6), not on every key.
// The date box is the plain DateField until the date picker slice (U3) replaces it.
export default function EntryDateFields({
  control,
  date: current,
  isEstimated,
  opened,
  member,
  today,
  onMoveToDate,
}: EntryDateFieldsProps) {
  const issue = entryDateIssue({
    date: current,
    today,
    joinedOn: member.joinedOn,
    memberName: member.fullName,
  });
  const chosen = COLUMNS.find(
    (column) => isEstimated && paperColumnDate(member.joinedOn, column) === current,
  );
  const date = useDeferredDate(current, (picked) => onMoveToDate(picked));

  return (
    <div className="flex flex-col gap-2">
      <FormGrid maxCols={1}>
        <FormField
          control={control}
          name="date"
          render={({ fieldState }) => (
            <FormItem>
              <div ref={date.boxRef}>
                <DateField
                  id="assess-date"
                  label={ASSESSMENT_TEXT.date}
                  value={date.shown}
                  max={today}
                  onChange={date.change}
                  error={fieldState.error?.message}
                />
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="isEstimated"
          render={({ field }) => (
            <FormItem label={ASSESSMENT_TEXT.about}>
              <FormControl>
                <Checkbox
                  aria-label={ASSESSMENT_TEXT.about}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </FormGrid>
      {opened && (
        <div>
          <StatusBadge tone="neutral">
            {ASSESSMENT_TEXT.editing(assessmentDateLabel(current, opened.isEstimated, today))}
          </StatusBadge>
        </div>
      )}
      {issue.kind === 'before_join' && (
        <p role="status" className="text-sm text-warning">
          {issue.message}
        </p>
      )}
      <ChoiceChips
        legend={ASSESSMENT_TEXT.paperColumn}
        options={COLUMN_OPTIONS}
        value={chosen ? `q${chosen}` : null}
        onChange={(value) =>
          onMoveToDate(
            paperColumnDate(member.joinedOn, Number(value.slice(1)) as 1 | 2 | 3 | 4),
            true,
          )
        }
      />
    </div>
  );
}
