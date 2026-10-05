import type {
  DueItem,
  DueListItem,
  DueListStatus,
  DueState,
  MemberDueItem,
} from "../../types/due.types";
import type { DueOverrideKind, IntervalUnit } from "../enums";
import { addInterval, daysBetween, type IsoDate } from "./dates";
import { membershipStatus } from "./membership";

// Pure functions (BR-REC-15, 16, 93-98, 105; due-list.md C1-C10): no I/O, no clock.
// `today` (the gym day) and the "Due soon" lead days are arguments (BR-REC-93).
// Dates only; use `addInterval` / `daysBetween` from `./dates`. The service loads
// the rows, calls these functions and shapes the answer. The types and signatures
// are the contract (docs/specs/member-records/due-list.md).

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

/** Plain code-unit order, the same on every machine (like the E16 name order). */
const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Due status of every member x turned-on assessment that has at least one
 * turned-on measurement; members in input order, then assessments in setup
 * order (`sortOrder`). Per measurement (C1): due = latest `measuredOn` + its
 * effective interval (its own, else the assessment's; BR-REC-14, 94); never
 * measured = the member's `joinedOn`. Examples: due-list.md "Due examples".
 */
export function computeDue(input: ComputeDueInput): DueStatus[] {
  const { today, upcomingLeadDays } = input;

  // Only turned-on assessments with at least one turned-on measurement get a status (BR-REC-95, C1);
  // both lists are in setup order (`sort` is stable, so equal sort orders keep the input order).
  const types = input.types
    .filter((type) => type.isActive)
    .map((type) => ({
      type,
      measurements: type.measurements
        .filter((measurement) => measurement.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter(({ measurements }) => measurements.length > 0)
    .sort((a, b) => a.type.sortOrder - b.type.sortOrder);

  const latestByMember = new Map<string, Map<string, IsoDate>>();
  for (const { memberId, metricId, measuredOn } of input.lastMeasured) {
    const byMetric = latestByMember.get(memberId) ?? new Map<string, IsoDate>();
    const known = byMetric.get(metricId);
    if (known === undefined || measuredOn > known) {
      byMetric.set(metricId, measuredOn);
    }
    latestByMember.set(memberId, byMetric);
  }

  const overrideByPair = new Map<string, Map<string, DueOverride>>();
  for (const override of input.overrides) {
    const byType =
      overrideByPair.get(override.memberId) ?? new Map<string, DueOverride>();
    byType.set(override.typeId, override);
    overrideByPair.set(override.memberId, byType);
  }

  const statuses: DueStatus[] = [];
  for (const member of input.members) {
    const latest = latestByMember.get(member.id);
    for (const { type, measurements } of types) {
      const due = measurements.map((measurement) => {
        const lastOn = latest?.get(measurement.id);
        const own =
          measurement.intervalCount !== null &&
          measurement.intervalUnit !== null
            ? {
                count: measurement.intervalCount,
                unit: measurement.intervalUnit,
              }
            : { count: type.intervalCount, unit: type.intervalUnit };
        return {
          item: { metricId: measurement.id, name: measurement.name },
          dueOn:
            lastOn === undefined
              ? member.joinedOn
              : addInterval(lastOn, own.count, own.unit),
          hasValue: lastOn !== undefined,
        };
      });

      const nextDueOn = due.reduce(
        (earliest, { dueOn }) => (dueOn < earliest ? dueOn : earliest),
        due[0]?.dueOn ?? member.joinedOn,
      );
      const daysOverdue = daysBetween(nextDueOn, today);
      const dueItems = due
        .filter(({ dueOn }) => daysBetween(today, dueOn) <= upcomingLeadDays)
        .map(({ item }) => item);
      const state: DueState =
        dueItems.length === 0
          ? "ok"
          : daysOverdue >= 1
            ? "overdue"
            : "upcoming";

      // An override ends when a save made after it was set is dated on or after the day it was set (C6).
      const override = overrideByPair.get(member.id)?.get(type.id);
      const active =
        override !== undefined &&
        !(
          override.latestAssessedOnSinceSet !== null &&
          override.latestAssessedOnSinceSet >= override.setOn
        );
      const snoozedUntil =
        active &&
        override.kind === "snooze" &&
        override.untilOn !== null &&
        today < override.untilOn
          ? override.untilOn
          : null;

      statuses.push({
        memberId: member.id,
        fullName: member.fullName,
        typeId: type.id,
        typeName: type.name,
        typeSortOrder: type.sortOrder,
        state,
        neverRecorded: due.every(({ hasValue }) => !hasValue),
        nextDueOn,
        daysOverdue,
        dueItems,
        allItems: due.map(({ item }) => item),
        flagged: active && override.kind === "flag",
        snoozedUntil,
      });
    }
  }
  return statuses;
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
  const rows: { row: DueListItem; typeSortOrder: number }[] = [];
  for (const status of statuses) {
    if (status.snoozedUntil !== null) continue; // hidden until the reminder day (C7)
    // Assess soon: every measurement as chips, in Overdue only, whatever the dates say (C4)
    const inTab = status.flagged ? tab === "overdue" : status.state === tab;
    if (!inTab) continue;
    rows.push({
      typeSortOrder: status.typeSortOrder,
      row: {
        memberId: status.memberId,
        fullName: status.fullName,
        typeId: status.typeId,
        typeName: status.typeName,
        dueOn: status.nextDueOn,
        daysOverdue: status.daysOverdue,
        flagged: status.flagged,
        items: status.flagged ? status.allItems : status.dueItems,
      },
    });
  }
  return rows
    .sort(
      (a, b) =>
        Number(b.row.flagged) - Number(a.row.flagged) ||
        compareText(a.row.dueOn, b.row.dueOn) ||
        compareText(
          a.row.fullName.toLowerCase(),
          b.row.fullName.toLowerCase(),
        ) ||
        a.typeSortOrder - b.typeSortOrder ||
        compareText(a.row.memberId, b.row.memberId),
    )
    .map(({ row }) => row);
}

/**
 * The E32 lines for the statuses of ONE member, in the order given (C10):
 * `items` = `allItems` when flagged, else `dueItems`; `snoozedUntil` and
 * `flagged` as in the status.
 */
export function memberDueItems(statuses: DueStatus[]): MemberDueItem[] {
  return statuses.map((status) => ({
    typeId: status.typeId,
    typeName: status.typeName,
    state: status.state,
    neverRecorded: status.neverRecorded,
    nextDueOn: status.nextDueOn,
    daysOverdue: status.daysOverdue,
    flagged: status.flagged,
    snoozedUntil: status.snoozedUntil,
    items: status.flagged ? status.allItems : status.dueItems,
  }));
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
  if (member.archived) return false;
  // leadDays is irrelevant here: only "expired" (ended before today) is asked
  return (
    membershipStatus(member.latestMembership, today, 0)?.status !== "expired"
  );
}
