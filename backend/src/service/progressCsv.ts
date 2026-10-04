import type { IsoDate } from "../lib/domain/dates";
import { formatDuration } from "../lib/domain/duration";
import { roundMetricValue } from "../lib/domain/metric-value";
import type { Datatype } from "../lib/enums";
import type { ExportFile } from "../types/progress.types";

// Pure helpers of the CSV export (E39; BR-REC-24, 117-119, P8, P9, P13, P14). No I/O, no clock.

/** The byte-order mark Excel needs to read the file as UTF-8 (BR-REC-117). */
export const CSV_BOM = "﻿";

/** P8: the header row of each file, in column order. */
export const CSV_HEADERS: Record<ExportFile, readonly string[]> = {
  "members.csv": [
    "member_id",
    "name",
    "phone",
    "email",
    "date_of_birth",
    "sex",
    "joined_on",
    "objective",
    "notes",
    "plan",
    "membership_status",
    "membership_end_on",
    "archived",
  ],
  "memberships.csv": [
    "member_id",
    "name",
    "plan",
    "start_on",
    "end_on",
    "archived",
  ],
  "measurements.csv": [
    "member_id",
    "name",
    "assessment",
    "measurement",
    "unit",
    "date",
    "estimated",
    "value",
    "display",
    "archived",
  ],
};

export type CsvValue = string | number | boolean | null;

/** P14: ASCII `=`, `+`, `-` (hyphen-minus), `@` and tab start a formula in a spreadsheet. */
const FORMULA_START = /^[=+\-@\t]/;
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * One cell (P8, P9): `null` is empty, a boolean is `yes` / `no`, a number is its plain decimal;
 * text starting with `= + - @` or a tab gets a leading `'` (numbers included, so `-1.5` becomes
 * `'-1.5`); then a cell with a comma, quote, CR or LF is wrapped in quotes with inner quotes doubled.
 */
export function csvCell(value: CsvValue): string {
  if (value === null) return "";
  let text =
    typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One line: the cells joined by commas, ended by CRLF. */
export function csvLine(cells: readonly CsvValue[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}

/**
 * The `display` column (BR-REC-117, P13): a time as `m:ss` (`h:mm:ss` from one hour), any other
 * value with the measurement's decimals and no unit: 122 s is `2:02`, 94 with 1 decimal is `94.0`.
 */
export function displayValue(
  value: number,
  datatype: Datatype,
  decimals: 0 | 1 | 2,
): string {
  if (datatype === "duration") return formatDuration(value);
  return roundMetricValue(value, datatype, decimals).toFixed(decimals);
}

/** BR-REC-119: `measurements-2026-10-03.csv` for `("measurements.csv", "2026-10-03")`. */
export function exportFileName(file: ExportFile, today: IsoDate): string {
  return `${file.slice(0, -".csv".length)}-${today}.csv`;
}

/** The header row of `file`, with the byte-order mark in front. */
export const csvPreamble = (file: ExportFile): string =>
  CSV_BOM + csvLine(CSV_HEADERS[file]);

// ─── one line per row, the cells in the order of `CSV_HEADERS` ──────────────

export function memberCsvLine(row: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  dateOfBirth: IsoDate;
  sex: string;
  joinedOn: IsoDate;
  objective: string | null;
  notes: string | null;
  /** latest period; all three are null for a member without one */
  plan: string | null;
  status: string | null;
  endOn: IsoDate | null;
  archived: boolean;
}): string {
  return csvLine([
    row.id,
    row.fullName,
    row.phone,
    row.email,
    row.dateOfBirth,
    row.sex,
    row.joinedOn,
    row.objective,
    row.notes,
    row.plan,
    row.status,
    row.endOn,
    row.archived,
  ]);
}

export function membershipCsvLine(row: {
  memberId: string;
  fullName: string;
  plan: string;
  startOn: IsoDate;
  endOn: IsoDate;
  archived: boolean;
}): string {
  return csvLine([
    row.memberId,
    row.fullName,
    row.plan,
    row.startOn,
    row.endOn,
    row.archived,
  ]);
}

export function measurementCsvLine(row: {
  memberId: string;
  fullName: string;
  assessment: string;
  measurement: string;
  unit: string;
  on: IsoDate;
  isEstimated: boolean;
  value: number;
  datatype: Datatype;
  decimals: 0 | 1 | 2;
  archived: boolean;
}): string {
  return csvLine([
    row.memberId,
    row.fullName,
    row.assessment,
    row.measurement,
    row.unit,
    row.on,
    row.isEstimated,
    row.value,
    displayValue(row.value, row.datatype, row.decimals),
    row.archived,
  ]);
}
