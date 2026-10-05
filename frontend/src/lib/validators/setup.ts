import { z } from 'zod';
import '@/lib/validators/zodMessages';
import { exactNumberFromText } from '@/lib/forms/zodNumber';

// Mirrors backend/src/types/setup.types.ts (the server checks again). Limits, issue `path`s and messages are
// BR-REC-60 to 62 and the build clarifications C1, C2 of docs/specs/member-records/setup.md; messages are plain sentences that
// say what to do (BR-REC-128). Names and the report group are trimmed first, so the limits count the trimmed
// text (C1, C2). The unit is a label and is kept as typed (BR-REC-69).

export const INTERVAL_UNITS = ['week', 'month'] as const;
export const DATATYPES = ['number', 'duration'] as const;
export const BETTER_VALUES = ['higher', 'lower', 'none'] as const;
export const TABLE_PARTS = ['whole_body', 'arms', 'trunk', 'legs'] as const;

export type IntervalUnit = (typeof INTERVAL_UNITS)[number];
export type Datatype = (typeof DATATYPES)[number];
export type Better = (typeof BETTER_VALUES)[number];
export type TablePart = (typeof TABLE_PARTS)[number];

export const GYM_NAME_MIN = 2;
export const GYM_NAME_MAX = 60;
export const UPCOMING_LEAD_MAX = 30;
export const EXPIRY_LEAD_MAX = 60;
export const NAME_MIN = 2;
export const NAME_MAX = 40;
export const REPEAT_MIN = 1;
export const REPEAT_MAX = 24;
export const UNIT_MAX = 12;
export const DECIMALS_MAX = 2;
/** The check range fits `numeric(12,3)`: this much either way, bounds included. */
export const RANGE_BOUND = 999_999_999.999;

const MESSAGES = {
  gymNameEmpty: 'Enter the gym name',
  gymName: `Use ${GYM_NAME_MIN} to ${GYM_NAME_MAX} characters`,
  timezone: 'Use a time zone name',
  upcomingLeadDays: `Use 0 to ${UPCOMING_LEAD_MAX} days`,
  expiryLeadDays: `Use 0 to ${EXPIRY_LEAD_MAX} days`,
  wholeDays: 'Use a whole number of days',
  name: `Use ${NAME_MIN} to ${NAME_MAX} characters`,
  repeatCount: `Use ${REPEAT_MIN} to ${REPEAT_MAX}`,
  repeatUnit: 'Pick weeks or months',
  unit: `Use at most ${UNIT_MAX} characters`,
  decimals: 'Use 0, 1 or 2',
  bound: 'Use a number up to 999,999,999.999 either way',
  range: 'Below must be smaller than above',
  repeatPair: 'Set both the repeat number and unit, or neither',
  tablePair: 'Set both the report group and part, or neither',
  kind: 'Pick Number or Time',
  better: 'Pick which is better',
  tablePart: 'Pick a part',
} as const;

export const gymSettingsSchema = z.object({
  gymName: z
    .string({ error: MESSAGES.gymName })
    .trim()
    .min(1, { error: MESSAGES.gymNameEmpty })
    .min(GYM_NAME_MIN, { error: MESSAGES.gymName })
    .max(GYM_NAME_MAX, { error: MESSAGES.gymName }),
  timezone: z.string({ error: MESSAGES.timezone }).min(1, { error: MESSAGES.timezone }),
  upcomingLeadDays: exactNumberFromText(0, false).pipe(
    z
      .number({ error: MESSAGES.upcomingLeadDays })
      .int({ error: MESSAGES.wholeDays })
      .min(0, { error: MESSAGES.upcomingLeadDays })
      .max(UPCOMING_LEAD_MAX, { error: MESSAGES.upcomingLeadDays }),
  ),
  expiryLeadDays: exactNumberFromText(0, false).pipe(
    z
      .number({ error: MESSAGES.expiryLeadDays })
      .int({ error: MESSAGES.wholeDays })
      .min(0, { error: MESSAGES.expiryLeadDays })
      .max(EXPIRY_LEAD_MAX, { error: MESSAGES.expiryLeadDays }),
  ),
});

