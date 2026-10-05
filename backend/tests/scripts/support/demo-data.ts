// Plumbing for the `seed:demo` test (BR-REC-176): read-back of what the script wrote, clean-up by the
// fixed demo member ids, and the oracles the spec's Check column is measured with.
//
// The oracles are the pure domain functions of the app (`computeDue`, `membershipStatus`, ...), so
// "overdue", "Expiring" or "Recently ended" mean exactly what the due list and the member list mean.
// Nothing here looks at how the script builds its rows; it reads tables only.
import { sql } from "drizzle-orm";
import { seed } from "../../../scripts/seed";
import { DEMO_MEMBER_IDS } from "../../../scripts/seed-demo";
import { db } from "../../../src/db/client";
import { addDays, type IsoDate } from "../../../src/lib/domain/dates";
import {
  computeDue,
  type DueAssessmentType,
  type DueLastMeasured,
  type DueOverride,
  type DueStatus,
  isListedInDueList,
} from "../../../src/lib/domain/due";
import { membershipStatus } from "../../../src/lib/domain/membership";
import type {
  DueOverrideKind,
  IntervalUnit,
  MembershipStatus,
} from "../../../src/lib/enums";
import { resetCatalog, resetSingletons } from "../../helpers/seed-data";

type Row = Record<string, unknown>;

export const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> =>
  Array.from(await db.execute(q)) as Row[];

const text = (value: unknown): string => String(value);
const textOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

// ─── clean-up ───────────────────────────────────────────────────────────────

