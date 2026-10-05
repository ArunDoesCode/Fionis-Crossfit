import { daysBetween } from '@/lib/domain/dates';
import { formatDay } from '@/lib/format';
import { WORDS } from '@/lib/messages/words';
import { ASSESSMENT_TEXT } from './text';
import type { MemberDueRow } from './types';

// The status words of the choose sheet and the "due" tags (BR-REC-73, 103), from the due rows E32 answers.
// Pure; the due-list stream has its own words for Home and the member page.

/** "Assess soon", "Reminder on 20 Oct", "Never recorded", "Overdue 34 days", "Due in 5 days", "Next due 12 Dec". */
export function dueStatusText(row: MemberDueRow, today: string): string {
  if (row.flagged) return WORDS.assessSoon;
  if (row.snoozedUntil) return ASSESSMENT_TEXT.reminderOn(formatDay(row.snoozedUntil));
  if (row.neverRecorded) return ASSESSMENT_TEXT.neverRecorded;
  if (row.state === 'overdue') {
    return row.daysOverdue > 0
      ? ASSESSMENT_TEXT.overdue(ASSESSMENT_TEXT.dayCount(row.daysOverdue))
      : ASSESSMENT_TEXT.dueToday;
  }
  if (row.state === 'upcoming') {
    const left = daysBetween(today, row.nextDueOn);
    if (left <= 0) return ASSESSMENT_TEXT.dueToday;
    return left === 1
      ? ASSESSMENT_TEXT.dueTomorrow
      : ASSESSMENT_TEXT.dueIn(ASSESSMENT_TEXT.dayCount(left));
  }
  return ASSESSMENT_TEXT.nextDue(formatDay(row.nextDueOn));
}

/** The measurements of one assessment that are due now (they carry the "due" tag). */
export function dueMetricIds(rows: MemberDueRow[] | undefined, typeId: string): Set<string> {
  const row = rows?.find((candidate) => candidate.typeId === typeId);
  return new Set(row?.items.map((item) => item.metricId) ?? []);
}
