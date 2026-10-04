import type {
  ActiveByPlan,
  AgeBand,
  Reading,
  ReportCard,
} from "../../types/progress.types";
import {
  type BetterDirection,
  type Datatype,
  type MembershipStatus,
  type Plan,
  type Sex,
  TABLE_PARTS,
  type TablePart,
} from "../enums";
import { addMonths, ageOn, type IsoDate } from "./dates";

// Pure functions of the progress module (BR-REC-22, 106-108, 112, 114-116 and clarifications
// P2-P7, P12): no I/O, no clock (`today` is an argument). Values are the stored numbers
// (seconds for times, at most 3 decimals), so sums and differences are kept in whole
// thousandths to stay exact.

export type Better = BetterDirection;

/** A stored value on a day; `on` is `YYYY-MM-DD`. A member never has two readings of a measurement on one day. */
export interface ReadingIn {
  value: number;
  on: IsoDate;
  isEstimated: boolean;
}

// ─── rounding ───────────────────────────────────────────────────────────────

/** Whole thousandths of `value`; a float that is within 1e-6 of a thousandth snaps to it (0.3 - 0.1 is 200). */
function inThousandths(value: number): number {
  const scaled = value * 1000;
  const nearest = Math.round(scaled);
  return Math.abs(scaled - nearest) < 1e-6 ? nearest : scaled;
}