/** Deletes the demo rows, children first, by the fixed demo member ids only. */
export async function wipeDemo(): Promise<void> {
  const ids = sql.join(
    DEMO_MEMBER_IDS.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  await db.execute(sql`delete from due_overrides where member_id in (${ids})`);
  await db.execute(sql`delete from measurements where member_id in (${ids})`);
  await db.execute(sql`delete from assessments where member_id in (${ids})`);
  await db.execute(
    sql`delete from membership_periods where member_id in (${ids})`,
  );
  await db.execute(sql`delete from members where id in (${ids})`);
}

/** Back to the state the demo seed expects after `db:reset`: catalog + settings, no members. */
export async function prepareCatalog(): Promise<void> {
  await wipeDemo();
  await resetCatalog();
  await resetSingletons();
  await seed();
  const [left] = await rows(sql`select count(*)::int as n from members`);
  if (Number(left?.n) !== 0) {
    throw new Error(
      `The test database holds ${String(left?.n)} member(s) this test did not create. Run \`bun run db:test:prepare\` and retry.`,
    );
  }
}

/** What afterAll leaves behind: nothing of the demo, and the catalog/singletons other suites expect gone. */
export async function cleanAll(): Promise<void> {
  await wipeDemo();
  await resetCatalog();
  await resetSingletons();
}

// ─── read-back ──────────────────────────────────────────────────────────────

export type DemoMember = {
  id: string;
  fullName: string;
  phone: string;
  phoneDigits: string;
  email: string | null;
  objective: string | null;
  notes: string | null;
  dateOfBirth: IsoDate;
  sex: string;
  joinedOn: IsoDate;
  archived: boolean;
};
export type DemoPeriod = {
  memberId: string;
  plan: string;
  startOn: IsoDate;
  endOn: IsoDate;
};
export type DemoAssessment = {
  id: string;
  memberId: string;
  typeId: string;
  typeName: string;
  assessedOn: IsoDate;
  isEstimated: boolean;
};
export type DemoMeasurement = {
  assessmentId: string;
  assessmentMemberId: string;
  assessmentTypeId: string;
  assessmentDate: IsoDate;
  memberId: string;
  metricId: string;
  metricTypeId: string;
  metricName: string;
  typeName: string;
  measuredOn: IsoDate;
  value: number;
  better: string;
  datatype: string;
  decimals: number;
};
export type DemoOverride = {
  memberId: string;
  typeId: string;
  typeName: string;
  kind: string;
  setOn: IsoDate;
  untilOn: IsoDate | null;
  /** latest `assessed_on` of the member + type among saves made at or after the override was created */
  latestAssessedOnSinceSet: IsoDate | null;
};
export type DemoSettings = {
  timezone: string;
  upcomingLeadDays: number;
  expiryLeadDays: number;
};
export type DemoData = {
  members: DemoMember[];
  periods: DemoPeriod[];
  assessments: DemoAssessment[];
  measurements: DemoMeasurement[];
  overrides: DemoOverride[];
  settings: DemoSettings;
  /** the catalog in the shape `computeDue` takes (all measurements, on and off) */
  catalog: DueAssessmentType[];
};

export async function readDemo(): Promise<DemoData> {
  const memberRows = await rows(sql`
    select id::text as id, full_name, phone, phone_digits, email, objective, notes,
           date_of_birth::text as dob, sex, joined_on::text as joined_on,
           (archived_at is not null) as archived
    from members order by id`);
  const periodRows = await rows(sql`
    select member_id::text as member_id, plan, start_on::text as start_on, end_on::text as end_on
    from membership_periods order by member_id, start_on`);
  const assessmentRows = await rows(sql`
    select a.id::text as id, a.member_id::text as member_id, a.type_id::text as type_id,
           t.name as type_name, a.assessed_on::text as assessed_on, a.is_estimated
    from assessments a join assessment_types t on t.id = a.type_id
    order by a.member_id, t.sort_order, a.assessed_on`);
  const measurementRows = await rows(sql`
    select x.assessment_id::text as assessment_id, a.member_id::text as assessment_member_id,
           a.type_id::text as assessment_type_id, a.assessed_on::text as assessment_date,
           x.member_id::text as member_id, x.metric_id::text as metric_id,
           m.type_id::text as metric_type_id, m.name as metric_name, t.name as type_name,
           x.measured_on::text as measured_on, x.value::float8 as value,
           m.better, m.datatype, m.decimals
    from measurements x
      join assessments a on a.id = x.assessment_id
      join assessment_types t on t.id = a.type_id
      join metrics m on m.id = x.metric_id
    order by x.member_id, a.assessed_on, m.sort_order`);
  const overrideRows = await rows(sql`
    select o.member_id::text as member_id, o.type_id::text as type_id, t.name as type_name,
           o.kind, o.set_on::text as set_on, o.until_on::text as until_on,
           (select max(a.assessed_on)::text from assessments a
             where a.member_id = o.member_id and a.type_id = o.type_id
               and a.updated_at >= o.created_at) as latest_since
    from due_overrides o join assessment_types t on t.id = o.type_id
    order by o.member_id, t.sort_order`);
  const [settingsRow] = await rows(
    sql`select timezone, upcoming_lead_days, expiry_lead_days from gym_settings limit 1`,
  );
  if (!settingsRow) throw new Error("gym_settings has no row; run seed first");
  const typeRows = await rows(
    sql`select id::text as id, name, is_active, sort_order, interval_count, interval_unit from assessment_types order by sort_order`,
  );
  const metricRows = await rows(
    sql`select id::text as id, type_id::text as type_id, name, is_active, sort_order, interval_count, interval_unit from metrics order by sort_order`,
  );

  return {
    members: memberRows.map((r) => ({
      id: text(r.id),
      fullName: text(r.full_name),
      phone: text(r.phone),
      phoneDigits: text(r.phone_digits),
      email: textOrNull(r.email),
      objective: textOrNull(r.objective),
      notes: textOrNull(r.notes),
      dateOfBirth: text(r.dob),
      sex: text(r.sex),
      joinedOn: text(r.joined_on),
      archived: Boolean(r.archived),
    })),
    periods: periodRows.map((r) => ({
      memberId: text(r.member_id),
      plan: text(r.plan),
      startOn: text(r.start_on),
      endOn: text(r.end_on),
    })),
    assessments: assessmentRows.map((r) => ({
      id: text(r.id),
      memberId: text(r.member_id),
      typeId: text(r.type_id),
      typeName: text(r.type_name),
      assessedOn: text(r.assessed_on),
      isEstimated: Boolean(r.is_estimated),
    })),
    measurements: measurementRows.map((r) => ({
      assessmentId: text(r.assessment_id),
      assessmentMemberId: text(r.assessment_member_id),
      assessmentTypeId: text(r.assessment_type_id),
      assessmentDate: text(r.assessment_date),
      memberId: text(r.member_id),
      metricId: text(r.metric_id),
      metricTypeId: text(r.metric_type_id),
      metricName: text(r.metric_name),
      typeName: text(r.type_name),
      measuredOn: text(r.measured_on),
      value: Number(r.value),
      better: text(r.better),
      datatype: text(r.datatype),
      decimals: Number(r.decimals),
    })),
    overrides: overrideRows.map((r) => ({
      memberId: text(r.member_id),
      typeId: text(r.type_id),
      typeName: text(r.type_name),
      kind: text(r.kind),
      setOn: text(r.set_on),
      untilOn: textOrNull(r.until_on),
      latestAssessedOnSinceSet: textOrNull(r.latest_since),
    })),
    settings: {
      timezone: text(settingsRow.timezone),
      upcomingLeadDays: Number(settingsRow.upcoming_lead_days),
      expiryLeadDays: Number(settingsRow.expiry_lead_days),
    },
    catalog: typeRows.map((t) => ({
      id: text(t.id),
      name: text(t.name),
      isActive: Boolean(t.is_active),
      sortOrder: Number(t.sort_order),
      intervalCount: Number(t.interval_count),
      intervalUnit: text(t.interval_unit) as IntervalUnit,
      measurements: metricRows
        .filter((m) => text(m.type_id) === text(t.id))
        .map((m) => ({
          id: text(m.id),
          name: text(m.name),
          isActive: Boolean(m.is_active),
          sortOrder: Number(m.sort_order),
          intervalCount:
            m.interval_count === null ? null : Number(m.interval_count),
          intervalUnit:
            m.interval_unit === null
              ? null
              : (text(m.interval_unit) as IntervalUnit),
        })),
    })),
  };
}

// ─── oracles (the app's own pure rules) ─────────────────────────────────────

/** Due status of every member x turned-on assessment on `today`, as the due list computes it. */
export function dueStatuses(d: DemoData, today: IsoDate): DueStatus[] {
  const lastMeasured: DueLastMeasured[] = d.measurements.map((x) => ({
    memberId: x.memberId,
    metricId: x.metricId,
    measuredOn: x.measuredOn,
  }));
  const overrides: DueOverride[] = d.overrides.map((o) => ({
    memberId: o.memberId,
    typeId: o.typeId,
    kind: o.kind as DueOverrideKind,
    setOn: o.setOn,
    untilOn: o.untilOn,
    latestAssessedOnSinceSet: o.latestAssessedOnSinceSet,
  }));
  return computeDue({
    today,
    upcomingLeadDays: d.settings.upcomingLeadDays,
    members: d.members.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      joinedOn: m.joinedOn,
    })),
    types: d.catalog,
    lastMeasured,
    overrides,
  });
}

