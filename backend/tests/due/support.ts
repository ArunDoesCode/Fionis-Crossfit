// Shared plumbing for the member-records/due-list tests (E31-E34, due.md rules BR-REC-15..18, 93..105).
//
// Everything here talks to the app only through its public surface: HTTP routes via
// `createApp().request` and the Drizzle tables (fixtures and read-backs). Nothing imports the
// code under test except `createApp`.
//
// Fixtures: every row made here carries the `TEST_due_` prefix (members, assessment names), so the
// cleanup in afterAll removes only what this suite made. The test DB may hold other rows (seeded
// catalog, other suites' members): tests narrow their reads to their own assessments with `typeId`.
// Dates are relative to the gym's today, because the API reads the real clock (no override).
import { afterAll, afterEach, beforeAll, expect } from "bun:test";

import { and, eq, inArray, isNull, like, notLike, or } from "drizzle-orm";

import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  assessments,
  assessmentTypes,
  auditLog,
  dueOverrides,
  gymSettings,
  measurements,
  members,
  membershipPeriods,
  metrics,
} from "../../src/db/schemas";
import { call, mintToken, type Reply } from "../helpers/http";

export const MARK = "TEST_due_";
const MARK_LIKE = "TEST\\_due\\_%";

export type IsoDate = string;

// ─── dates (independent of the code under test) ─────────────────────────────

