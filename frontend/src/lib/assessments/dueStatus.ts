import { daysBetween } from '@/lib/domain/dates';
import { formatDay } from '@/lib/format';
import { WORDS } from '@/lib/messages/words';
import type { MemberDueRow } from './types';

// The status words of the choose sheet and the "due" tags (BR-REC-73, 103), from the due rows E32 answers.
// Pure; the due-list stream has its own words for Home and the member page.

const days = (count: number): string => `${count} ${count === 1 ? 'day' : 'days'}`;

/** "Assess soon", "Reminder on 20 Oct", "Never recorded", "Overdue 34 days", "Due in 5 days", "Next due 12 Dec". */
export function dueStatusText(row: MemberDueRow, today: string): string {
  if (row.flagged) return WORDS.assessSoon;
  if (row.snoozedUntil) return `Reminder on ${formatDay(row.snoozedUntil, today)}`;
  if (row.neverRecorded) return 'Never recorded';
  if (row.state === 'overdue') {
    return row.daysOverdue > 0 ? `Overdue ${days(row.daysOverdue)}` : 'Due today';
  }
  if (row.state === 'upcoming') {
    const left = daysBetween(today, row.nextDueOn);
    if (left <= 0) return 'Due today';
    return left === 1 ? 'Due tomorrow' : `Due in ${days(left)}`;
  }
  return `Next due ${formatDay(row.nextDueOn, today)}`;
}

/** The measurements of one assessment that are due now (they carry the "due" tag). */
export function dueMetricIds(rows: MemberDueRow[] | undefined, typeId: string): Set<string> {
  const row = rows?.find((candidate) => candidate.typeId === typeId);
  return new Set(row?.items.map((item) => item.metricId) ?? []);
}