/** The member's latest period by start (BR-REC-52), or null when none. */
export function latestPeriod(d: DemoData, memberId: string): DemoPeriod | null {
  const own = d.periods
    .filter((p) => p.memberId === memberId)
    .sort((a, b) =>
      a.startOn < b.startOn ? 1 : a.startOn > b.startOn ? -1 : 0,
    );
  return own[0] ?? null;
}

export function membershipOf(
  d: DemoData,
  memberId: string,
  today: IsoDate,
): { status: MembershipStatus; daysLeft: number } | null {
  const latest = latestPeriod(d, memberId);
  return membershipStatus(
    latest ? { startOn: latest.startOn, endOn: latest.endOn } : null,
    today,
    d.settings.expiryLeadDays,
  );
}

/** Members the Due list shows: not archived, membership not ended (BR-REC-17). */
export function listedIds(d: DemoData, today: IsoDate): Set<string> {
  return new Set(
    d.members
      .filter((m) => {
        const latest = latestPeriod(d, m.id);
        return isListedInDueList(
          {
            archived: m.archived,
            latestMembership: latest
              ? { startOn: latest.startOn, endOn: latest.endOn }
              : null,
          },
          today,
        );
      })
      .map((m) => m.id),
  );
}

// ─── the Check column of BR-REC-176, as numbers ─────────────────────────────

export const BODY_COMPOSITION = "Body composition";
/** BR-REC-53: "ended in the last 30 days" */
export const RECENT_DAYS = 30;

export type Buckets = {
  members: number;
  archived: number;
  /** not archived, by the status of the latest membership period (BR-REC-52) */
  active: number;
  expiring: number;
  recentlyEnded: number;
  endedLongAgo: number;
  /** listed members with a Body composition status that is overdue (any reason, BR-REC-16) */
  overdue: number;
  /** listed members with a status that is due today (Due soon, 0 days) */
  dueToday: number;
  /** listed members with a status in the Due soon band, today included (BR-REC-96) */
  dueSoon: number;
  /** listed members with no assessment at all */
  neverRecorded: number;
  /** assessments with some, but not all, values of their type */
  partlyRecorded: number;
  flagRows: number;
  snoozeRows: number;
  flaggedActive: number;
  snoozedActive: number;
};

