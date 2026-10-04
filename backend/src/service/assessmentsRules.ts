import {
  type MetricDecimals,
  roundMetricValue,
} from "../lib/domain/metric-value";
import type { Datatype } from "../lib/enums";
import {
  MAX_DURATION_SECONDS,
  MAX_MEASUREMENT_VALUE,
} from "../types/assessments.types";

// Pure rules of recording assessments (assessments.md: BR-REC-12, 19, 76-78, 81, D2-D4).
// No I/O, no clock; the service loads the data and calls these.

export type RuleIssue = { path: string; message: string };

/** One entry of an E26 body, its measurement id already lower-cased. `null` removes the stored value (BR-REC-77). */
export type Entry = { metricId: string; value: number | null };

/** What a measurement says about how its values are kept (BR-REC-12, 64). */
export type MetricKind = { datatype: Datatype; decimals: number };

/** Values by measurement id (durations in seconds). */
export type ValueMap = Record<string, number>;

// Same text as the shape limit of `types/assessments.types.ts` (contract "Request limits").
const NUMBER_MESSAGE = "Use a number up to 999,999,999.999 either way";
const DURATION_MESSAGE = `Use 0 to ${MAX_DURATION_SECONDS.toLocaleString("en-US")} seconds`;

const roundedBy = (value: number, kind: MetricKind): number =>
  roundMetricValue(value, kind.datatype, kind.decimals as MetricDecimals);

/** An entry names a measurement that the assessment does not own (D4). */
export function hasForeignMetric(
  entries: readonly Entry[],
  kinds: ReadonlyMap<string, MetricKind>,
): boolean {
  return entries.some((entry) => !kinds.has(entry.metricId));
}

/**
 * The checks the schema cannot make because they need the measurement's kind (D3), for the non-null
 * entries only. A Time value is checked as sent (`-0.4` and `35999.5` fail); a Number is checked in
 * its rounded form, so a value that would round past the database limit is refused here, never there.
 * `path` points at the entry's place in the body (`values.<i>.value`).
 */
export function valueIssues(
  entries: readonly Entry[],
  kinds: ReadonlyMap<string, MetricKind>,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  entries.forEach((entry, index) => {
    const kind = kinds.get(entry.metricId);
    if (entry.value === null || kind === undefined) return;
    if (kind.datatype === "duration") {
      if (entry.value < 0 || entry.value > MAX_DURATION_SECONDS) {
        issues.push({
          path: `values.${index}.value`,
          message: DURATION_MESSAGE,
        });
      }
    } else if (Math.abs(roundedBy(entry.value, kind)) > MAX_MEASUREMENT_VALUE) {
      issues.push({ path: `values.${index}.value`, message: NUMBER_MESSAGE });
    }
  });
  return issues;
}

/** Every value is rounded before it is stored: Number to its decimals, Time to whole seconds (BR-REC-76, D3). */
export function roundEntries(
  entries: readonly Entry[],
  kinds: ReadonlyMap<string, MetricKind>,
): Entry[] {
  return entries.map(({ metricId, value }) => {
    const kind = kinds.get(metricId);
    return {
      metricId,
      value:
        value === null || kind === undefined ? value : roundedBy(value, kind),
    };
  });
}

/** BR-REC-78: nothing filled (no entry, or only `null` ones) is refused. */
export const hasNoValues = (entries: readonly Entry[]): boolean =>
  entries.every((entry) => entry.value === null);

export type SavePlan = {
  /** non-null entries, to insert or overwrite */
  writes: { metricId: string; value: number }[];
  /** stored values a `null` entry deletes (a `null` for a measurement with nothing stored does nothing) */
  removals: string[];
  /** `saved` of the answer: every non-null entry, also an unchanged one (D2) */
  saved: number;
  /** `removed` of the answer: only the stored values that went (D2) */
  removed: number;
  /** the whole stored state afterwards */
  after: ValueMap;
};

/**
 * What E26 does to an assessment holding `stored`: entries left out stay, `n` sets, `null` removes
 * (BR-REC-77, D2). `entries` are rounded already and name each measurement once.
 */
export function planSave(
  stored: Readonly<ValueMap>,
  entries: readonly Entry[],
): SavePlan {
  const writes: SavePlan["writes"] = [];
  const removals: string[] = [];
  const after: ValueMap = { ...stored };
  for (const { metricId, value } of entries) {
    if (value === null) {
      if (Object.hasOwn(stored, metricId)) {
        removals.push(metricId);
        delete after[metricId];
      }
    } else {
      writes.push({ metricId, value });
      after[metricId] = value;
    }
  }
  return {
    writes,
    removals,
    saved: writes.length,
    removed: removals.length,
    after,
  };
}

/**
 * The measurements the entry form lists (D4, D20): the turned-on ones while the assessment is on,
 * plus any measurement, on or off, that holds a value in the saved assessment, so an old record
 * stays editable. `metrics` come in setup order and keep it.
 */
export function listedMetrics<M extends { id: string; isActive: boolean }>(
  metrics: readonly M[],
  assessmentIsOn: boolean,
  stored: Readonly<ValueMap>,
): M[] {
  return metrics.filter(
    (metric) =>
      (assessmentIsOn && metric.isActive) || Object.hasOwn(stored, metric.id),
  );
}

/** What the change log keeps of an assessment before and after a write (BR-REC-92, D7). */
export const assessmentSnapshot = (
  date: string,
  isEstimated: boolean,
  values: Readonly<ValueMap>,
) => ({ date, isEstimated, values: { ...values } });
