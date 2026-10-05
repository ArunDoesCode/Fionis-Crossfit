import { isIsoDate } from '@/lib/domain/dates';
import { formatDay, formatMonthYear } from '@/lib/format';
import { messageForCode } from '@/lib/messages/errors';
import { ASSESSMENT_TEXT } from './text';

// The words around dates and counts on the assessment screens (BR-REC-80, 83, 84, 89). Pure.

/** "≈ Dec 2025" for an estimated date (month and year), else "12 Mar 2025". */
export function assessmentDateLabel(date: string, isEstimated: boolean, _today?: string): string {
  return isEstimated ? `≈ ${formatMonthYear(date)}` : formatDay(date);
}

const firstWord = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? '';

export interface EntryDateIssue {
  kind: 'future' | 'before_join' | null;
  message: string | null;
}

/**
 * A date after today cannot be saved (`future`, the text of `DATE_IN_FUTURE`); one before the join date only
 * warns (`before_join`: "This is before Surya joined (1 Jun 2025)"). A future date wins (BR-REC-83).
 */
export function entryDateIssue(input: {
  date: string;
  today: string;
  joinedOn: string;
  memberName: string;
}): EntryDateIssue {
  const { date, today, joinedOn, memberName } = input;
  if (!isIsoDate(date)) return { kind: null, message: null };
  if (date > today) return { kind: 'future', message: messageForCode('DATE_IN_FUTURE') };
  if (date < joinedOn) {
    const day = formatDay(joinedOn);
    return {
      kind: 'before_join',
      message: ASSESSMENT_TEXT.beforeJoin(firstWord(memberName), day),
    };
  }
  return { kind: null, message: null };
}

/** "15 results" / "1 result". */
export const resultCountLabel = (count: number): string => ASSESSMENT_TEXT.resultCount(count);

/**
 * "Saved 9 results for Surya" (the first word of the member's name, BR-REC-84). A partial save (`stillDue` above 0)
 * says what is left, with the full name: "Saved 3 for Naveen Kumar · 12 still due" (BR-REC-230).
 */
export const savedMessage = (count: number, memberName: string, stillDue = 0): string =>
  stillDue > 0
    ? ASSESSMENT_TEXT.savedPartly(count, memberName.trim(), stillDue)
    : ASSESSMENT_TEXT.savedResults(resultCountLabel(count), firstWord(memberName));
