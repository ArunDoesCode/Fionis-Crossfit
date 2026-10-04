import { parseAsString } from 'nuqs/server';
import { isIsoDate } from '@/lib/domain/dates';

/** `?type=` (the assessment) and `?date=` of `/admin/members/[memberId]/assess` (S10). */
export const entryParams = {
  type: parseAsString,
  date: parseAsString,
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The assessment id when the address holds a well-formed one; anything else is "not picked yet". */
export const typeFromParam = (type: string | null): string | null =>
  type !== null && GUID.test(type) ? type : null;

/** The date in the address when it is a real day, else the fallback (today). */
export const dateFromParam = (date: string | null, fallback: string): string =>
  date !== null && isIsoDate(date) ? date : fallback;
