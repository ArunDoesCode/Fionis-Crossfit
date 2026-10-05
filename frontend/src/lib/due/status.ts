import type { IsoDate } from '@/lib/domain/dates';
import { formatDay } from '@/lib/format';
import { WORDS } from '@/lib/messages/words';
import { type StatusTone, toneFor } from '@/lib/statusTone';
import { DUE_TEXT } from './text';
import type { DueTab, MemberDueItem } from './types';

export type { StatusTone };

export interface DueStatus {
  /** The words of the badge (BR-REC-125: never colour alone). */
  text: string;
  /** Picks the badge's colour and icon. */
  tone: StatusTone;
}

const overdueText = (days: number): string =>
  days === 1 ? 'Overdue 1 day' : `Overdue ${days} days`;

// `daysOverdue` is calendar days from the due date to today (BR-REC-105): 2 = due 2 days ago, 0 = due
// today, negative = due later. The API sends the number; the screen says exactly that number.
function byDays(daysOverdue: number): DueStatus {
  if (daysOverdue >= 1) return { text: overdueText(daysOverdue), tone: toneFor('overdue') };
  if (daysOverdue === 0) return { text: 'Due today', tone: toneFor('soon') };
  if (daysOverdue === -1) return { text: 'Due tomorrow', tone: toneFor('soon') };
  return { text: `Due in ${-daysOverdue} days`, tone: toneFor('soon') };
}

/** The words at the right of a Home / Due list row (BR-REC-96, 105, 125, 127). Assess soon wins over the dates. */
export function dueRowStatus(row: { flagged: boolean; daysOverdue: number }): DueStatus {
  return row.flagged ? { text: WORDS.assessSoon, tone: toneFor('soon') } : byDays(row.daysOverdue);
}

/**
 * The one status of an assessment on the member page (BR-REC-103, C10), the first that applies: Assess soon,
 * Reminder on a day, Never recorded, Overdue N days, Due today / tomorrow / in N days, Next due a day.
 * `today` decides whether a day shows its year (BR-REC-127).
 */
export function memberDueStatus(item: MemberDueItem, today: IsoDate): DueStatus {
  if (item.flagged) return { text: WORDS.assessSoon, tone: toneFor('soon') };
  if (item.snoozedUntil) {
    return {
      text: `Reminder on ${formatDay(item.snoozedUntil, today)}`,
      tone: toneFor('reminder'),
    };
  }
  if (item.neverRecorded) {
    return {
      text: 'Never recorded',
      tone: toneFor(item.state === 'overdue' ? 'overdue' : 'neverRecorded'),
    };
  }
  if (item.state === 'ok') {
    return { text: `Next due ${formatDay(item.nextDueOn, today)}`, tone: toneFor('active') };
  }
  return byDays(item.daysOverdue);
}

/** One sentence when a section or list has nobody (BR-REC-101, 130). */
export const emptyDueLine = (tab: DueTab): string => DUE_TEXT.empty[tab];
