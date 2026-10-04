import { addDays, addMonths, daysBetween, type IsoDate, isIsoDate } from '@/lib/domain/dates';
import { messageForCode } from '@/lib/messages/errors';
import { DUE_TEXT } from './text';

/** The longest reminder E33 accepts (BR-REC-18, 99; C8): today + 90 days. */
export const REMIND_MAX_DAYS = 90;

export interface RemindChoice {
  label: string;
  until: IsoDate;
}

/**
 * "1 week", "2 weeks", "1 month" from `today` (BR-REC-99, 94): + 7 / + 14 days and the same day next month
 * (31 Jan -> 28 Feb). The API only ever sees the date.
 */
export function remindChoices(today: IsoDate): RemindChoice[] {
  return [
    { label: DUE_TEXT.remind.week, until: addDays(today, 7) },
    { label: DUE_TEXT.remind.twoWeeks, until: addDays(today, 14) },
    { label: DUE_TEXT.remind.month, until: addMonths(today, 1) },
  ];
}

/**
 * Why a picked date cannot be used, as one plain sentence, or null when E33 will take it (C8): after today and
 * at most today + 90 days. `''` is "nothing picked yet".
 */
export function remindDateIssue(until: IsoDate | '', today: IsoDate): string | null {
  if (!isIsoDate(until)) return DUE_TEXT.remind.pickIssue;
  const ahead = daysBetween(today, until);
  if (ahead <= 0) return DUE_TEXT.remind.afterTodayIssue;
  if (ahead > REMIND_MAX_DAYS) return messageForCode('SNOOZE_TOO_FAR');
  return null;
}
