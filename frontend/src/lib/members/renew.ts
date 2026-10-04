import { addDays, type IsoDate } from '@/lib/domain/dates';
import type { Plan } from '@/lib/domain/membership';

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
