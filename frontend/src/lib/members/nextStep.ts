import type { MemberDueItem } from '@/lib/due/types';
import type { MembershipStatus } from './types';

/** The two buttons of the banner. */
export const NEXT_STEP_TEXT = { record: 'Record now', renew: 'Renew' } as const;

export interface NextStep {
  /** `record` = [Record now] (an overdue assessment); `renew` = [Renew] (membership ended or ends soon). */
  kind: 'record' | 'renew';
  text: string;
}

interface NextStepInput {
  /** The member's most overdue assessment; `null` when none is overdue. */
  overdue: { assessmentName: string; daysOverdue: number } | null;
  membershipStatus: MembershipStatus;
  /** The membership's last day, already written ("31 May 2026"): added to the Renew line when given. */
  endOn?: string;
}

/**
 * BR-REC-224: the one banner under the member's name. An overdue assessment ("Body composition overdue
 * 34 days") wins over a membership that ended or ends soon; an active membership with nothing overdue
 * has no banner.
 */
export function nextStepFor({ overdue, membershipStatus, endOn }: NextStepInput): NextStep | null {
  if (overdue) {
    const days = overdue.daysOverdue;
    return {
      kind: 'record',
      text: `${overdue.assessmentName} overdue ${days} ${days === 1 ? 'day' : 'days'}`,
    };
  }
  const on = endOn ? ` ${endOn}` : '';
  if (membershipStatus === 'expired') return { kind: 'renew', text: `Membership ended${on}` };
  if (membershipStatus === 'expiring') {
    return { kind: 'renew', text: endOn ? `Membership ends ${endOn}` : 'Membership ends soon' };
  }
  return null;
}

/**
 * The member's most overdue assessment from the E32 lines (BR-REC-224): late by the dates only
 * (`state` = overdue; a flagged "Assess soon" line that is not late does not count, one that is late
 * does), never-recorded lines count when their dates say overdue, a "Remind me later" line does not.
 * Equal days: the first line wins, and E32 lists them in setup order. `null` when there is none.
 */
export function mostOverdue(
  lines: readonly MemberDueItem[],
): { typeId: string; assessmentName: string; daysOverdue: number } | null {
  let worst: MemberDueItem | null = null;
  for (const line of lines) {
    if (line.state !== 'overdue' || line.daysOverdue < 1 || line.snoozedUntil) continue;
    if (!worst || line.daysOverdue > worst.daysOverdue) worst = line;
  }
  return (
    worst && {
      typeId: worst.typeId,
      assessmentName: worst.typeName,
      daysOverdue: worst.daysOverdue,
    }
  );
}
