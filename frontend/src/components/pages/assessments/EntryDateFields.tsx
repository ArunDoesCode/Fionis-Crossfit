'use client';

import type { Dispatch } from 'react';
import ChoiceChips from '@/components/common/ChoiceChips';
import DateField from '@/components/common/DateField';
import StatusBadge from '@/components/common/StatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import type { EntryAction, EntryState } from '@/lib/assessments/entryState';
import { dateDomId } from '@/lib/assessments/focusField';
import { assessmentDateLabel, entryDateIssue } from '@/lib/assessments/labels';
import { paperColumnDate } from '@/lib/assessments/paperColumns';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { useDeferredDate } from '@/lib/assessments/useDeferredDate';

const COLUMNS = [1, 2, 3, 4] as const;
const COLUMN_OPTIONS = COLUMNS.map((column) => ({ value: `q${column}`, label: `Q${column}` }));

interface EntryDateFieldsProps {
  formId: string;
  state: EntryState;
  member: { fullName: string; joinedOn: string };
  today: string;
  /** Save was tapped: an empty date says so next to its field (BR-REC-134). */
  attempted: boolean;
  dispatch: Dispatch<EntryAction>;
}

// The date, About and the paper-column chips (BR-REC-19, 79, 80, 83). A date after today is refused with the
// sentence of DATE_IN_FUTURE; one before the join date only warns. Q1–Q4 set the date to the join date + 0 / 3
// / 6 / 9 months and tick About; the chosen chip shows only while both still match. The typed date reaches
// the form when the box is left or a finished date has stood still for 300 ms (R-6), not on every key.
export default function EntryDateFields({
  formId,
  state,
  member,
  today,
  attempted,
  dispatch,
}: EntryDateFieldsProps) {
  const issue = entryDateIssue({
    date: state.date,
    today,
    joinedOn: member.joinedOn,
    memberName: member.fullName,
  });
  const chosen = COLUMNS.find(
    (column) => state.isEstimated && paperColumnDate(member.joinedOn, column) === state.date,
  );
  const aboutId = `${formId}-about`;
  const date = useDeferredDate(state.date, (picked) => dispatch({ type: 'date', date: picked }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-4">
        <div ref={date.boxRef} className="min-w-0 flex-1">
          <DateField
            id={dateDomId(formId)}
            label={ASSESSMENT_TEXT.date}
            value={date.shown}
            max={today}
            onChange={date.change}
            error={
              issue.kind === 'future'
                ? (issue.message ?? undefined)
                : attempted && state.date === ''
                  ? ASSESSMENT_TEXT.datePick
                  : undefined
            }
          />
        </div>
        <Field orientation="horizontal" className="mt-7 min-h-12 w-auto shrink-0 items-center">
          <Checkbox
            id={aboutId}
            checked={state.isEstimated}
            onCheckedChange={(checked) => dispatch({ type: 'estimated', value: checked })}
          />
          <FieldLabel htmlFor={aboutId} className="text-base font-normal">
            {ASSESSMENT_TEXT.about}
          </FieldLabel>
        </Field>
      </div>
      {state.opened && (
        <div>
          <StatusBadge tone="neutral">
            {ASSESSMENT_TEXT.editing(
              assessmentDateLabel(state.date, state.opened.isEstimated, today),
            )}
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
          dispatch({
            type: 'paper',
            date: paperColumnDate(member.joinedOn, Number(value.slice(1)) as 1 | 2 | 3 | 4),
          })
        }
      />
    </div>
  );
}
