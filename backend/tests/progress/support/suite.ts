import { afterAll, beforeAll, expect } from "bun:test";

import { eq, inArray, like, sql } from "drizzle-orm";

import { createApp } from "../../../src/app";
import { db } from "../../../src/db/client";
import {
  assessments,
  assessmentTypes,
  auditLog,
  gymSettings,
  idempotencyKeys,
  measurements,
  members,
  membershipPeriods,
  metrics,
} from "../../../src/db/schemas";
import { ACCESS_COOKIE } from "../../../src/lib/auth-middleware";
import { call, type Reply } from "../../helpers/http";
import { createSignedInSession } from "../../helpers/session";

// Shared plumbing for the member-records/progress tests (E35-E39, BR-REC-22...24, 106...119).
// Fixtures are written straight to the database (so a test of one endpoint never depends on
// another one) and removed again in afterAll. Every member carries MARK in its name and every
// assessment / measurement made here carries MARK_TYPE in its name, so the cleanup (and the
// sweep of a crashed earlier run) touches only rows this suite made.
// Dates are relative to the gym's today: the API reads the real clock.

export const MARK = "TEST_progress";
const MARK_LIKE = "%TEST\\_progress%";
const MARK_TYPE_LIKE = "TEST\\_progress\\_%";
export const GYM_NAME = "TEST_progress Gym";

export type IsoDate = string;
export type PlanName = "monthly" | "quarterly" | "half_annual" | "annual";
export type Better = "higher" | "lower" | "none";
export type Part = "whole_body" | "arms" | "trunk" | "legs";
export type Sex = "male" | "female";

// ─── dates (independent of the code under test) ─────────────────────────────

export function addDays(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The calendar day it is now in `timeZone`. */
export function todayIn(timeZone: string): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const PLAN_MONTHS: Record<PlanName, number> = {
  monthly: 1,
  quarterly: 3,
  half_annual: 6,
  annual: 12,
};

/** BR-REC-51: the day before the same date N months later (clamped to the month end). */
export function endOf(plan: PlanName, startOn: IsoDate): IsoDate {
  const [y, m, d] = startOn.split("-").map(Number) as [number, number, number];
  const total = m - 1 + PLAN_MONTHS[plan];
  const ty = y + Math.floor(total / 12);
  const tm = total % 12;
  const daysInMonth = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  if (d > daysInMonth) {
    return new Date(Date.UTC(ty, tm, daysInMonth)).toISOString().slice(0, 10);
  }
  return addDays(new Date(Date.UTC(ty, tm, d)).toISOString().slice(0, 10), -1);
}

/** A start day whose `plan` period ends exactly on `endOn`. */
export function startFor(plan: PlanName, endOn: IsoDate): IsoDate {
  const months = PLAN_MONTHS[plan];
  for (let back = months * 28 - 2; back <= months * 31 + 2; back++) {
    const start = addDays(endOn, -back);
    if (endOf(plan, start) === endOn) return start;
  }
  throw new Error(`no ${plan} start ends on ${endOn}`);
}

/** A date of birth `years` before `today`, moved by `shiftDays`: (30, 0) is a 30th birthday today. */
export function birthdayOffset(
  today: IsoDate,
  years: number,
  shiftDays = 0,
): IsoDate {
  const [y, m, rawDay] = today.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = m === 2 && rawDay === 29 ? 28 : rawDay;
  const pad = (n: number) => String(n).padStart(2, "0");
  return addDays(`${y - years}-${pad(m)}-${pad(d)}`, shiftDays);
}

/** Age in whole years on `on` (independent implementation, for expectations). */
export function ageOnDay(dateOfBirth: IsoDate, on: IsoDate): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [y, m, d] = on.split("-").map(Number) as [number, number, number];
  return y - by - (m > bm || (m === bm && d >= bd) ? 0 : 1);
}

// ─── fixtures ───────────────────────────────────────────────────────────────