const itemName = z
  .string({ error: MESSAGES.name })
  .trim()
  .min(NAME_MIN, { error: MESSAGES.name })
  .max(NAME_MAX, { error: MESSAGES.name });

const repeatRange = z
  .number({ error: MESSAGES.repeatCount })
  .int({ error: MESSAGES.repeatCount })
  .min(REPEAT_MIN, { error: MESSAGES.repeatCount })
  .max(REPEAT_MAX, { error: MESSAGES.repeatCount });

const repeatUnit = z.enum(INTERVAL_UNITS, { error: MESSAGES.repeatUnit });

export const assessmentFormSchema = z.object({
  name: itemName,
  intervalCount: exactNumberFromText(0, false).pipe(repeatRange),
  intervalUnit: repeatUnit,
});

/** The assessment sheet's schema: the same fields plus the On switch (shown when editing). */
export const assessmentSheetSchema = assessmentFormSchema.extend({
  isActive: z.boolean({ error: 'Fill this in' }),
});

const rangeBound = exactNumberFromText(1, true).pipe(
  z
    .number()
    .min(-RANGE_BOUND, { error: MESSAGES.bound })
    .max(RANGE_BOUND, { error: MESSAGES.bound })
    .nullable(),
);

export const measurementFormSchema = z
  .object({
    name: itemName,
    datatype: z.enum(DATATYPES, { error: MESSAGES.kind }),
    unit: z.string({ error: MESSAGES.unit }).max(UNIT_MAX, { error: MESSAGES.unit }),
    decimals: z.literal([0, 1, 2], { error: MESSAGES.decimals }),
    better: z.enum(BETTER_VALUES, { error: MESSAGES.better }),
    plausibleMin: rangeBound,
    plausibleMax: rangeBound,
    intervalCount: exactNumberFromText(0, true).pipe(repeatRange.nullable()),
    intervalUnit: repeatUnit.nullable(),
    tableGroup: z
      .string({ error: MESSAGES.name })
      .trim()
      .min(NAME_MIN, { error: MESSAGES.name })
      .max(NAME_MAX, { error: MESSAGES.name })
      .nullable(),
    tablePart: z.enum(TABLE_PARTS, { error: MESSAGES.tablePart }).nullable(),
    isActive: z.boolean({ error: 'Fill this in' }),
  })
  // These run only when every field has the right type (Zod skips them otherwise), so a wrong type is
  // reported once, on its own field.
  .superRefine((value, ctx) => {
    const { plausibleMin, plausibleMax } = value;
    if (plausibleMin !== null && plausibleMax !== null && plausibleMin >= plausibleMax) {
      ctx.addIssue({ code: 'custom', path: ['plausibleMin'], message: MESSAGES.range });
    }
    if ((value.intervalCount === null) !== (value.intervalUnit === null)) {
      ctx.addIssue({ code: 'custom', path: ['intervalCount'], message: MESSAGES.repeatPair });
    }
    if ((value.tableGroup === null) !== (value.tablePart === null)) {
      ctx.addIssue({ code: 'custom', path: ['tableGroup'], message: MESSAGES.tablePair });
    }
  });

/** What a form holds while typing (numbers are text). */
export type GymSettingsFormValues = z.input<typeof gymSettingsSchema>;
export type AssessmentFormValues = z.input<typeof assessmentSheetSchema>;
export type MeasurementFormValues = z.input<typeof measurementFormSchema>;

/** What the schema hands back (numbers are numbers, `null` for "none"). */
export type GymSettingsInput = z.output<typeof gymSettingsSchema>;
export type AssessmentFormInput = z.output<typeof assessmentFormSchema>;
export type MeasurementFormInput = z.output<typeof measurementFormSchema>;
