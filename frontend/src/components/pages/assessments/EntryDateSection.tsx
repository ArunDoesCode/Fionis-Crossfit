'use client';

import ChoiceChips from '@/components/common/ChoiceChips';
import DatePicker from '@/components/common/DatePicker';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/common/form';
import StatusBadge from '@/components/common/StatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import type { EntryControl } from '@/lib/assessments/entryErrors';
import { assessmentDateLabel, entryDateIssue } from '@/lib/assessments/labels';
import { paperColumnDate } from '@/lib/assessments/paperColumns';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';

const COLUMNS = [1, 2, 3, 4] as const;
const COLUMN_OPTIONS = COLUMNS.map((column) => ({ value: `q${column}`, label: `Q${column}` }));

interface EntryDateSectionProps {
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

// The first row of the grid: date, About and the paper-column chips (BR-REC-19, 216, 79, 80, 83). A date after today is refused with the
// sentence of DATE_IN_FUTURE; one before the join date only warns. Q1–Q4 set the date to the join date + 0 / 3
// / 6 / 9 months and tick About; the chosen chip shows only while both still match. The picked date goes
// straight to the session (`onMoveToDate`).
export default function EntryDateSection({
  control,
  date: current,
  isEstimated,
  opened,
  member,
  today,
  onMoveToDate,
}: EntryDateSectionProps) {
  const issue = entryDateIssue({
    date: current,
    today,
    joinedOn: member.joinedOn,
    memberName: member.fullName,
  });
  const chosen = COLUMNS.find(
    (column) => isEstimated && paperColumnDate(member.joinedOn, column) === current,
  );

  return (
    <>
      <FormField
        control={control}
        name="date"
        render={() => (
          <FormItem>
            <FormControl>
              <DatePicker
                id="assess-date"
                label={ASSESSMENT_TEXT.date}
                value={current}
                max={today}
                today={today}
                onChange={(picked) => onMoveToDate(picked)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="isEstimated"
        render={({ field }) => (
          <FormItem label={ASSESSMENT_TEXT.about}>
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
      <ChoiceChips
        className="@[30rem]:col-span-2"
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
      {opened && (
        <div className="col-span-full">
          <StatusBadge tone="neutral">
            {ASSESSMENT_TEXT.editing(assessmentDateLabel(current, opened.isEstimated, today))}
          </StatusBadge>
        </div>
      )}
      {issue.kind === 'before_join' && (
        <p role="status" className="col-span-full text-sm text-warning">
          {issue.message}
        </p>
      )}
    </>
  );
}
