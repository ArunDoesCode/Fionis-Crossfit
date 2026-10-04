// biome-ignore-all lint/correctness/noUnusedFunctionParameters: signatures only until the build step; remove this line then
import type {
  DueItem,
  DueListItem,
  DueListStatus,
  DueState,
  MemberDueItem,
} from "../../types/due.types";
import type { DueOverrideKind, IntervalUnit } from "../enums";
import type { IsoDate } from "./dates";

// Pure functions (BR-REC-15, 16, 93-98, 105; due-list.md C1-C10): no I/O, no clock.
// `today` (the gym day) and the "Due soon" lead days are arguments (BR-REC-93).
// Dates only; use `addInterval` / `daysBetween` from `./dates`. The service loads
// the rows, calls these functions and shapes the answer. The bodies are written by
// the build step; the types and signatures are the contract (`contract.md`).

export type DueMember = { id: string; fullName: string; joinedOn: IsoDate };

export type DueMeasurement = {
  id: string;
  name: string;
  /** `metrics.is_active`; a turned-off measurement is never due (BR-REC-95) */
  isActive: boolean;
  sortOrder: number;
  /** its own repeat (BR-REC-14): both set or both null; one side alone counts as none */
  intervalCount: number | null;
  intervalUnit: IntervalUnit | null;
};

export type DueAssessmentType = {
  id: string;
  name: string;
  /** `assessment_types.is_active`; off hides all its measurements (BR-REC-95) */
  isActive: boolean;
  sortOrder: number;
  /** the repeat its measurements use unless they have their own */
  intervalCount: number;
  intervalUnit: IntervalUnit;
  /** all of them, on and off, any order (the engine sorts by `sortOrder`) */
  measurements: DueMeasurement[];
};

/** The member's latest `measurements.measured_on` of one measurement; extra, older rows are fine (the latest wins). */
export type DueLastMeasured = {
  memberId: string;
  metricId: string;
  measuredOn: IsoDate;
};

/** A `due_overrides` row, plus what the engine needs to tell whether a save has ended it (C6). */
export type DueOverride = {
  memberId: string;
  typeId: string;
  kind: DueOverrideKind;
  setOn: IsoDate;
  /** snooze only; a snooze without it is ignored */
  untilOn: IsoDate | null;
  /**
   * Latest `assessed_on` of that member + assessment among the saves made after
   * the override was set (`assessments.updated_at` >= the override's `created_at`);
   * null when there is none. The override has ended when this is on or after `setOn`.
   */
  latestAssessedOnSinceSet: IsoDate | null;
};

export type ComputeDueInput = {
  /** gym day, `YYYY-MM-DD` (BR-REC-93) */
  today: IsoDate;
  /** "Due soon" days (Setup `upcomingLeadDays`, 0-30); 0 = only "Due today" */
  upcomingLeadDays: number;
  members: DueMember[];
  types: DueAssessmentType[];
  lastMeasured: DueLastMeasured[];
  /** at most one per member + assessment (the table key) */
  overrides: DueOverride[];
};

/** One member + one turned-on assessment that has a turned-on measurement (C1, C2, C10). */
export type DueStatus = {
  memberId: string;
  fullName: string;
  typeId: string;
  typeName: string;
  typeSortOrder: number;
  /** from dates only, ignoring Assess soon and reminders: overdue = `nextDueOn` before today; upcoming = within the lead window; ok = later */
  state: DueState;
  /** none of the turned-on measurements has a value (C10) */
  neverRecorded: boolean;
  /** earliest due date among the turned-on measurements = the row's `dueOn` */
  nextDueOn: IsoDate;
  /** calendar days from `nextDueOn` to today (BR-REC-105): 0 = due today, negative = not yet due */
  daysOverdue: number;
  /** turned-on measurements due on or before today + lead days, setup order; empty when `state` is ok */
  dueItems: DueItem[];
  /** every turned-on measurement, setup order (the chips of an Assess soon row, BR-REC-98) */
  allItems: DueItem[];
  /** an "Assess soon" override is active (not ended by a save, C6) */
  flagged: boolean;
  /** an active "Remind me later" until this day (today < until and not ended, C6, C7); else null */
  snoozedUntil: IsoDate | null;
};

/**
 * Due status of every member x turned-on assessment that has at least one
 * turned-on measurement; members in input order, then assessments in setup
 * order (`sortOrder`). Per measurement (C1): due = latest `measuredOn` + its
 * effective interval (its own, else the assessment's; BR-REC-14, 94); never
 * measured = the member's `joinedOn`. Examples: due-list.md "Due examples".
 */
export function computeDue(input: ComputeDueInput): DueStatus[] {
  throw new Error("not implemented");
}

/**
 * The E31 rows of one tab, sorted (C2, C4, C5, C7), not paged. Snoozed rows are
 * left out. A flagged row is only in `overdue` (never `upcoming`), with
 * `items` = `allItems`; any other row is in the tab equal to its `state`, with
 * `items` = `dueItems`; state ok has no row. Order: flagged first, then `dueOn`
 * ascending, then `fullName` lower-cased (code-unit order, like E16), then
 * `typeSortOrder`, then `memberId`.
 */
export function dueListRows(
  statuses: DueStatus[],
  tab: DueListStatus,
): DueListItem[] {
  throw new Error("not implemented");
}

/**
 * The E32 lines for the statuses of ONE member, in the order given (C10):
 * `items` = `allItems` when flagged, else `dueItems`; `snoozedUntil` and
 * `flagged` as in the status.
 */
export function memberDueItems(statuses: DueStatus[]): MemberDueItem[] {
  throw new Error("not implemented");
}

/** What `isListedInDueList` needs about a member. */
export type DueListMember = {
  archived: boolean;
  /** the latest membership period by start; null when the member has none */
  latestMembership: { startOn: IsoDate; endOn: IsoDate } | null;
};

/**
 * False for an archived member and for one whose latest membership has Ended
 * (Expired, BR-REC-52); true for Active and Expiring members and for one with
 * no membership at all (C3, BR-REC-17). Applies to E31 only: E32 answers for everyone.
 */
export function isListedInDueList(
  member: DueListMember,
  today: IsoDate,
): boolean {
  throw new Error("not implemented");
}
