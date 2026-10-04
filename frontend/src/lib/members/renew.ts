import { addDays, type IsoDate, isIsoDate } from '@/lib/domain/dates';
import { membershipEnd, type Plan } from '@/lib/domain/membership';

interface PeriodDates {
  startOn: IsoDate;
  endOn: IsoDate;
}

/**
 * BR-REC-54, 09: Renew opens with the last plan and a start one day after the last end. "Last" is the
 * period with the latest start, whatever order the list comes in. A member always has a first period.
 */
export const renewDefaults = (
  periods: readonly (PeriodDates & { plan: Plan })[],
): { plan: Plan; startOn: IsoDate } => {
  let latest = periods[0];
  for (const period of periods) {
    if (latest && period.startOn > latest.startOn) latest = period;
  }
  if (!latest) throw new Error('A member has at least one membership period');
  return { plan: latest.plan, startOn: addDays(latest.endOn, 1) };
};

/**
 * BR-REC-58: saving a period that covers today brings an archived member back. Old binder entries
 * (all in the past) and later starts never do.
 */
export const renewRestoresMember = (
  archived: boolean,
  period: PeriodDates,
  today: IsoDate,
): boolean => archived && period.startOn <= today && today <= period.endOn;

const PLAN_VALUES: readonly Plan[] = ['monthly', 'quarterly', 'half_annual', 'annual'];

/**
 * The end of the membership being typed (BR-REC-51, 54): null until a plan is chosen and the start is a
 * real day. The Add, Renew and Edit forms hold plain text, so this takes what the form has.
 */
export const entryEnd = (plan: string, startOn: string): IsoDate | null => {
  const chosen = PLAN_VALUES.find((option) => option === plan);
  return chosen && isIsoDate(startOn) ? membershipEnd(chosen, startOn) : null;
};
