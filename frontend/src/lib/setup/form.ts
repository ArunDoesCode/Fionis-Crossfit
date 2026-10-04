import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';
import type {
  AssessmentType,
  CreateMetricBody,
  Metric,
  Settings,
  UpdateAssessmentTypeBody,
  UpdateMetricBody,
  UpdateSettingsBody,
} from '@/lib/api/setup/fetchers';
import {
  type AssessmentFormInput,
  assessmentFormSchema,
  type Better,
  type GymSettingsInput,
  gymSettingsSchema,
  type IntervalUnit,
  type MeasurementFormInput,
  measurementFormSchema,
  type TablePart,
} from '@/lib/validators/setup';

// Pure glue between the setup forms (numbers are text while typing) and the contract (numbers, `null` for
// "none"). No DOM, no clock. The Zod schemas in `lib/validators/setup.ts` do the checking; this file only
// turns what is typed into what they expect and back, and works out which fields really changed.

/** Time is always saved as min:sec with no decimals, whatever is sent (C3). */
export const TIME_UNIT = 'min:sec';

const NUMBER_TEXT = /^-?(\d+\.?\d*|\.\d+)$/;

/** Blank text is `null` ("none"), a number is the number, anything else is `NaN` (the schema refuses it). */
export function parseNumberText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return NUMBER_TEXT.test(trimmed) ? Number(trimmed) : Number.NaN;
}

const numberText = (value: number | null): string => (value === null ? '' : String(value));

/**
 * A React Hook Form resolver that checks the typed values with a Zod schema after `toInput` has turned
 * them into the schema's shape. Both use the same field names, so an issue lands on its own field; the
 * first issue per field wins.
 */
export function schemaResolver<Values extends FieldValues>(
  schema: ZodType,
  toInput: (values: Values) => unknown,
): Resolver<Values> {
  return (values) => {
    const result = schema.safeParse(toInput(values));
    if (result.success) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? '');
      if (field && !errors[field]) errors[field] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<Values> };
  };
}

// ---------------------------------------------------------------------------------------------------------
// S16 Reminders & gym
// ---------------------------------------------------------------------------------------------------------

export interface GymSettingsFormValues {
  gymName: string;
  timezone: string;
  upcomingLeadDays: string;
  expiryLeadDays: string;
}

export const gymSettingsToValues = (settings: Settings): GymSettingsFormValues => ({
  gymName: settings.gymName,
  timezone: settings.timezone,
  upcomingLeadDays: String(settings.upcomingLeadDays),
  expiryLeadDays: String(settings.expiryLeadDays),
});

export const gymSettingsToInput = (values: GymSettingsFormValues) => ({
  gymName: values.gymName,
  timezone: values.timezone,
  upcomingLeadDays: parseNumberText(values.upcomingLeadDays),
  expiryLeadDays: parseNumberText(values.expiryLeadDays),
});

/** The checked, trimmed settings. Call only with values the form's resolver accepted (it throws otherwise). */
export const parseGymSettings = (values: GymSettingsFormValues): GymSettingsInput =>
  gymSettingsSchema.parse(gymSettingsToInput(values));

/** Only the settings that differ from what is saved (E08 changes only the fields sent). */
export function settingsUpdateBody(saved: Settings, input: GymSettingsInput): UpdateSettingsBody {
  const body: UpdateSettingsBody = {};
  if (input.gymName !== saved.gymName) body.gymName = input.gymName;
  if (input.timezone !== saved.timezone) body.timezone = input.timezone;
  if (input.upcomingLeadDays !== saved.upcomingLeadDays) {
    body.upcomingLeadDays = input.upcomingLeadDays;
  }
  if (input.expiryLeadDays !== saved.expiryLeadDays) body.expiryLeadDays = input.expiryLeadDays;
  return body;
}

// ---------------------------------------------------------------------------------------------------------
// Assessment sheet
// ---------------------------------------------------------------------------------------------------------

export interface AssessmentFormValues {
  name: string;
  intervalCount: string;
  intervalUnit: IntervalUnit;
  isActive: boolean;
}

export const newAssessmentValues = (): AssessmentFormValues => ({
  name: '',
  intervalCount: '1',
  intervalUnit: 'month',
  isActive: true,
});

export const assessmentToValues = (assessment: AssessmentType): AssessmentFormValues => ({
  name: assessment.name,
  intervalCount: String(assessment.intervalCount),
  intervalUnit: assessment.intervalUnit,
  isActive: assessment.isActive,
});

export const assessmentToInput = (values: AssessmentFormValues) => ({
  name: values.name,
  intervalCount: parseNumberText(values.intervalCount),
  intervalUnit: values.intervalUnit,
});

/** The checked, trimmed assessment. Call only with values the form's resolver accepted (it throws otherwise). */
export const parseAssessment = (values: AssessmentFormValues): AssessmentFormInput =>
  assessmentFormSchema.parse(assessmentToInput(values));

/** Only what changed (E11); empty when nothing did. */
export function assessmentUpdateBody(
  saved: AssessmentType,
  input: AssessmentFormInput,
  isActive: boolean,
): UpdateAssessmentTypeBody {
  const body: UpdateAssessmentTypeBody = {};
  if (input.name !== saved.name) body.name = input.name;
  if (input.intervalCount !== saved.intervalCount) body.intervalCount = input.intervalCount;
  if (input.intervalUnit !== saved.intervalUnit) body.intervalUnit = input.intervalUnit;
  if (isActive !== saved.isActive) body.isActive = isActive;
  return body;
}