const ms = (iso: IsoDate): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export function addDays(iso: IsoDate, days: number): IsoDate {
  return new Date(ms(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Calendar months; lands on the month's last day when the day does not exist (BR-REC-94). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, last)))
    .toISOString()
    .slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** The calendar day it is now in `timeZone` (BR-REC-93). */
export function todayIn(timeZone: string): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ─── response shapes (contract.md "Response shapes") ────────────────────────

export type DueItemOut = { metricId: string; name: string };

export type DueRow = {
  memberId: string;
  fullName: string;
  typeId: string;
  typeName: string;
  dueOn: IsoDate;
  daysOverdue: number;
  flagged: boolean;
  items: DueItemOut[];
};

export type MemberDueRow = {
  typeId: string;
  typeName: string;
  state: "overdue" | "upcoming" | "ok";
  neverRecorded: boolean;
  nextDueOn: IsoDate;
  daysOverdue: number;
  flagged: boolean;
  snoozedUntil: IsoDate | null;
  items: DueItemOut[];
};

export type Meta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const DUE_ROW_KEYS = [
  "daysOverdue",
  "dueOn",
  "flagged",
  "fullName",
  "items",
  "memberId",
  "typeId",
  "typeName",
];

export const MEMBER_DUE_ROW_KEYS = [
  "daysOverdue",
  "flagged",
  "items",
  "neverRecorded",
  "nextDueOn",
  "snoozedUntil",
  "state",
  "typeId",
  "typeName",
];

export type Status = "overdue" | "upcoming";

// ─── assertions ─────────────────────────────────────────────────────────────

/** `data` of a success reply, after checking the status. */
export function dataOf<T>(reply: Reply, status = 200): T {
  expect(reply.status, JSON.stringify(reply.body)).toBe(status);
  expect(reply.body?.success).toBe(true);
  return reply.body?.data as T;
}

export function metaOf(reply: Reply): Meta {
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  return reply.body?.meta as unknown as Meta;
}

/** The error envelope of BR-REC-154: `{ success: false, message, code }`. */
export function expectError(reply: Reply, status: number, code: string): void {
  expect(reply.status, JSON.stringify(reply.body)).toBe(status);
  expect(reply.body?.success).toBe(false);
  expect(reply.body?.code).toBe(code);
  expect(typeof reply.body?.message).toBe("string");
}

/** 400 `VALIDATION_ERROR` with an issue on `path` (or inside it). */
export function expectInvalid(reply: Reply, path?: string): void {
  expectError(reply, 400, "VALIDATION_ERROR");
  if (path === undefined) return;
  const raw = (reply.body?.details as { issues?: unknown } | undefined)?.issues;
  const issues = Array.isArray(raw) ? raw : [];
  const paths = issues.map((item) => {
    const p = (item as { path?: unknown }).path;
    return Array.isArray(p) ? p.join(".") : String(p ?? "");
  });
  expect(
    paths.some((p) => p === path || p.startsWith(`${path}.`)),
    `no issue on "${path}" in ${JSON.stringify(reply.body?.details)}`,
  ).toBe(true);
}

// ─── fixtures ───────────────────────────────────────────────────────────────

export type TestMetric = {
  id: string;
  name: string;
  typeId: string;
  sortOrder: number;
};
export type TestType = {
  id: string;
  name: string;
  sortOrder: number;
  metrics: TestMetric[];
  /** the repeat in weeks, for types made with `makeWeeklyType` */
  weeks?: number;
};
export type TestMember = { id: string; fullName: string };

export type TypeOptions = {
  name?: string;
  intervalCount?: number;
  intervalUnit?: "week" | "month";
  isActive?: boolean;
  sortOrder?: number;
};
export type MetricOptions = {
  isActive?: boolean;
  sortOrder?: number;
  intervalCount?: number | null;
  intervalUnit?: "week" | "month" | null;
};
export type MemberOptions = {
  /** shown name, "TEST_due_" is added in front when missing */
  name?: string;
  joinedOn?: IsoDate;
  archived?: boolean;
  /** latest membership period(s); default: none (a member with no membership is listed) */
  periods?: { startOn: IsoDate; endOn: IsoDate }[];
};

export type Settings = { timezone: string; upcomingLeadDays: number };
export const DEFAULT_SETTINGS: Settings = {
  timezone: "Asia/Kolkata",
  upcomingLeadDays: 7,
};

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

export const PATH = {
  list: "/api/due",
  memberDue: (memberId: string) => `/api/members/${memberId}/due`,
  action: (memberId: string, typeId: string) =>
    `/api/members/${memberId}/due-actions/${typeId}`,
};

export type Suite = ReturnType<typeof useDueSuite>;

/**
 * Call at the top level of a test file. Signs in (a made-up session id the change log records),
 * puts the gym settings to the Setup defaults (Asia/Kolkata, Due soon 7 days) before every test,
 * and removes everything this file created afterwards (settings are put back as they were).
 */
export function useDueSuite() {
  const app = createApp();
  const trackedMembers = new Set<string>();
  const keptMembers = new Set<string>();
  const trackedTypes = new Set<string>();
  const sessionIds = new Set<string>();
  let counter = 0;
  let phoneCounter = 0;
  const phoneSalt = String(Math.floor(10_000 + Math.random() * 89_999));
  let settingsBefore: (typeof gymSettings.$inferSelect)[] = [];
  let timezone = DEFAULT_SETTINGS.timezone;

  let defaultToken = "";
  let defaultSid = "";

  async function resetSettings(): Promise<void> {
    await db.delete(gymSettings);
    await db.insert(gymSettings).values({ id: 1, ...DEFAULT_SETTINGS });
    timezone = DEFAULT_SETTINGS.timezone;
  }

  /** Removes every row this suite made, found by what it tracked and by the TEST_due_ name prefix. */
  async function removeMine(): Promise<void> {
    const sweepMembers = await db
      .select({ id: members.id })
      .from(members)
      .where(like(members.fullName, MARK_LIKE));
    for (const row of sweepMembers) trackedMembers.add(row.id);
    const sweepTypes = await db
      .select({ id: assessmentTypes.id })
      .from(assessmentTypes)
      .where(like(assessmentTypes.name, MARK_LIKE));
    for (const row of sweepTypes) trackedTypes.add(row.id);
    const memberIds = [...trackedMembers];
    const typeIds = [...trackedTypes];

    for (const sid of sessionIds) {
      await db.delete(auditLog).where(eq(auditLog.sessionId, sid));
    }
    if (memberIds.length > 0 || typeIds.length > 0) {
      const where = or(
        memberIds.length > 0
          ? inArray(dueOverrides.memberId, memberIds)
          : undefined,
        typeIds.length > 0 ? inArray(dueOverrides.typeId, typeIds) : undefined,
      );
      await db.delete(dueOverrides).where(where);
      await db
        .delete(assessments)
        .where(
          or(
            memberIds.length > 0
              ? inArray(assessments.memberId, memberIds)
              : undefined,
            typeIds.length > 0
              ? inArray(assessments.typeId, typeIds)
              : undefined,
          ),
        );
    }
    if (memberIds.length > 0) {
      await db
        .delete(membershipPeriods)
        .where(inArray(membershipPeriods.memberId, memberIds));
    }
    if (typeIds.length > 0) {
      await db.delete(metrics).where(inArray(metrics.typeId, typeIds));
      await db
        .delete(assessmentTypes)
        .where(inArray(assessmentTypes.id, typeIds));
    }
    if (memberIds.length > 0) {
      await db.delete(members).where(inArray(members.id, memberIds));
    }
  }

  const suite = {
    app,
    get token(): string {
      return defaultToken;
    },
    /** the sign-in id: every change-log row of this file's default sign-in carries it */
    get sessionId(): string {
      return defaultSid;
    },
    get timezone(): string {
      return timezone;
    },

    /** The gym's today in the gym's current time-zone setting. */
    today(): IsoDate {
      return todayIn(timezone);
    },
    /** gym today + `days` */
    day(days: number): IsoDate {
      return addDays(todayIn(timezone), days);
    },

    /** A new sign-in with its own session id, so its change-log rows can be counted alone. */
    async newActor(): Promise<{ sid: string; token: string }> {
      const sid = crypto.randomUUID();
      sessionIds.add(sid);
      return { sid, token: await mintToken(sid) };
    },

    /** Members that stay active after the current test (a fixture shared by several tests). */
    keep(memberIds: string[]): void {
      for (const id of memberIds) keptMembers.add(id);
    },

    /** Changes the one gym settings row (inserts it when missing). */
    async setSettings(patch: Partial<Settings>): Promise<void> {
      const next = { ...DEFAULT_SETTINGS, ...patch };
      await db.delete(gymSettings);
      await db.insert(gymSettings).values({ id: 1, ...next });
      timezone = next.timezone;
    },
    /** Removes the gym settings row: the engine must fall back to Asia/Kolkata and 7 days. */
    async removeSettings(): Promise<void> {
      await db.delete(gymSettings);
      timezone = DEFAULT_SETTINGS.timezone;
    },

    // ── HTTP ──
    get(path: string, query?: Query, token?: string | null): Promise<Reply> {
      return call(app, "GET", `${path}${queryString(query)}`, {
        token: token === undefined ? defaultToken : token,
      });
    },
    /** E31 */
    list(query?: Query, token?: string | null): Promise<Reply> {
      return suite.get(PATH.list, query, token);
    },
    /** E31 over every page of one tab (pageSize 100), optionally narrowed to `typeId`. */
    async listAll(
      status: Status,
      filter: { typeId?: string; typeIds?: string[] } = {},
    ): Promise<DueRow[]> {
      const rows: DueRow[] = [];
      for (let page = 1; ; page++) {
        const reply = await suite.list({
          status,
          page,
          pageSize: 100,
          typeId: filter.typeId,
        });
        const data = dataOf<DueRow[]>(reply);
        rows.push(...data);
        if (page >= metaOf(reply).totalPages) break;
      }
      return filter.typeIds
        ? rows.filter((row) => filter.typeIds?.includes(row.typeId))
        : rows;
    },
    /** E32 */
    memberDue(memberId: string, token?: string | null): Promise<Reply> {
      return suite.get(PATH.memberDue(memberId), undefined, token);
    },
    /** E32 narrowed to the given assessments (the catalog may hold others), in answer order. */
    async memberLines(
      memberId: string,
      typeIds: string[],
    ): Promise<MemberDueRow[]> {
      const reply = await suite.memberDue(memberId);
      return dataOf<MemberDueRow[]>(reply).filter((line) =>
        typeIds.includes(line.typeId),
      );
    },
    /** E32 line of one assessment. */
    async memberLine(memberId: string, typeId: string): Promise<MemberDueRow> {
      const lines = await suite.memberLines(memberId, [typeId]);
      const line = lines[0];
      if (!line) throw new Error(`E32 has no line for assessment ${typeId}`);
      return line;
    },
    /** E33 */
    setAction(
      memberId: string,
      typeId: string,
      body: unknown,
      options: { token?: string | null; origin?: string | null } = {},
    ): Promise<Reply> {
      return call(app, "PUT", PATH.action(memberId, typeId), {
        token: options.token === undefined ? defaultToken : options.token,
        ...(options.origin !== undefined ? { origin: options.origin } : {}),
        body,
      });
    },
    flag(memberId: string, typeId: string, token?: string) {
      return suite.setAction(
        memberId,
        typeId,
        { action: "flag" },
        token === undefined ? {} : { token },
      );
    },
    snooze(memberId: string, typeId: string, until: IsoDate, token?: string) {
      return suite.setAction(
        memberId,
        typeId,
        { action: "snooze", until },
        token === undefined ? {} : { token },
      );
    },
    /** E34 */
    clearAction(
      memberId: string,
      typeId: string,
      options: { token?: string | null; origin?: string | null } = {},
    ): Promise<Reply> {
      return call(app, "DELETE", PATH.action(memberId, typeId), {
        token: options.token === undefined ? defaultToken : options.token,
        ...(options.origin !== undefined ? { origin: options.origin } : {}),
      });
    },

    // ── database fixtures (so a test of one endpoint does not depend on another) ──
    /** An assessment (default: on, 1 month) with its own sort position at the end of the catalog. */
    async makeType(options: TypeOptions = {}): Promise<TestType> {
      counter += 1;
      const [row] = await db
        .insert(assessmentTypes)
        .values({
          name: options.name ?? `${MARK}type_${counter}_${crypto.randomUUID()}`,
          intervalCount: options.intervalCount ?? 1,
          intervalUnit: options.intervalUnit ?? "month",
          isActive: options.isActive ?? true,
          // far above anything seeded; later fixtures sort after earlier ones unless given
          sortOrder: options.sortOrder ?? 100_000 + counter,
        })
        .returning();
      if (!row) throw new Error("makeType: no row");
      trackedTypes.add(row.id);
      return {
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        metrics: [],
      };
    },

    /** A measurement of `type`; setup order = creation order unless `sortOrder` is given. */
    async makeMetric(
      type: TestType,
      name: string,
      options: MetricOptions = {},
    ): Promise<TestMetric> {
      const [row] = await db
        .insert(metrics)
        .values({
          typeId: type.id,
          name,
          unit: "kg",
          datatype: "number",
          decimals: 1,
          better: "higher",
          isActive: options.isActive ?? true,
          sortOrder: options.sortOrder ?? type.metrics.length + 1,
          intervalCount: options.intervalCount ?? null,
          intervalUnit: options.intervalUnit ?? null,
        })
        .returning();
      if (!row) throw new Error("makeMetric: no row");
      const metric = {
        id: row.id,
        name: row.name,
        typeId: type.id,
        sortOrder: row.sortOrder,
      };
      type.metrics.push(metric);
      return metric;
    },

    /**
     * A type with measurements named `names` (all on), repeating every `weeks` weeks (default 4,
     * so a value recorded today is due in 28 days: outside the 7-day Due soon window).
     */
    async makeWeeklyType(
      names: string[],
      options: Omit<TypeOptions, "intervalCount" | "intervalUnit"> & {
        weeks?: number;
      } = {},
    ): Promise<TestType> {
      const { weeks = 4, ...rest } = options;
      const type = await suite.makeType({
        ...rest,
        intervalCount: weeks,
        intervalUnit: "week",
      });
      type.weeks = weeks;
      for (const name of names) await suite.makeMetric(type, name);
      return type;
    },

    async makeMember(options: MemberOptions = {}): Promise<TestMember> {
      counter += 1;
      phoneCounter += 1;
      const base = options.name ?? `member_${counter}`;
      const fullName = base.startsWith(MARK) ? base : `${MARK}${base}`;
      const phone = `9${phoneSalt}${String(phoneCounter).padStart(4, "0")}`;
      const [row] = await db
        .insert(members)
        .values({
          fullName,
          phone,
          phoneDigits: phone,
          dateOfBirth: "1982-05-10",
          sex: "male",
          joinedOn: options.joinedOn ?? addDays(todayIn(timezone), -30),
          archivedAt: options.archived
            ? new Date(Date.now() - 3_600_000)
            : null,
        })
        .returning({ id: members.id });
      if (!row) throw new Error("makeMember: no row");
      trackedMembers.add(row.id);
      for (const period of options.periods ?? []) {
        await db.insert(membershipPeriods).values({
          memberId: row.id,
          plan: "annual",
          startOn: period.startOn,
          endOn: period.endOn,
        });
      }
      return { id: row.id, fullName };
    },

    /**
     * Saves one assessment of `typeId` dated `assessedOn` holding a value for each of `metricIds`
     * (what the assessments stream's save leaves behind: assessment row + measurement rows).
     * `updatedAt` is explicit when a case depends on it (C6); otherwise the database default.
     */
    async record(
      memberId: string,
      typeId: string,
      assessedOn: IsoDate,
      metricIds: string[],
      options: { updatedAt?: Date; value?: number } = {},
    ): Promise<string> {
      const [row] = await db
        .insert(assessments)
        .values({
          memberId,
          typeId,
          assessedOn,
          ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
        })
        .returning({ id: assessments.id });
      if (!row) throw new Error("record: no row");
      if (metricIds.length > 0) {
        await db.insert(measurements).values(
          metricIds.map((metricId) => ({
            assessmentId: row.id,
            metricId,
            memberId,
            measuredOn: assessedOn,
            value: options.value ?? 10,
          })),
        );
      }
      return row.id;
    },

    /**
     * Records the latest value of each measurement of a `makeWeeklyType` type so that it is due on
     * the given gym day (last value = due - weeks x 7 days). `null` = never recorded; a measurement
     * missing from `dues` gets a value recorded today (due `weeks` weeks later, long after).
     */
    async setDueDates(
      member: TestMember,
      type: TestType,
      dues: Record<string, IsoDate | null>,
    ): Promise<void> {
      const weeks = type.weeks;
      if (weeks === undefined)
        throw new Error("setDueDates needs a weekly type");
      const byDate = new Map<IsoDate, string[]>();
      for (const metric of type.metrics) {
        const due = metric.name in dues ? dues[metric.name] : undefined;
        if (due === null) continue; // never recorded
        const last =
          due === undefined ? suite.today() : addDays(due, -7 * weeks);
        byDate.set(last, [...(byDate.get(last) ?? []), metric.id]);
      }
      for (const [last, ids] of byDate) {
        await suite.record(member.id, type.id, last, ids);
      }
    },

    /** A `due_overrides` row inserted directly (the C6 cases need explicit timestamps). */
    async insertOverride(row: {
      memberId: string;
      typeId: string;
      kind: "flag" | "snooze";
      setOn: IsoDate;
      untilOn?: IsoDate | null;
      createdAt?: Date;
    }): Promise<void> {
      await db.insert(dueOverrides).values({
        memberId: row.memberId,
        typeId: row.typeId,
        kind: row.kind,
        setOn: row.setOn,
        untilOn: row.kind === "snooze" ? (row.untilOn ?? null) : null,
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      });
    },

    // ── database read-backs ──
    async overrideRows(memberId: string, typeId: string) {
      return db
        .select()
        .from(dueOverrides)
        .where(
          and(
            eq(dueOverrides.memberId, memberId),
            eq(dueOverrides.typeId, typeId),
          ),
        );
    },
    async setTypeActive(typeId: string, isActive: boolean): Promise<void> {
      await db
        .update(assessmentTypes)
        .set({ isActive })
        .where(eq(assessmentTypes.id, typeId));
    },
    async setTypeInterval(
      typeId: string,
      intervalCount: number,
      intervalUnit: "week" | "month",
    ): Promise<void> {
      await db
        .update(assessmentTypes)
        .set({ intervalCount, intervalUnit })
        .where(eq(assessmentTypes.id, typeId));
    },
    async setMetricActive(metricId: string, isActive: boolean): Promise<void> {
      await db
        .update(metrics)
        .set({ isActive })
        .where(eq(metrics.id, metricId));
    },
    async setMetricInterval(
      metricId: string,
      intervalCount: number | null,
      intervalUnit: "week" | "month" | null,
    ): Promise<void> {
      await db
        .update(metrics)
        .set({ intervalCount, intervalUnit })
        .where(eq(metrics.id, metricId));
    },
    /** Change-log rows written by one sign-in (default: this file's), optionally one action. */
    async audit(sessionId: string = defaultSid, action?: string) {
      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.sessionId, sessionId))
        .orderBy(auditLog.id);
      return action ? rows.filter((row) => row.action === action) : rows;
    },
  };

  beforeAll(async () => {
    // leftovers of an earlier crashed run would be active members too
    await removeMine();
    // A new assessment is due for EVERY active member (never recorded = due on the join date,
    // BR-REC-15), so rows of members these tests did not make would be in every list.
    const foreign = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(isNull(members.archivedAt), notLike(members.fullName, MARK_LIKE)),
      );
    if (foreign.length > 0) {
      throw new Error(
        `The test database holds ${foreign.length} active member(s) these tests did not create. Run \`bun run db:test:prepare\` and retry.`,
      );
    }
    defaultSid = crypto.randomUUID();
    sessionIds.add(defaultSid);
    defaultToken = await mintToken(defaultSid);
    settingsBefore = await db.select().from(gymSettings);
    await resetSettings();
  });

  afterEach(async () => {
    await resetSettings();
    // Members made by this test must not turn up as "never recorded" rows in the next test's
    // new assessment: archived members are left out of the lists (BR-REC-17).
    const mine = [...trackedMembers].filter((id) => !keptMembers.has(id));
    if (mine.length > 0) {
      await db
        .update(members)
        .set({ archivedAt: new Date() })
        .where(and(inArray(members.id, mine), isNull(members.archivedAt)));
    }
  });

  afterAll(async () => {
    await removeMine();
    await db.delete(gymSettings);
    if (settingsBefore.length > 0) {
      await db.insert(gymSettings).values(settingsBefore);
    }
  });

  return suite;
}
