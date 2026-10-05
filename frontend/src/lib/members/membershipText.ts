import type { IsoDate } from '@/lib/domain/dates';
import { formatDay, formatRelativeDay } from '@/lib/format';
import { WORDS } from '@/lib/messages/words';
import { type StatusTone, toneFor } from '@/lib/statusTone';
import type { MemberListItem, MembershipStatus, Plan } from './types';

/** BR-REC-59: the plan words on screen. */
export const PLAN_LABELS: Record<Plan, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_annual: 'Half-annual',
  annual: 'Annual',
};

export interface MembershipStatusText {
  label: 'Active' | 'Ends soon' | 'Ended';
  detail: string;
  tone: StatusTone;
}

const daysLeftText = (daysLeft: number): string =>
  `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;

/**
 * BR-REC-52, 59: the status words of the member page. The label and colour follow the status from
 * the API; the detail is the plain sentence next to it ("Ends in 7 days", "Ended yesterday",
 * "Starts 20 Oct", "241 days left").
 */
export const membershipStatusText = (
  m: { status: MembershipStatus; startOn?: IsoDate; endOn: IsoDate; daysLeft: number },
  today: IsoDate,
): MembershipStatusText => {
  if (m.status === 'expired') {
    return {
      label: WORDS.ended,
      detail: `Ended ${formatRelativeDay(m.endOn, today)}`,
      tone: toneFor('ended'),
    };
  }
  if (m.status === 'expiring') {
    return {
      label: WORDS.endsSoon,
      detail: `Ends ${formatRelativeDay(m.endOn, today)}`,
      tone: toneFor('ending'),
    };
  }
  const notStarted = m.startOn !== undefined && m.startOn > today;
  return {
    label: 'Active',
    detail: notStarted && m.startOn ? `Starts ${formatDay(m.startOn)}` : daysLeftText(m.daysLeft),
    tone: toneFor('active'),
  };
};

/** BR-REC-125: the badge at the right of a Members row. Archived wins over the membership status. */
export const memberListBadge = (
  item: Pick<MemberListItem, 'archivedAt' | 'membership'>,
  today: IsoDate,
): { text: string; tone: StatusTone } => {
  if (item.archivedAt) return { text: 'Archived', tone: toneFor('archived') };
  const { status, endOn } = item.membership;
  if (status === 'expired') return { text: WORDS.ended, tone: toneFor('ended') };
  if (status === 'expiring')
    return { text: `Ends ${formatRelativeDay(endOn, today)}`, tone: toneFor('ending') };
  return { text: 'Active', tone: toneFor('active') };
};
