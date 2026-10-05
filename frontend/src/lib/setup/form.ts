import type {
  AssessmentType,
  CreateMetricBody,
  Metric,
  Settings,
  UpdateAssessmentTypeBody,
  UpdateMetricBody,
  UpdateSettingsBody,
} from '@/lib/api/setup/fetchers';
import type {
  AssessmentFormInput,
  AssessmentFormValues,
  GymSettingsFormValues,
  GymSettingsInput,
  MeasurementFormInput,
  MeasurementFormValues,
} from '@/lib/validators/setup';

// Pure glue between the setup forms and the contract (numbers, `null` for "none"). No DOM, no clock. The
// Zod schemas in `lib/validators/setup.ts` read the typed text and check it (zodResolver); this file only
// maps saved data to form values, works out which fields really changed, and builds the request bodies.

/** Time is always saved as min:sec with no decimals, whatever is sent (C3). */
export const TIME_UNIT = 'min:sec';

const numberText = (value: number | null): string => (value === null ? '' : String(value));

// ---------------------------------------------------------------------------------------------------------
// S16 Reminders & gym
// ---------------------------------------------------------------------------------------------------------

export const gymSettingsToValues = (settings: Settings): GymSettingsFormValues => ({
  gymName: settings.gymName,
  timezone: settings.timezone,
  upcomingLeadDays: String(settings.upcomingLeadDays),
  expiryLeadDays: String(settings.expiryLeadDays),
});

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

/** Only what changed (E11); empty when no field differs. */
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

export const newMeasurementValues = (): MeasurementFormValues => ({
  name: '',
  datatype: 'number',
  unit: '',
  decimals: 1,
  better: 'higher',
  plausibleMin: '',
  plausibleMax: '',
  intervalCount: '',
  intervalUnit: null,
  tableGroup: null,
  tablePart: null,
  isActive: true,
});

const toDecimals = (value: number): MeasurementFormValues['decimals'] =>
  value === 0 || value === 2 ? value : 1;

export const metricToValues = (metric: Metric): MeasurementFormValues => ({
  name: metric.name,
  datatype: metric.datatype,
  unit: metric.datatype === 'duration' ? '' : metric.unit,
  decimals: toDecimals(metric.decimals),
  better: metric.better,
  plausibleMin: numberText(metric.plausibleMin),
  plausibleMax: numberText(metric.plausibleMax),
  intervalCount: numberText(metric.intervalCount),
  intervalUnit: metric.intervalCount === null ? null : metric.intervalUnit,
  tableGroup: metric.tableGroup,
  tablePart: metric.tablePart,
  isActive: metric.isActive,
});

/** A Time measurement is always min:sec with no decimals (C3), whatever the hidden fields hold. */
export const withTimeDefaults = (input: MeasurementFormInput): MeasurementFormInput =>
  input.datatype === 'duration' ? { ...input, unit: TIME_UNIT, decimals: 0 } : input;

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
 * no field differs.
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
