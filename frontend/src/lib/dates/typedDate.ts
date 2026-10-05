import { type IsoDate, isIsoDate } from '@/lib/domain/dates';

// A day typed as `dd/mm/yyyy` (BR-REC-232): `-` or `.` may replace `/`, the day and month may have one digit,
// the year has four. Day first, never month first. Pure: no clock, no zone.

const TYPED_DAY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** The `YYYY-MM-DD` day for typed text, or `null` when the text is not a real day. */
export function parseTypedDate(text: string): IsoDate | null {
  const match = TYPED_DAY.exec(text.trim());
  if (!match) return null;
  const [, day = '', month = '', year = ''] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}