export type MetricSpec = {
  name?: string;
  unit?: string;
  datatype?: "number" | "duration";
  decimals?: 0 | 1 | 2;
  better?: Better;
  sortOrder?: number;
  isActive?: boolean;
  tableGroup?: string;
  tablePart?: Part;
};
export type MadeType = { id: string; name: string; sortOrder: number };
export type MadeMetric = {
  id: string;
  typeId: string;
  name: string;
  unit: string;
  datatype: "number" | "duration";
  decimals: 0 | 1 | 2;
  better: Better;
  sortOrder: number;
  isActive: boolean;
};

export type SeedPeriod = { plan?: PlanName; startOn: IsoDate; endOn?: IsoDate };
export type MemberSpec = {
  /** shown name without the MARK suffix, e.g. "Surya Pratap" */
  name: string;
  sex?: Sex;
  dateOfBirth?: IsoDate;
  joinedOn?: IsoDate;
  archived?: boolean;
  /** default: one annual period that started 100 days ago */
  periods?: SeedPeriod[];
  phone?: string;
  email?: string | null;
  notes?: string | null;
  objective?: string | null;
};
export type MadeMember = { id: string; fullName: string; periodIds: string[] };

export type Point = [on: IsoDate, value: number, estimated?: boolean];

type Query = Record<string, string | number | undefined>;

