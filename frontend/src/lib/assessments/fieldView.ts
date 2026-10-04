import { formatDuration } from '@/lib/domain/duration';
import { formatValue } from '@/lib/format';
import { type Change, describeChange } from './change';
import { assessmentDateLabel } from './labels';
import { parseNumberText } from './parseNumber';
import { checkPlausibility, type PlausibilityReason } from './plausibility';
import { ASSESSMENT_TEXT } from './text';
import { asDecimals, type EntryMetric, type FieldInput, type Inputs } from './types';

// What one field means right now: its value, the lines under it, the "please check" text. Pure.

export interface FieldReading {
  /** The number typed (rounded to the decimals) or the seconds; null when blank or not a number. */
  value: number | null;
  blank: boolean;
  /** Number text that is not a number (BR-REC-76). */
  invalid: boolean;
}

export function readField(metric: EntryMetric, input: FieldInput | undefined): FieldReading {
  if (metric.datatype === 'duration') {
    return typeof input === 'number'
      ? { value: input, blank: false, invalid: false }
      : { value: null, blank: true, invalid: false };
  }
  const text =
    typeof input === 'string' ? input : input === null || input === undefined ? '' : String(input);
  const parsed = parseNumberText(text, asDecimals(metric.decimals));
  if (parsed.kind === 'ok') return { value: parsed.value, blank: false, invalid: false };
  return { value: null, blank: parsed.kind === 'empty', invalid: parsed.kind === 'invalid' };
}

/** "95.5 kg" for a Number, "2:02" for a Time (its unit "min:sec" is never added). */
export const formatMetricValue = (metric: EntryMetric, value: number): string =>
  metric.datatype === 'duration'
    ? formatDuration(value)
    : formatValue(value, asDecimals(metric.decimals), metric.unit);

/** "Last 95.5 kg · 12 Sep" (an estimated date reads "≈ Dec 2025"), or null when there is no previous value. */
export function previousLine(metric: EntryMetric, today: string): string | null {
  const { previous } = metric;
  if (!previous) return null;
  return ASSESSMENT_TEXT.last(
    formatMetricValue(metric, previous.value),
    assessmentDateLabel(previous.on, previous.isEstimated, today),
  );
}

/** The live change line for what is typed now (BR-REC-81). */
export const changeFor = (metric: EntryMetric, value: number | null): Change | null =>
  describeChange({
    value,
    previous: metric.previous?.value ?? null,
    datatype: metric.datatype,
    decimals: asDecimals(metric.decimals),
    unit: metric.unit,
    better: metric.better,
  });

// "last time 8", "usually between 0 and 100": why a value is flagged (BR-REC-21, 82, D14).
function hintParts(metric: EntryMetric, reasons: PlausibilityReason[]): string[] {
  const parts: string[] = [];
  if (reasons.includes('jump') && metric.previous) {
    parts.push(ASSESSMENT_TEXT.lastTime(formatMetricValue(metric, metric.previous.value)));
  }
  if (reasons.includes('range')) {
    const { plausibleMin: low, plausibleMax: high } = metric;
    if (low !== null && high !== null) {
      const [from, to] = [formatMetricValue(metric, low), formatMetricValue(metric, high)];
      parts.push(ASSESSMENT_TEXT.usuallyBetween(from, to));
    } else if (low !== null) {
      parts.push(ASSESSMENT_TEXT.usuallyAtLeast(formatMetricValue(metric, low)));
    } else if (high !== null) {
      parts.push(ASSESSMENT_TEXT.usuallyAtMost(formatMetricValue(metric, high)));
    }
  }
  return parts;
}

const checkOf = (metric: EntryMetric, value: number | null) =>
  checkPlausibility({
    value,
    previous: metric.previous?.value ?? null,
    plausibleMin: metric.plausibleMin,
    plausibleMax: metric.plausibleMax,
  });

/** "Please check — last time 8 kg", or null when the value is fine or blank (BR-REC-21, 82). */
export function warningFor(metric: EntryMetric, value: number | null): string | null {
  const { warn, reasons } = checkOf(metric, value);
  if (!warn) return null;
  const parts = hintParts(metric, reasons);
  return parts.length > 0
    ? `${ASSESSMENT_TEXT.pleaseCheck} — ${parts.join(', ')}`
    : ASSESSMENT_TEXT.pleaseCheck;
}

export interface FlaggedField {
  metricId: string;
  /** "Visceral fat 17.5 kg (last time 8 kg)" */
  line: string;
}

/** Every field with a "please check", for the one "Check these values" sheet (BR-REC-82). */
export function flaggedFields(metrics: EntryMetric[], inputs: Inputs): FlaggedField[] {
  const flagged: FlaggedField[] = [];
  for (const metric of metrics) {
    const { value } = readField(metric, inputs[metric.id]);
    const { warn, reasons } = checkOf(metric, value);
    if (!warn || value === null) continue;
    const parts = hintParts(metric, reasons);
    const shown = `${metric.name} ${formatMetricValue(metric, value)}`;
    flagged.push({
      metricId: metric.id,
      line: parts.length > 0 ? `${shown} (${parts.join(', ')})` : shown,
    });
  }
  return flagged;
}