// ---------------------------------------------------------------------------------------------------------
// Measurement sheet
// ---------------------------------------------------------------------------------------------------------

export interface MeasurementFormValues {
  name: string;
  datatype: MeasurementFormInput['datatype'];
  unit: string;
  /** "0", "1" or "2": the chips hold text. */
  decimals: '0' | '1' | '2';
  better: Better;
  /** Typed text; for Time it holds whole seconds. */
  plausibleMin: string;
  plausibleMax: string;
  repeat: 'same' | 'own';
  intervalCount: string;
  intervalUnit: IntervalUnit;
  reportTable: 'none' | 'place';
  tableGroup: string;
  tablePart: TablePart | null;
  isActive: boolean;
}

export const newMeasurementValues = (): MeasurementFormValues => ({
  name: '',
  datatype: 'number',
  unit: '',
  decimals: '1',
  better: 'higher',
  plausibleMin: '',
  plausibleMax: '',
  repeat: 'same',
  intervalCount: '3',
  intervalUnit: 'month',
  reportTable: 'none',
  tableGroup: '',
  tablePart: null,
  isActive: true,
});

const toDecimals = (value: number): MeasurementFormValues['decimals'] =>
  value === 0 || value === 2 ? (String(value) as '0' | '2') : '1';

export const metricToValues = (metric: Metric): MeasurementFormValues => ({
  name: metric.name,
  datatype: metric.datatype,
  unit: metric.datatype === 'duration' ? '' : metric.unit,
  decimals: toDecimals(metric.decimals),
  better: metric.better,
  plausibleMin: numberText(metric.plausibleMin),
  plausibleMax: numberText(metric.plausibleMax),
  repeat: metric.intervalCount === null ? 'same' : 'own',
  intervalCount: metric.intervalCount === null ? '3' : String(metric.intervalCount),
  intervalUnit: metric.intervalUnit ?? 'month',
  reportTable: metric.tableGroup === null ? 'none' : 'place',
  tableGroup: metric.tableGroup ?? '',
  tablePart: metric.tablePart,
  isActive: metric.isActive,
});

export function measurementToInput(values: MeasurementFormValues) {
  const isTime = values.datatype === 'duration';
  const ownRepeat = values.repeat === 'own';
  const inTable = values.reportTable === 'place';
  return {
    name: values.name,
    datatype: values.datatype,
    unit: isTime ? TIME_UNIT : values.unit,
    decimals: isTime ? 0 : Number(values.decimals),
    better: values.better,
    plausibleMin: parseNumberText(values.plausibleMin),
    plausibleMax: parseNumberText(values.plausibleMax),
    intervalCount: ownRepeat ? parseNumberText(values.intervalCount) : null,
    intervalUnit: ownRepeat ? values.intervalUnit : null,
    tableGroup: inTable ? values.tableGroup : null,
    tablePart: inTable ? values.tablePart : null,
    isActive: values.isActive,
  };
}

/** The checked, trimmed measurement. Call only with values the form's resolver accepted (it throws otherwise). */
export const parseMeasurement = (values: MeasurementFormValues): MeasurementFormInput =>
  measurementFormSchema.parse(measurementToInput(values));

/** E13 body. For Time the server sets min:sec and no decimals (C3), so they are not sent. */
export function metricCreateBody(input: MeasurementFormInput): CreateMetricBody {
  return {
    name: input.name,
    datatype: input.datatype,
    better: input.better,
    ...(input.datatype === 'number' && { unit: input.unit, decimals: input.decimals }),
    plausibleMin: input.plausibleMin,
    plausibleMax: input.plausibleMax,
    intervalCount: input.intervalCount,
    intervalUnit: input.intervalUnit,
    tableGroup: input.tableGroup,
    tablePart: input.tablePart,
  };
}

/**
 * E14 body: only what changed. A pair (check range, own repeat, report-table place) is sent whole when
 * either side changed, so the server's both-or-neither check sees the final pair (C8). Empty when
 * nothing changed.
 */
export function metricUpdateBody(saved: Metric, input: MeasurementFormInput): UpdateMetricBody {
  const body: UpdateMetricBody = {};
  if (input.name !== saved.name) body.name = input.name;
  if (input.datatype !== saved.datatype) body.datatype = input.datatype;
  if (input.unit !== saved.unit) body.unit = input.unit;
  if (input.decimals !== saved.decimals) body.decimals = input.decimals;
  if (input.better !== saved.better) body.better = input.better;
  if (input.isActive !== saved.isActive) body.isActive = input.isActive;
  if (input.plausibleMin !== saved.plausibleMin || input.plausibleMax !== saved.plausibleMax) {
    body.plausibleMin = input.plausibleMin;
    body.plausibleMax = input.plausibleMax;
  }
  if (input.intervalCount !== saved.intervalCount || input.intervalUnit !== saved.intervalUnit) {
    body.intervalCount = input.intervalCount;
    body.intervalUnit = input.intervalUnit;
  }
  if (input.tableGroup !== saved.tableGroup || input.tablePart !== saved.tablePart) {
    body.tableGroup = input.tableGroup;
    body.tablePart = input.tablePart;
  }
  return body;
}