export function bucketsOf(d: DemoData, today: IsoDate): Buckets {
  const statuses = dueStatuses(d, today);
  const listed = listedIds(d, today);
  const listedStatuses = statuses.filter((s) => listed.has(s.memberId));
  const distinct = (list: DueStatus[]): number =>
    new Set(list.map((s) => s.memberId)).size;

  const live = d.members.filter((m) => !m.archived);
  const states = live.map((m) => membershipOf(d, m.id, today));
  const withAssessments = new Set(d.assessments.map((a) => a.memberId));

  const valuesPerAssessment = new Map<string, number>();
  for (const x of d.measurements) {
    valuesPerAssessment.set(
      x.assessmentId,
      (valuesPerAssessment.get(x.assessmentId) ?? 0) + 1,
    );
  }
  const metricsOfType = (typeId: string): number =>
    d.catalog
      .find((t) => t.id === typeId)
      ?.measurements.filter((m) => m.isActive).length ?? 0;

  return {
    members: d.members.length,
    archived: d.members.length - live.length,
    active: states.filter((s) => s?.status === "active").length,
    expiring: states.filter((s) => s?.status === "expiring").length,
    recentlyEnded: states.filter(
      (s) => s?.status === "expired" && s.daysLeft >= -RECENT_DAYS,
    ).length,
    endedLongAgo: states.filter(
      (s) => s?.status === "expired" && s.daysLeft < -RECENT_DAYS,
    ).length,
    overdue: distinct(
      listedStatuses.filter(
        (s) => s.typeName === BODY_COMPOSITION && s.state === "overdue",
      ),
    ),
    dueToday: distinct(
      listedStatuses.filter(
        (s) => s.state === "upcoming" && s.daysOverdue === 0,
      ),
    ),
    dueSoon: distinct(listedStatuses.filter((s) => s.state === "upcoming")),
    neverRecorded: d.members.filter(
      (m) => listed.has(m.id) && !withAssessments.has(m.id),
    ).length,
    partlyRecorded: d.assessments.filter((a) => {
      const n = valuesPerAssessment.get(a.id) ?? 0;
      return n > 0 && n < metricsOfType(a.typeId);
    }).length,
    flagRows: d.overrides.filter((o) => o.kind === "flag").length,
    snoozeRows: d.overrides.filter((o) => o.kind === "snooze").length,
    flaggedActive: statuses.filter((s) => s.flagged).length,
    snoozedActive: statuses.filter((s) => s.snoozedUntil !== null).length,
  };
}

// ─── snapshots, to compare two runs ─────────────────────────────────────────

/**
 * Every content row of the data set as a sorted list of JSON lines, dates moved by `shiftDays`
 * (0 = as stored). Ids of assessments are not stable and not compared; timestamps are moments, not days.
 * Period end dates are derived from the start by month maths, so a day shift is compared without them.
 */
export function snapshotOf(
  d: DemoData,
  shiftDays = 0,
  withPeriodEnds = true,
): Record<
  "members" | "periods" | "assessments" | "measurements" | "overrides",
  string[]
> {
  const day = (v: IsoDate): IsoDate => addDays(v, shiftDays);
  const lines = (list: unknown[]): string[] =>
    list.map((item) => JSON.stringify(item)).sort();
  return {
    members: lines(
      d.members.map((m) => ({
        ...m,
        dateOfBirth: day(m.dateOfBirth),
        joinedOn: day(m.joinedOn),
      })),
    ),
    periods: lines(
      d.periods.map((p) => ({
        memberId: p.memberId,
        plan: p.plan,
        startOn: day(p.startOn),
        endOn: withPeriodEnds ? p.endOn : undefined,
      })),
    ),
    assessments: lines(
      d.assessments.map((a) => ({
        memberId: a.memberId,
        type: a.typeName,
        assessedOn: day(a.assessedOn),
        isEstimated: a.isEstimated,
      })),
    ),
    measurements: lines(
      d.measurements.map((x) => ({
        memberId: x.memberId,
        type: x.typeName,
        metric: x.metricName,
        on: day(x.measuredOn),
        value: x.value,
      })),
    ),
    overrides: lines(
      d.overrides.map((o) => ({
        memberId: o.memberId,
        type: o.typeName,
        kind: o.kind,
        setOn: day(o.setOn),
        untilOn: o.untilOn === null ? null : day(o.untilOn),
      })),
    ),
  };
}
