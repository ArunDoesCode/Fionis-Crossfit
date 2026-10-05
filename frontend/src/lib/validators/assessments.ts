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
// 0-599 and seconds 0-59, a % measurement from 0 to 100 (BR-REC-230), and a date that is picked and not after today.

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

// A % measurement below 0 or above 100 is a field error, never a "Please check" the user can save anyway
// (BR-REC-230).
const PERCENT_MIN = 0;
const PERCENT_MAX = 100;
const isPercent = (metric: EntryMetric): boolean => metric.unit.trim() === '%';
const percentRange = z
  .number()
  .min(PERCENT_MIN, { error: ASSESSMENT_TEXT.percentRange })
  .max(PERCENT_MAX, { error: ASSESSMENT_TEXT.percentRange })
  .nullable();

export interface EntrySchemaContext {
  metrics: EntryMetric[];
  today: string;
  member: { fullName: string; joinedOn: string };
}

// A box that was never set is a blank box: the schema never answers with the library's own message (BR-REC-189).
const orBlank = <Out, In>(blank: In, schema: z.ZodType): z.ZodType<Out, In> =>
  z.preprocess((value) => (value === undefined ? blank : value), schema) as unknown as z.ZodType<
    Out,
    In
  >;

/** The schema of one form: one entry per measurement, with that measurement's decimals. */
export function entrySchema({ metrics, today, member }: EntrySchemaContext) {
  const shape: Record<string, z.ZodType<number | null, FieldText>> = {};
  for (const metric of metrics) {
    shape[metric.id] =
      metric.datatype === 'duration'
        ? orBlank<number | null, FieldText>({ min: '', sec: '' }, durationSchema)
        : orBlank<number | null, FieldText>(
            '',
            isPercent(metric)
              ? optionalNumberFromText(asDecimals(metric.decimals)).pipe(percentRange)
              : optionalNumberFromText(asDecimals(metric.decimals)),
          );
  }
  const date = z.string().superRefine((day, ctx) => {
    if (!isIsoDate(day)) {
      ctx.issues.push({ code: 'custom', message: ASSESSMENT_TEXT.datePick, input: day });
      return;
    }
    const issue = entryDateIssue({
      date: day,
      today,
      joinedOn: member.joinedOn,
      memberName: member.fullName,
    });
    if (issue.kind === 'future') {
      ctx.issues.push({ code: 'custom', message: issue.message ?? '', input: day });
    }
  });
  return z.object({
    date: orBlank<string, string>('', date),
    isEstimated: orBlank<boolean, boolean>(false, z.boolean()),
    values: orBlank<Record<string, number | null>, Record<string, FieldText>>({}, z.object(shape)),
  });
}