/** Half away from zero; never `-0`. */
function roundHalfAway(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

/** `value` rounded to 3 decimals, the precision values are stored with (P2). */
function roundToThousandths(value: number): number {
  const rounded = roundHalfAway(inThousandths(value)) / 1000;
  return rounded === 0 ? 0 : rounded;
}

// ─── readings ───────────────────────────────────────────────────────────────

const byDate = (a: ReadingIn, b: ReadingIn): number =>
  a.on < b.on ? -1 : a.on > b.on ? 1 : 0;

const copyOf = ({ value, on, isEstimated }: ReadingIn): Reading => ({
  value,
  on,
  isEstimated,
});

/**
 * BR-REC-107: the highest value for `higher`, the lowest for `lower`; a tie goes to the earliest
 * date; `none` and no readings give `null`.
 */
export function bestReading(
  readings: ReadingIn[],
  better: Better,
): ReadingIn | null {
  if (better === "none") return null;
  let best: ReadingIn | null = null;
  for (const reading of [...readings].sort(byDate)) {
    if (best === null) best = reading;
    else if (
      better === "higher"
        ? reading.value > best.value
        : reading.value < best.value
    ) {
      best = reading;
    }
  }
  return best && copyOf(best);
}

/**
 * First (earliest date), latest, best, change since first (3 decimals; `null` under 2 readings),
 * count and the last 12 readings oldest first (P2). Needs at least one reading.
 */
export function summariseReadings(
  readings: ReadingIn[],
  better: Better,
): {
  first: Reading;
  latest: Reading;
  best: Reading | null;
  change: number | null;
  readings: number;
  points: Reading[];
} {
  const ordered = [...readings].sort(byDate);
  const first = ordered[0];
  const latest = ordered[ordered.length - 1];
  if (first === undefined || latest === undefined) {
    throw new RangeError("summariseReadings needs at least one reading");
  }
  return {
    first: copyOf(first),
    latest: copyOf(latest),
    best: bestReading(ordered, better),
    change:
      ordered.length < 2
        ? null
        : roundToThousandths(latest.value - first.value),
    readings: ordered.length,
    points: ordered.slice(-12).map(copyOf),
  };
}

// ─── report card (E35) ──────────────────────────────────────────────────────

export interface ReportCardMetricIn {
  id: string;
  name: string;
  unit: string;
  datatype: Datatype;
  decimals: 0 | 1 | 2;
  better: Better;
  sortOrder: number;
  isActive: boolean;
  tableGroup: string | null;
  tablePart: TablePart | null;
}

export interface ReportCardInput {
  gymName: string;
  today: IsoDate;
  member: {
    fullName: string;
    dateOfBirth: IsoDate;
    sex: Sex;
    joinedOn: IsoDate;
  };
  /** already worked out from the member's latest period */
  membership: { plan: Plan; status: MembershipStatus };
  /** the whole catalog, on and off, any order */
  types: {
    id: string;
    name: string;
    sortOrder: number;
    metrics: ReportCardMetricIn[];
  }[];
  /** all of this member's stored values */
  values: {
    assessmentId: string;
    typeId: string;
    metricId: string;
    on: IsoDate;
    isEstimated: boolean;
    value: number;
  }[];
}

type CatalogType = ReportCardInput["types"][number];

/** Setup order; the id keeps two equal positions in a fixed order. */
const bySetupOrder = (
  a: { sortOrder: number; id: string },
  b: { sortOrder: number; id: string },
): number =>
  a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const hasTablePlace = (metric: ReportCardMetricIn): boolean =>
  metric.tableGroup !== null && metric.tablePart !== null;

/**
 * BR-REC-108, P3, P12: the latest assessment (by date, then the assessment's setup order) with a
 * value of a measurement that has a report-table place; one column per group, one row per body part.
 */
function segmentalTable(
  types: CatalogType[],
  values: ReportCardInput["values"],
): ReportCard["segmental"] {
  const typeOfMetric = new Map<string, CatalogType>();
  for (const type of types) {
    for (const metric of type.metrics) {
      if (hasTablePlace(metric)) typeOfMetric.set(metric.id, type);
    }
  }

  let chosen:
    | { value: ReportCardInput["values"][number]; type: CatalogType }
    | undefined;
  for (const value of values) {
    const type = typeOfMetric.get(value.metricId);
    if (type === undefined) continue;
    if (
      chosen === undefined ||
      value.on > chosen.value.on ||
      (value.on === chosen.value.on && bySetupOrder(type, chosen.type) < 0)
    ) {
      chosen = { value, type };
    }
  }
  if (chosen === undefined) return null;

  const { assessmentId, on, isEstimated } = chosen.value;
  const storedValue = new Map<string, number>();
  for (const value of values) {
    if (value.assessmentId === assessmentId) {
      storedValue.set(value.metricId, value.value);
    }
  }

  // measurements with a place that are on, or have a value in this assessment (setup order)
  const placed = [...chosen.type.metrics]
    .sort(bySetupOrder)
    .filter(
      (metric) =>
        hasTablePlace(metric) &&
        (metric.isActive || storedValue.has(metric.id)),
    );
  const groups: { name: string; unit: string; decimals: 0 | 1 | 2 }[] = [];
  for (const metric of placed) {
    if (!groups.some((group) => group.name === metric.tableGroup)) {
      groups.push({
        name: metric.tableGroup ?? "",
        unit: metric.unit,
        decimals: metric.decimals,
      });
    }
  }

  return {
    on,
    isEstimated,
    groups,
    rows: TABLE_PARTS.map((part) => ({
      part,
      values: Object.fromEntries(
        groups.map((group) => {
          const metric = placed.find(
            (candidate) =>
              candidate.tableGroup === group.name &&
              candidate.tablePart === part &&
              storedValue.has(candidate.id),
          );
          return [
            group.name,
            metric ? (storedValue.get(metric.id) ?? null) : null,
          ];
        }),
      ),
    })),
  };
}

/** E35 `data`: BR-REC-22, 106-108, P2, P3. */
export function reportCard(input: ReportCardInput): ReportCard {
  const { member, membership, today } = input;

  const readingsOf = new Map<string, ReadingIn[]>();
  for (const { metricId, value, on, isEstimated } of input.values) {
    const list = readingsOf.get(metricId) ?? [];
    list.push({ value, on, isEstimated });
    readingsOf.set(metricId, list);
  }

  const types: ReportCard["types"] = [];
  for (const type of [...input.types].sort(bySetupOrder)) {
    const metrics: ReportCard["types"][number]["metrics"] = [];
    for (const metric of [...type.metrics].sort(bySetupOrder)) {
      const readings = readingsOf.get(metric.id);
      if (readings === undefined || readings.length === 0) continue;
      metrics.push({
        id: metric.id,
        name: metric.name,
        unit: metric.unit,
        datatype: metric.datatype,
        decimals: metric.decimals,
        better: metric.better,
        ...summariseReadings(readings, metric.better),
      });
    }
    if (metrics.length > 0)
      types.push({ id: type.id, name: type.name, metrics });
  }

  return {
    gymName: input.gymName,
    printedOn: today,
    member: {
      fullName: member.fullName,
      age: ageOn(member.dateOfBirth, today),
      sex: member.sex,
      plan: membership.plan,
      membershipStatus: membership.status,
      joinedOn: member.joinedOn,
    },
    types,
    segmental: segmentalTable(input.types, input.values),
  };
}

// ─── gym progress (E36) ─────────────────────────────────────────────────────

/**
 * BR-REC-112, P5: "No change" when the change is under 1% of the first reading (both 0 is no
 * change; first 0 and latest not 0 is a change); otherwise improved or worse by the direction.
 * `none` has no outcome.
 */
export function changeOutcome(
  first: number,
  latest: number,
  better: Better,
): "improved" | "noChange" | "worse" | null {
  if (better === "none") return null;
  const change = inThousandths(latest - first);
  if (change === 0) return "noChange";
  if (Math.abs(change) * 100 < Math.abs(inThousandths(first))) {
    return "noChange";
  }
  return (better === "higher") === change > 0 ? "improved" : "worse";
}

/**
 * P4, P5: members with 2+ readings count (`n`); one reading is `notCounted`; none is ignored.
 * `avgChange` is the mean of latest - first, 3 decimals, `null` when `n` is 0. "No direction"
 * keeps the average and zero counts.
 */
export function progressStats(
  better: Better,
  members: { count: number; first: number; latest: number }[],
): {
  n: number;
  notCounted: number;
  avgChange: number | null;
  improved: number;
  noChange: number;
  worse: number;
} {
  let n = 0;
  let notCounted = 0;
  let changeSum = 0;
  const outcomes = { improved: 0, noChange: 0, worse: 0 };
  for (const member of members) {
    if (member.count === 1) notCounted += 1;
    if (member.count < 2) continue;
    n += 1;
    changeSum += inThousandths(member.latest - member.first);
    const outcome = changeOutcome(member.first, member.latest, better);
    if (outcome !== null) outcomes[outcome] += 1;
  }
  return {
    n,
    notCounted,
    avgChange: n === 0 ? null : roundHalfAway(changeSum / n) / 1000 || 0,
    ...outcomes,
  };
}

// ─── age bands (BR-REC-114) ─────────────────────────────────────────────────

/** Each band starts at this age; a band ends where the next one starts. */
const BAND_STARTS: readonly { band: AgeBand; from: number }[] = [
  { band: "under20", from: 0 },
  { band: "20to29", from: 20 },
  { band: "30to39", from: 30 },
  { band: "40to49", from: 40 },
  { band: "50to59", from: 50 },
  { band: "60plus", from: 60 },
];

/** Band of the age on `today`: born 1996-11-01 is 29 on 2026-10-03, so `20to29`. */
export function ageBand(dateOfBirth: IsoDate, today: IsoDate): AgeBand {
  const age = ageOn(dateOfBirth, today);
  let found: AgeBand = "under20";
  for (const { band, from } of BAND_STARTS) {
    if (age >= from) found = band;
  }
  return found;
}

/**
 * The birth days that make a member of `band` on `today`, for a database filter: born on or
 * before `onOrBefore` (at least the band's first age) and after `after` (younger than the next
 * band's first age); `null` = no limit. Same answer as `ageBand` for every day (months are
 * clamped to the month end, so 29 Feb behaves as in `ageOn`).
 */
export function ageBandBirthRange(
  band: AgeBand,
  today: IsoDate,
): { onOrBefore: IsoDate | null; after: IsoDate | null } {
  const index = BAND_STARTS.findIndex((entry) => entry.band === band);
  const start = BAND_STARTS[index];
  const next = BAND_STARTS[index + 1];
  return {
    onOrBefore:
      start === undefined || start.from === 0
        ? null
        : addMonths(today, -12 * start.from),
    after: next === undefined ? null : addMonths(today, -12 * next.from),
  };
}

// ─── leaderboard (E37) and plans (E38) ──────────────────────────────────────

/**
 * P6: best value first (`higher` descending, `lower` ascending); equal values go by earlier
 * date, then name (case-insensitive), then id. `rank` = 1 + the number of entries with a
 * strictly better value, so equal values share a rank (1, 2, 2, 4).
 */
export function rankLeaderboard<
  T extends { memberId: string; fullName: string; value: number; on: IsoDate },
>(entries: T[], better: "higher" | "lower"): (T & { rank: number })[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.value !== b.value) {
      return better === "higher" ? b.value - a.value : a.value - b.value;
    }
    if (a.on !== b.on) return a.on < b.on ? -1 : 1;
    const nameA = a.fullName.toLowerCase();
    const nameB = b.fullName.toLowerCase();
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || entry.value !== sorted[index - 1]?.value) {
      rank = index + 1;
    }
    return { ...entry, rank };
  });
}

/** P7: members whose latest period is active or expiring, counted by its plan, plus the total. */
export function countActiveByPlan(
  members: { plan: Plan; status: MembershipStatus }[],
): ActiveByPlan {
  const counts: ActiveByPlan = {
    monthly: 0,
    quarterly: 0,
    halfAnnual: 0,
    annual: 0,
    total: 0,
  };
  for (const { plan, status } of members) {
    if (status === "expired") continue;
    counts[plan === "half_annual" ? "halfAnnual" : plan] += 1;
    counts.total += 1;
  }
  return counts;
}