function queryString(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

let phoneCounter = 0;
const PHONE_SALT = String(Math.floor(10_000 + Math.random() * 89_999));
/** A 10-digit phone nobody else uses. */
export function nextPhone(): string {
  phoneCounter += 1;
  return `8${PHONE_SALT}${String(phoneCounter).padStart(4, "0")}`;
}

let orderCounter = 0;
const nextOrder = () => {
  orderCounter += 1;
  return 600_000 + orderCounter;
};

const RUN_ID = crypto.randomUUID().slice(0, 8);

// ─── tiny assertions ────────────────────────────────────────────────────────

/** `data` of a reply, after checking the status. */
export function dataOf<T>(reply: Reply, status = 200): T {
  expect(reply.status).toBe(status);
  expect(reply.body?.success).toBe(true);
  return reply.body?.data as T;
}

/** The error envelope of BR-REC-154: `{ success: false, message, code }`. */
export function expectError(reply: Reply, status: number, code: string): void {
  expect(reply.status).toBe(status);
  expect(reply.body).toMatchObject({ success: false, code });
  expect(typeof reply.body?.message).toBe("string");
}

/** `fullName` without the MARK suffix: "Surya Pratap TEST_progress" -> "Surya Pratap". */
export function bare(fullName: string): string {
  return fullName.replace(` ${MARK}`, "");
}

// ─── CSV (an independent RFC 4180 reader, for the export tests) ─────────────

/** Splits CSV text into rows of cells: quotes, doubled quotes, CRLF inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 2;
    } else {
      cell += ch;
      i += 1;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ─── the suite ──────────────────────────────────────────────────────────────

type SettingsRow = typeof gymSettings.$inferSelect;

export type Suite = ReturnType<typeof useProgressSuite>;

/**
 * Call at the top level of a test file. Signs in with a real session, makes sure the gym
 * settings row exists (named GYM_NAME, Asia/Kolkata, 14 lead days), and removes everything this
 * file created afterwards.
 */
export function useProgressSuite() {
  const app = createApp();
  const memberIds = new Set<string>();
  const typeIds = new Set<string>();
  let session: Awaited<ReturnType<typeof createSignedInSession>> | null = null;
  let settingsBefore: SettingsRow | null = null;
  let timezone = "Asia/Kolkata";

  async function sweep(): Promise<void> {
    const memberRows = await db
      .select({ id: members.id })
      .from(members)
      .where(like(members.fullName, MARK_LIKE));
    for (const row of memberRows) memberIds.add(row.id);
    const typeRows = await db
      .select({ id: assessmentTypes.id })
      .from(assessmentTypes)
      .where(like(assessmentTypes.name, MARK_TYPE_LIKE));
    for (const row of typeRows) typeIds.add(row.id);

    const mIds = [...memberIds];
    const tIds = [...typeIds];
    if (mIds.length > 0) {
      await db.delete(measurements).where(inArray(measurements.memberId, mIds));
      await db.delete(assessments).where(inArray(assessments.memberId, mIds));
    }
    if (tIds.length > 0) {
      await db
        .delete(measurements)
        .where(
          inArray(
            measurements.metricId,
            db
              .select({ id: metrics.id })
              .from(metrics)
              .where(inArray(metrics.typeId, tIds)),
          ),
        );
      await db.delete(assessments).where(inArray(assessments.typeId, tIds));
      await db.delete(metrics).where(inArray(metrics.typeId, tIds));
      await db.delete(assessmentTypes).where(inArray(assessmentTypes.id, tIds));
    }
    if (mIds.length > 0) {
      await db
        .delete(membershipPeriods)
        .where(inArray(membershipPeriods.memberId, mIds));
      await db.delete(members).where(inArray(members.id, mIds));
    }
  }

  const suite = {
    app,
    get token(): string {
      return session?.token ?? "";
    },
    get sessionId(): string {
      return session?.sessionId ?? "";
    },
    get timezone(): string {
      return timezone;
    },
    /** the gym's today, in the gym's current time zone setting */
    today(): IsoDate {
      return todayIn(timezone);
    },
    /** gym today + `days` */
    day(days: number): IsoDate {
      return addDays(todayIn(timezone), days);
    },

    /** Changes the one gym settings row. */
    async setSettings(patch: {
      gymName?: string;
      timezone?: string;
      expiryLeadDays?: number;
    }): Promise<void> {
      await db.insert(gymSettings).values({}).onConflictDoNothing();
      await db.update(gymSettings).set(patch).where(eq(gymSettings.id, 1));
      if (patch.timezone) timezone = patch.timezone;
    },

    // ── HTTP ──
    /** Signed-in GET through the app, with the body read as JSON (null when it is not JSON). */
    get(path: string, query?: Query): Promise<Reply> {
      return call(app, "GET", `${path}${queryString(query)}`, {
        token: suite.token,
      });
    },
    /** A GET whose body is left unread (streams stay streams). `token: null` = signed out. */
    rawGet(
      path: string,
      init: { token?: string | null; headers?: Record<string, string> } = {},
    ): Promise<Response> {
      const headers: Record<string, string> = { ...(init.headers ?? {}) };
      const token = init.token === undefined ? suite.token : init.token;
      if (token) headers.Cookie = `${ACCESS_COOKIE}=${token}`;
      return Promise.resolve(app.request(path, { method: "GET", headers }));
    },
    reportCard(memberId: string): Promise<Reply> {
      return suite.get(`/api/members/${memberId}/report-card`);
    },
    progress(query: Query): Promise<Reply> {
      return suite.get("/api/reports/progress", query);
    },
    leaderboard(query: Query): Promise<Reply> {
      return suite.get("/api/reports/leaderboard", query);
    },
    activeByPlan(): Promise<Reply> {
      return suite.get("/api/reports/active-by-plan");
    },
    /** E39 as text, with its parsed rows (header row first). */
    async exportCsv(file: string): Promise<{
      res: Response;
      text: string;
      rows: string[][];
    }> {
      const res = await suite.rawGet(`/api/exports/${file}`);
      // decoded by hand so a byte order mark is kept in the text (fetch's text() may drop it)
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        await res.arrayBuffer(),
      );
      const clean = text.startsWith("\uFEFF") ? text.slice(1) : text;
      return { res, text, rows: parseCsv(clean) };
    },

    // ── database fixtures ──
    async makeType(
      spec: { label?: string; sortOrder?: number; isActive?: boolean } = {},
    ): Promise<MadeType> {
      const sortOrder = spec.sortOrder ?? nextOrder();
      const name = `${MARK}_${spec.label ?? "type"}_${RUN_ID}_${crypto.randomUUID().slice(0, 6)}`;
      const [row] = await db
        .insert(assessmentTypes)
        .values({
          name,
          intervalCount: 1,
          intervalUnit: "month",
          isActive: spec.isActive ?? true,
          sortOrder,
        })
        .returning({ id: assessmentTypes.id });
      const id = (row as { id: string }).id;
      typeIds.add(id);
      return { id, name, sortOrder };
    },

    async makeMetric(
      typeId: string,
      spec: MetricSpec = {},
    ): Promise<MadeMetric> {
      const sortOrder = spec.sortOrder ?? nextOrder();
      const made = {
        typeId,
        name: spec.name ?? `Metric ${crypto.randomUUID().slice(0, 8)}`,
        unit: spec.unit ?? "",
        datatype: spec.datatype ?? "number",
        decimals: spec.decimals ?? (spec.datatype === "duration" ? 0 : 1),
        better: spec.better ?? "higher",
        sortOrder,
        isActive: spec.isActive ?? true,
      } as const;
      const [row] = await db
        .insert(metrics)
        .values({
          ...made,
          tableGroup: spec.tableGroup ?? null,
          tablePart: spec.tablePart ?? null,
        })
        .returning({ id: metrics.id });
      return { id: (row as { id: string }).id, ...made };
    },

    /** One type with one metric: the common fixture of an E36 / E37 test. */
    async makeSingleMetric(spec: MetricSpec = {}): Promise<MadeMetric> {
      const type = await suite.makeType({ label: "single" });
      return suite.makeMetric(type.id, spec);
    },

    async makeMember(spec: MemberSpec): Promise<MadeMember> {
      const periods: SeedPeriod[] = spec.periods ?? [
        { plan: "annual", startOn: suite.day(-100) },
      ];
      const earliest = periods
        .map((p) => p.startOn)
        .sort()
        .at(0) as IsoDate;
      const phone = spec.phone ?? nextPhone();
      const fullName = `${spec.name} ${MARK}`;
      const [row] = await db
        .insert(members)
        .values({
          fullName,
          phone,
          phoneDigits: phone.replace(/\D/g, ""),
          email: spec.email ?? null,
          dateOfBirth: spec.dateOfBirth ?? "1990-01-15",
          sex: spec.sex ?? "male",
          joinedOn: spec.joinedOn ?? earliest,
          objective: spec.objective ?? null,
          notes: spec.notes ?? null,
          archivedAt: spec.archived ? new Date(Date.now() - 3_600_000) : null,
        })
        .returning({ id: members.id });
      const id = (row as { id: string }).id;
      memberIds.add(id);

      const periodIds: string[] = [];
      for (const p of periods) {
        const plan = p.plan ?? "annual";
        const [pr] = await db
          .insert(membershipPeriods)
          .values({
            memberId: id,
            plan,
            startOn: p.startOn,
            endOn: p.endOn ?? endOf(plan, p.startOn),
          })
          .returning({ id: membershipPeriods.id });
        periodIds.push((pr as { id: string }).id);
      }
      return { id, fullName, periodIds };
    },

    /**
     * `count` members in two statements, all with one annual / monthly ... period
     * `plan` started `startDaysAgo` days ago (for plan counts and the large export).
     */
    async makeBulkMembers(
      count: number,
      label: string,
      options: {
        plan: PlanName;
        startOn: IsoDate;
        endOn?: IsoDate;
        archived?: boolean;
      },
    ): Promise<string[]> {
      const rows = Array.from({ length: count }, (_, i) => {
        const phone = nextPhone();
        return {
          fullName: `${label} ${String(i).padStart(4, "0")} ${MARK}`,
          phone,
          phoneDigits: phone,
          dateOfBirth: "1990-01-15",
          sex: "male",
          joinedOn: options.startOn,
          archivedAt: options.archived
            ? new Date(Date.now() - 3_600_000)
            : null,
        };
      });
      const ids: string[] = [];
      for (let from = 0; from < rows.length; from += 500) {
        const inserted = await db
          .insert(members)
          .values(rows.slice(from, from + 500))
          .returning({ id: members.id });
        for (const r of inserted) ids.push(r.id);
      }
      for (const id of ids) memberIds.add(id);
      const endOn = options.endOn ?? endOf(options.plan, options.startOn);
      for (let from = 0; from < ids.length; from += 500) {
        await db.insert(membershipPeriods).values(
          ids.slice(from, from + 500).map((memberId) => ({
            memberId,
            plan: options.plan,
            startOn: options.startOn,
            endOn,
          })),
        );
      }
      return ids;
    },

    /**
     * One assessment (member + type + day) with the given values; reuses the assessment when
     * that member already has one of that type on that day. Returns the assessment id.
     */
    async record(
      memberId: string,
      typeId: string,
      on: IsoDate,
      values: Array<[metric: MadeMetric | string, value: number]>,
      options: { estimated?: boolean } = {},
    ): Promise<string> {
      const existing = await db
        .select({ id: assessments.id })
        .from(assessments)
        .where(
          sql`${assessments.memberId} = ${memberId} and ${assessments.typeId} = ${typeId} and ${assessments.assessedOn} = ${on}`,
        );
      let assessmentId = existing[0]?.id;
      if (!assessmentId) {
        const [row] = await db
          .insert(assessments)
          .values({
            memberId,
            typeId,
            assessedOn: on,
            isEstimated: options.estimated ?? false,
          })
          .returning({ id: assessments.id });
        assessmentId = (row as { id: string }).id;
      }
      for (const [metric, value] of values) {
        await db.insert(measurements).values({
          assessmentId,
          metricId: typeof metric === "string" ? metric : metric.id,
          memberId,
          measuredOn: on,
          value,
        });
      }
      return assessmentId;
    },

    /** Readings of one metric: one assessment per `[day, value, estimated?]`, in the order given. */
    async series(
      memberId: string,
      metric: MadeMetric,
      points: Point[],
    ): Promise<void> {
      for (const [on, value, estimated] of points) {
        await suite.record(
          memberId,
          metric.typeId,
          on,
          [[metric, value]],
          estimated === undefined ? {} : { estimated },
        );
      }
    },

    /** Archives or restores through the database (not the API). */
    async setArchived(memberId: string, archived: boolean): Promise<void> {
      await db
        .update(members)
        .set({ archivedAt: archived ? new Date() : null })
        .where(eq(members.id, memberId));
    },

    /** Number of change-log rows in the whole database. */
    async auditCount(): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(auditLog);
      return (row as { n: number }).n;
    },
  };

  beforeAll(async () => {
    session = await createSignedInSession();
    const [existing] = await db.select().from(gymSettings).limit(1);
    settingsBefore = existing ?? null;
    await db.insert(gymSettings).values({}).onConflictDoNothing();
    await db
      .update(gymSettings)
      .set({
        gymName: GYM_NAME,
        timezone: "Asia/Kolkata",
        expiryLeadDays: 14,
      })
      .where(eq(gymSettings.id, 1));
    timezone = "Asia/Kolkata";
    await sweep();
  });

  afterAll(async () => {
    if (session) {
      await db
        .delete(auditLog)
        .where(eq(auditLog.sessionId, session.sessionId));
      await db
        .delete(idempotencyKeys)
        .where(eq(idempotencyKeys.sessionId, session.sessionId));
    }
    await sweep();

    if (settingsBefore) {
      await db
        .update(gymSettings)
        .set({
          gymName: settingsBefore.gymName,
          timezone: settingsBefore.timezone,
          upcomingLeadDays: settingsBefore.upcomingLeadDays,
          expiryLeadDays: settingsBefore.expiryLeadDays,
        })
        .where(eq(gymSettings.id, 1));
    } else {
      await db.execute(sql`delete from gym_settings`);
    }
    await session?.cleanup();
  });

  return suite;
}
