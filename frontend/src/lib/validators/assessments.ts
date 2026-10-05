import { z } from 'zod';
import { entryDateIssue } from '@/lib/assessments/labels';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { asDecimals, type EntryMetric } from '@/lib/assessments/types';
import { isIsoDate } from '@/lib/domain/dates';
import { durationFromParts } from '@/lib/domain/duration';
import { durationStatus } from '@/lib/durationStatus';
import { optionalNumberFromText } from '@/lib/forms/zodNumber';
import { UI_TEXT } from '@/lib/messages/words';

// The Record assessment form (S10, BR-REC-76, 78, 82, 83): every box is typed text until Save and the schema
// turns it into the number (or seconds) the API takes. "Please check" values are warnings, never errors
// (BR-REC-21), so the only rules are: a readable number (±999,999,999.999 after rounding), a Time with minutes
// 0-599 and seconds 0-59, and a date that is picked and not after today.

/** The two Time boxes as typed. */
export interface DurationText {
  min: string;
  sec: string;
}
/** What one measurement's box holds: text (Number) or the two boxes (Time). */
export type FieldText = string | DurationText;

/** The form as typed: `values` by measurement id. */
export interface EntryFormInput {
  /** The picked day `YYYY-MM-DD`; empty after "Save & next date" until a new one is picked. */
  date: string;
  isEstimated: boolean;
  values: Record<string, FieldText>;
}
/** The form after the schema: `values` are numbers (a Time as seconds), `null` when blank. */
export interface EntryFormValues {
  date: string;
  isEstimated: boolean;
  values: Record<string, number | null>;
}

const durationSchema = z
  .object({ min: z.string(), sec: z.string() })
  .transform((text, ctx): number | null => {
    if (durationStatus(text.min, text.sec) === 'empty') return null;
    const seconds = durationFromParts(Number(text.min || '0'), Number(text.sec || '0'));
    if (seconds !== null) return seconds;
    const minutesBad = durationFromParts(Number(text.min || '0'), 0) === null;
    ctx.issues.push({
      code: 'custom',
      message: minutesBad ? UI_TEXT.minutesRange : UI_TEXT.secondsRange,
      input: text,
    });
    return z.NEVER;
  });

export interface EntrySchemaContext {
  metrics: EntryMetric[];
  today: string;
  member: { fullName: string; joinedOn: string };
}

/** The schema of one form: one entry per measurement, with that measurement's decimals. */
export function entrySchema({ metrics, today, member }: EntrySchemaContext) {
  const shape: Record<string, z.ZodType<number | null, FieldText>> = {};
  for (const metric of metrics) {
    shape[metric.id] =
      metric.datatype === 'duration'
        ? durationSchema
        : optionalNumberFromText(asDecimals(metric.decimals));
  }
  return z.object({
    date: z.string().superRefine((date, ctx) => {
      if (!isIsoDate(date)) {
        ctx.issues.push({ code: 'custom', message: ASSESSMENT_TEXT.datePick, input: date });
        return;
      }
      const issue = entryDateIssue({
        date,
        today,
        joinedOn: member.joinedOn,
        memberName: member.fullName,
      });
      if (issue.kind === 'future') {
        ctx.issues.push({ code: 'custom', message: issue.message ?? '', input: date });
      }
    }),
    isEstimated: z.boolean(),
    values: z.object(shape),
  });
}
