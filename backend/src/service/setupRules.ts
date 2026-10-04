import type {
  BetterDirection,
  Datatype,
  IntervalUnit,
  TablePart,
} from "../lib/enums";
import type { CreateMetricBody, UpdateMetricBody } from "../types/setup.types";

// Measurement rules of setup.md (BR-REC-10, 11, 62, C3, C4, C7, C8). Pure: no I/O, no clock.
// The service loads the stored measurement, applies one of these functions and writes the result.

/** Unit of every Time (duration) measurement (C3). */
export const DURATION_UNIT = "min:sec";
/** What a number measurement gets when the request says nothing (E13; E14 after Time -> Number). */
const NUMBER_DEFAULTS = { unit: "", decimals: 1 } as const;

/** The editable fields of a measurement, as stored. */
export type MetricFields = {
  name: string;
  unit: string;
  datatype: Datatype;
  decimals: number;
  better: BetterDirection;
  plausibleMin: number | null;
  plausibleMax: number | null;
  intervalCount: number | null;
  intervalUnit: IntervalUnit | null;
  tableGroup: string | null;
  tablePart: TablePart | null;
  isActive: boolean;
};

/** One problem of a request, in the shape of the schema errors (`details.issues`). */
export type RuleIssue = { path: string; message: string };

// Same texts as the schema refinements in `types/setup.types.ts` (contract "Request limits").
const RANGE_MESSAGE = "Below must be smaller than above";
const REPEAT_MESSAGE = "Set both the repeat number and unit, or neither";
const TABLE_MESSAGE = "Set both the report group and part, or neither";
const LIST_MESSAGE = "List every item once";

const sentOr = <T>(sent: T | undefined, stored: T): T =>
  sent === undefined ? stored : sent;

/**
 * Unit and decimals a measurement of this kind ends up with (C3): a Time measurement is always
 * `min:sec` with 0 decimals, whatever was sent; a number keeps what was sent, else `base`.
 */
function unitAndDecimals(
  datatype: Datatype,
  sent: { unit?: string | undefined; decimals?: number | undefined },
  base: { unit: string; decimals: number },
): { unit: string; decimals: number } {
  if (datatype === "duration") return { unit: DURATION_UNIT, decimals: 0 };
  return {
    unit: sent.unit ?? base.unit,
    decimals: sent.decimals ?? base.decimals,
  };
}

/** E13: the fields of a new measurement; what the body leaves out takes its default (it starts On). */
export function newMetricFields(body: CreateMetricBody): MetricFields {
  return {
    name: body.name,
    datatype: body.datatype,
    ...unitAndDecimals(body.datatype, body, NUMBER_DEFAULTS),
    better: body.better,
    plausibleMin: body.plausibleMin ?? null,
    plausibleMax: body.plausibleMax ?? null,
    intervalCount: body.intervalCount ?? null,
    intervalUnit: body.intervalUnit ?? null,
    tableGroup: body.tableGroup ?? null,
    tablePart: body.tablePart ?? null,
    isActive: true,
  };
}

/**
 * E14: the stored measurement with the fields sent applied; `null` clears an optional field.
 * A Time -> Number switch that sends no unit (decimals) starts from the number defaults, because
 * `min:sec` and 0 are the server's own values for Time, not something the coach chose (C3).
 */
export function editedMetricFields(
  stored: MetricFields,
  patch: UpdateMetricBody,
): MetricFields {
  const datatype = sentOr(patch.datatype, stored.datatype);
  const base =
    stored.datatype === "duration"
      ? NUMBER_DEFAULTS
      : { unit: stored.unit, decimals: stored.decimals };
  return {
    name: sentOr(patch.name, stored.name),
    datatype,
    ...unitAndDecimals(datatype, patch, base),
    better: sentOr(patch.better, stored.better),
    plausibleMin: sentOr(patch.plausibleMin, stored.plausibleMin),
    plausibleMax: sentOr(patch.plausibleMax, stored.plausibleMax),
    intervalCount: sentOr(patch.intervalCount, stored.intervalCount),
    intervalUnit: sentOr(patch.intervalUnit, stored.intervalUnit),
    tableGroup: sentOr(patch.tableGroup, stored.tableGroup),
    tablePart: sentOr(patch.tablePart, stored.tablePart),
    isActive: sentOr(patch.isActive, stored.isActive),
  };
}

/**
 * C8: the range and the two both-or-neither pairs of the measurement as it would be stored.
 * The schema checks what one body holds; this also catches one side sent alone (or cleared
 * alone) against the other side's stored value.
 */
export function metricIssues(fields: MetricFields): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const { plausibleMin: min, plausibleMax: max } = fields;
  if (min !== null && max !== null && min >= max) {
    issues.push({ path: "plausibleMin", message: RANGE_MESSAGE });
  }
  if ((fields.intervalCount === null) !== (fields.intervalUnit === null)) {
    issues.push({ path: "intervalCount", message: REPEAT_MESSAGE });
  }
  if ((fields.tableGroup === null) !== (fields.tablePart === null)) {
    issues.push({ path: "tableGroup", message: TABLE_MESSAGE });
  }
  return issues;
}

/** C4: kind and unit are locked once a value exists; only a real change counts (after C3). */
export function changesKindOrUnit(
  stored: MetricFields,
  next: MetricFields,
): boolean {
  return stored.datatype !== next.datatype || stored.unit !== next.unit;
}

/**
 * C7: `requested` holds every id of `existing` exactly once (ids compared ignoring letter case);
 * any missing, extra, foreign or repeated id fails.
 */
export function listsEveryIdOnce(
  requested: readonly string[],
  existing: readonly string[],
): boolean {
  const wanted = new Set(requested.map((id) => id.toLowerCase()));
  return (
    wanted.size === requested.length &&
    requested.length === existing.length &&
    existing.every((id) => wanted.has(id.toLowerCase()))
  );
}

/** The issue for a list that fails `listsEveryIdOnce`; `path` is `typeIds` or `metricIds`. */
export const listIssue = (path: "typeIds" | "metricIds"): RuleIssue => ({
  path,
  message: LIST_MESSAGE,
});
