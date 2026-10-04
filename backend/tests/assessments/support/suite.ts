import { afterAll, beforeAll, expect } from "bun:test";

import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";

import { createApp } from "../../../src/app";
import { db } from "../../../src/db/client";
import {
  assessments,
  assessmentTypes,
  auditLog,
  gymSettings,
  measurements,
  members,
  membershipPeriods,
  metrics,
} from "../../../src/db/schemas";
import { call, type Reply } from "../../helpers/http";
import { createSignedInSession } from "../../helpers/session";

// Shared plumbing for the member-records/assessments tests (E25-E30).
// Everything talks to the app through its public surface (HTTP routes via
// `createApp().request`) and to the database through the Drizzle tables.
// Fixtures: every member made here carries MARK in its name and every
// assessment type starts with MARK (the setup tests accept `TEST_` catalog
// rows only), so the cleanup in afterAll touches only rows this suite made.
// Dates are fixed in the past or relative to the gym's today (the API reads
// the real clock).

export const MARK = "TEST_assess";
const MARK_LIKE = "%TEST\\_assess%";

export type IsoDate = string;

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

// ─── response shapes (the contract's E25-E30 `data`) ────────────────────────

export type FormMetric = {
  id: string;
  name: string;
  unit: string;
  datatype: "number" | "duration";
  decimals: number;
  better: "higher" | "lower" | "none";
  plausibleMin: number | null;
  plausibleMax: number | null;
  previous: { value: number; on: IsoDate; isEstimated: boolean } | null;
};
export type EntryForm = {
  member: { id: string; fullName: string; joinedOn: IsoDate };
  type: { id: string; name: string };
  existing: {
    assessmentId: string;
    isEstimated: boolean;
    values: Record<string, number>;
  } | null;
  metrics: FormMetric[];
};
export type SaveResult = {
  assessmentId: string;
  created: boolean;
  saved: number;
  removed: number;
};
export type ListItem = {
  id: string;
  typeId: string;
  typeName: string;
  date: IsoDate;
  isEstimated: boolean;
  valueCount: number;
};
export type Detail = {
  id: string;
  memberId: string;
  typeId: string;
  typeName: string;
  date: IsoDate;
  isEstimated: boolean;
  values: {
    metricId: string;
    name: string;
    unit: string;
    datatype: "number" | "duration";
    value: number;
  }[];
};
export type ListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ─── tiny assertions ────────────────────────────────────────────────────────

/** `data` of a reply, after checking the status. */
export function dataOf<T>(reply: Reply, status = 200): T {
  expect(reply.status, JSON.stringify(reply.body)).toBe(status);
  expect(reply.body?.success).toBe(true);
  return reply.body?.data as T;
}

/** `meta` of a list reply. */
export function metaOf(reply: Reply): ListMeta {
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  expect(reply.body?.success).toBe(true);
  return reply.body?.meta as unknown as ListMeta;
}

/** The error envelope of BR-REC-154: `{ success: false, message, code }`. */
export function expectError(reply: Reply, status: number, code: string): void {
  expect(reply.status, JSON.stringify(reply.body)).toBe(status);
  expect(reply.body).toMatchObject({ success: false, code });
  expect(typeof reply.body?.message).toBe("string");
}

export type Issue = { path: string; message: string };

/** `details.issues` of a 400, each `path` as a dotted string. */
export function issuesOf(reply: Reply): Issue[] {
  const raw = (reply.body?.details as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const issue = item as { path?: unknown; message?: unknown };
    const path = Array.isArray(issue.path)
      ? issue.path.join(".")
      : String(issue.path ?? "");
    return { path, message: String(issue.message ?? "") };
  });
}

/**
 * 400 `VALIDATION_ERROR`. With `path`, an issue is reported on that field (or
 * inside it, e.g. "values.1.value" for "values").
 */
export function expectInvalid(reply: Reply, path?: string): void {
  expectError(reply, 400, "VALIDATION_ERROR");
  if (path !== undefined) {
    const onPath = issuesOf(reply).filter(
      (issue) => issue.path === path || issue.path.startsWith(`${path}.`),
    );
    expect(
      onPath.length,
      `no issue on "${path}" in ${JSON.stringify(reply.body?.details)}`,
    ).toBeGreaterThan(0);
  }
}

// ─── catalog fixtures ───────────────────────────────────────────────────────

export type MetricSeed = {
  name: string;
  unit?: string;
  datatype?: "number" | "duration";
  decimals?: 0 | 1 | 2;
  better?: "higher" | "lower" | "none";
  plausibleMin?: number | null;
  plausibleMax?: number | null;
  isActive?: boolean;
  sortOrder?: number;
};
export type SeededMetric = {
  id: string;
  name: string;
  datatype: "number" | "duration";
  decimals: number;
  isActive: boolean;
  sortOrder: number;
};
export type SeededType = {
  id: string;
  name: string;
  metrics: SeededMetric[];
  /** the seeded measurement called `name` (throws when there is none) */
  metric(name: string): SeededMetric;
};
export type SeededMember = { id: string; fullName: string; joinedOn: IsoDate };

/** A body-composition-like set: weight, visceral fat, plank (min:sec), waist. */
export const BODY_METRICS: MetricSeed[] = [
  { name: "Weight", unit: "kg", decimals: 1, better: "lower" },
  { name: "Visceral fat", unit: "level", decimals: 0, better: "lower" },
  {
    name: "Plank",
    unit: "min:sec",
    datatype: "duration",
    decimals: 0,
    better: "higher",
  },
  { name: "Waist", unit: "cm", decimals: 1, better: "lower" },
];

let counter = 0;
const RUN_SALT = crypto.randomUUID().slice(0, 6);

export type Suite = ReturnType<typeof useAssessmentsSuite>;

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

type SettingsRow = typeof gymSettings.$inferSelect;

/**
 * Call at the top level of a test file. Signs in with a real session, makes
 * sure the gym settings row exists (Asia/Kolkata), and removes everything this
 * file created afterwards.
 */
export function useAssessmentsSuite() {
  const app = createApp();
  const trackedMembers = new Set<string>();
  const trackedTypes = new Set<string>();
  let session: Awaited<ReturnType<typeof createSignedInSession>> | null = null;
  let settingsBefore: SettingsRow | null = null;
  let timezone = "Asia/Kolkata";

  const suite = {
    app,
    /** the access token of this file's signed-in session */
    get token(): string {
      return session?.token ?? "";
    },
    /** the sign-in id: every change-log row of this file carries it */
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
    /** Changes the gym's time zone setting (put back in afterAll). */
    async setTimezone(tz: string): Promise<void> {
      await db.insert(gymSettings).values({}).onConflictDoNothing();
      await db
        .update(gymSettings)
        .set({ timezone: tz })
        .where(eq(gymSettings.id, 1));
      timezone = tz;
    },

    // ── HTTP ──
    get(path: string, query?: Query, token?: string | null): Promise<Reply> {
      return call(app, "GET", `${path}${queryString(query)}`, {
        token: token === undefined ? suite.token : token,
      });
    },
    send(
      method: "POST" | "PATCH" | "DELETE",
      path: string,
      options: {
        body?: unknown;
        rawBody?: string;
        origin?: string | null;
        token?: string | null;
      } = {},
    ): Promise<Reply> {
      return call(app, method, path, {
        token: options.token === undefined ? suite.token : options.token,
        ...(options.origin !== undefined ? { origin: options.origin } : {}),
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(options.rawBody !== undefined ? { rawBody: options.rawBody } : {}),
      });
    },
    /** E25 */
    entryForm(
      memberId: string,
      query: { typeId?: string; date?: string },
    ): Promise<Reply> {
      return suite.get(`/api/members/${memberId}/entry-form`, query);
    },
    /** E25 `data` (checks the status) */
    async formOf(
      memberId: string,
      typeId: string,
      date: IsoDate,
    ): Promise<EntryForm> {
      return dataOf<EntryForm>(
        await suite.entryForm(memberId, { typeId, date }),
      );
    },
    /** E26 with the body as given */
    save(body: unknown): Promise<Reply> {
      return suite.send("POST", "/api/assessments", { body });
    },
    /**
     * E26 for `member` + `type` on `date` with `values` as [measurement, value]
     * pairs (value null removes). `isEstimated` defaults to false.
     */
    saveValues(
      member: { id: string },
      type: { id: string },
      date: IsoDate,
      values: [metric: { id: string }, value: number | null][],
      isEstimated = false,
    ): Promise<Reply> {
      return suite.save({
        memberId: member.id,
        typeId: type.id,
        date,
        isEstimated,
        values: values.map(([metric, value]) => ({
          metricId: metric.id,
          value,
        })),
      });
    },
    /** E26 `data` (checks the status) */
    async savedOf(reply: Reply): Promise<SaveResult> {
      return dataOf<SaveResult>(reply);
    },
    /** E27 */
    list(query?: Query): Promise<Reply> {
      return suite.get("/api/assessments", query);
    },
    /** E27 across every page (pageSize 100) of one member */
    async listAll(memberId: string, extra: Query = {}): Promise<ListItem[]> {
      const items: ListItem[] = [];
      for (let page = 1; ; page++) {
        const reply = await suite.list({
          memberId,
          ...extra,
          page,
          pageSize: 100,
        });
        items.push(...dataOf<ListItem[]>(reply));
        if (page >= metaOf(reply).totalPages) return items;
      }
    },
    /** E28 */
    detail(id: string): Promise<Reply> {
      return suite.get(`/api/assessments/${id}`);
    },
    /** E29 */
    patch(id: string, body: unknown): Promise<Reply> {
      return suite.send("PATCH", `/api/assessments/${id}`, { body });
    },
    /** E30 */
    remove(id: string): Promise<Reply> {
      return suite.send("DELETE", `/api/assessments/${id}`);
    },
    /** E16 narrowed to one member by its unique name token */
    async memberListItem(
      member: SeededMember,
    ): Promise<{ id: string; lastAssessedOn: IsoDate | null } | undefined> {
      const token = member.fullName.split(" ")[0] as string;
      const reply = await suite.get("/api/members", {
        q: token,
        pageSize: 100,
      });
      const items =
        dataOf<{ id: string; lastAssessedOn: IsoDate | null }[]>(reply);
      return items.find((item) => item.id === member.id);
    },

    // ── database fixtures (so a test of one endpoint does not depend on another) ──
    /** A member (one annual period); the first word of the name is unique to it. */
    async seedMember(
      options: { joinedOn?: IsoDate; archived?: boolean; label?: string } = {},
    ): Promise<SeededMember> {
      counter += 1;
      const label = `${options.label ?? "Zq"}${RUN_SALT}x${counter}`;
      const fullName = `${label} ${MARK}`;
      const joinedOn = options.joinedOn ?? "2025-06-01";
      const phone = `9${RUN_SALT.replace(/\D/g, "0").padEnd(6, "0").slice(0, 6)}${String(counter).padStart(3, "0")}`;
      const [row] = await db
        .insert(members)
        .values({
          fullName,
          phone,
          phoneDigits: phone,
          dateOfBirth: "1982-05-10",
          sex: "male",
          joinedOn,
          archivedAt: options.archived
            ? new Date(Date.now() - 3_600_000)
            : null,
        })
        .returning({ id: members.id });
      const id = (row as { id: string }).id;
      trackedMembers.add(id);
      await db.insert(membershipPeriods).values({
        memberId: id,
        plan: "annual",
        startOn: joinedOn,
        endOn: addDays(joinedOn, 364),
      });
      return { id, fullName, joinedOn };
    },

    /** An assessment type with its measurements, inserted directly. Default: BODY_METRICS. */
    async seedType(
      options: {
        isActive?: boolean;
        metrics?: MetricSeed[];
        name?: string;
      } = {},
    ): Promise<SeededType> {
      counter += 1;
      const name = options.name ?? `${MARK}_type_${RUN_SALT}_${counter}`;
      const [typeRow] = await db
        .insert(assessmentTypes)
        .values({
          name,
          intervalCount: 1,
          intervalUnit: "month",
          isActive: options.isActive ?? true,
          sortOrder: 9000 + counter,
        })
        .returning({ id: assessmentTypes.id });
      const typeId = (typeRow as { id: string }).id;
      trackedTypes.add(typeId);

      const seeded: SeededMetric[] = [];
      let order = 0;
      for (const seed of options.metrics ?? BODY_METRICS) {
        order += 1;
        const datatype = seed.datatype ?? "number";
        const [row] = await db
          .insert(metrics)
          .values({
            typeId,
            name: seed.name,
            unit: seed.unit ?? "",
            datatype,
            decimals: datatype === "duration" ? 0 : (seed.decimals ?? 1),
            better: seed.better ?? "higher",
            plausibleMin: seed.plausibleMin ?? null,
            plausibleMax: seed.plausibleMax ?? null,
            isActive: seed.isActive ?? true,
            sortOrder: seed.sortOrder ?? order,
          })
          .returning({
            id: metrics.id,
            decimals: metrics.decimals,
            sortOrder: metrics.sortOrder,
            isActive: metrics.isActive,
          });
        const r = row as {
          id: string;
          decimals: number;
          sortOrder: number;
          isActive: boolean;
        };
        seeded.push({
          id: r.id,
          name: seed.name,
          datatype,
          decimals: r.decimals,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
        });
      }
      return {
        id: typeId,
        name,
        metrics: seeded,
        metric(metricName: string): SeededMetric {
          const found = seeded.find((m) => m.name === metricName);
          if (!found) throw new Error(`no seeded measurement ${metricName}`);
          return found;
        },
      };
    },

    /** Turns an assessment or a measurement on or off directly in the database. */
    async setTypeActive(typeId: string, isActive: boolean): Promise<void> {
      await db
        .update(assessmentTypes)
        .set({ isActive })
        .where(eq(assessmentTypes.id, typeId));
    },
    async setMetricActive(metricId: string, isActive: boolean): Promise<void> {
      await db
        .update(metrics)
        .set({ isActive })
        .where(eq(metrics.id, metricId));
    },

    /** An assessment with values, inserted directly (copies member and date onto each value). */
    async seedAssessment(input: {
      member: { id: string };
      type: { id: string };
      date: IsoDate;
      isEstimated?: boolean;
      values: [metric: { id: string }, value: number][];
    }): Promise<{ id: string }> {
      const [row] = await db
        .insert(assessments)
        .values({
          memberId: input.member.id,
          typeId: input.type.id,
          assessedOn: input.date,
          isEstimated: input.isEstimated ?? false,
        })
        .returning({ id: assessments.id });
      const id = (row as { id: string }).id;
      if (input.values.length > 0) {
        await db.insert(measurements).values(
          input.values.map(([metric, value]) => ({
            assessmentId: id,
            metricId: metric.id,
            memberId: input.member.id,
            measuredOn: input.date,
            value,
          })),
        );
      }
      return { id };
    },

    /** Removes an assessment and its values directly in the database (a fixture, not E30). */
    async dbDeleteAssessment(id: string): Promise<void> {
      await db.delete(measurements).where(eq(measurements.assessmentId, id));
      await db.delete(assessments).where(eq(assessments.id, id));
    },

    // ── reading the database ──
    /** Every assessment row of a member (optionally one type), oldest date first. */
    assessmentRows(memberId: string, typeId?: string) {
      return db
        .select()
        .from(assessments)
        .where(
          typeId
            ? and(
                eq(assessments.memberId, memberId),
                eq(assessments.typeId, typeId),
              )
            : eq(assessments.memberId, memberId),
        )
        .orderBy(asc(assessments.assessedOn), asc(assessments.id));
    },
    /** One assessment row by id, or undefined. */
    async assessmentRow(id: string) {
      const [row] = await db
        .select()
        .from(assessments)
        .where(eq(assessments.id, id));
      return row;
    },
    /** Every measurement row of an assessment. */
    measurementRows(assessmentId: string) {
      return db
        .select()
        .from(measurements)
        .where(eq(measurements.assessmentId, assessmentId))
        .orderBy(asc(measurements.metricId));
    },
    /** Stored values of an assessment as { metricId: value }. */
    async storedValues(assessmentId: string): Promise<Record<string, number>> {
      const rows = await suite.measurementRows(assessmentId);
      return Object.fromEntries(rows.map((r) => [r.metricId, r.value]));
    },
    /** Every measurement row of a member (all assessments). */
    memberMeasurementRows(memberId: string) {
      return db
        .select()
        .from(measurements)
        .where(eq(measurements.memberId, memberId));
    },
    /** Change-log rows written by this file's sign-in, optionally narrowed, oldest first. */
    async audit(filter: { action?: string; entityId?: string } = {}) {
      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.sessionId, suite.sessionId))
        .orderBy(asc(auditLog.id));
      return rows.filter(
        (r) =>
          (!filter.action || r.action === filter.action) &&
          (!filter.entityId || r.entityId === filter.entityId),
      );
    },
  };

  beforeAll(async () => {
    session = await createSignedInSession();
    const [existing] = await db.select().from(gymSettings).limit(1);
    settingsBefore = existing ?? null;
    await db.insert(gymSettings).values({}).onConflictDoNothing();
    await db
      .update(gymSettings)
      .set({ timezone: "Asia/Kolkata" })
      .where(eq(gymSettings.id, 1));
    timezone = "Asia/Kolkata";
  });

  afterAll(async () => {
    const sweep = await db
      .select({ id: members.id })
      .from(members)
      .where(like(members.fullName, MARK_LIKE));
    for (const row of sweep) trackedMembers.add(row.id);
    const typeSweep = await db
      .select({ id: assessmentTypes.id })
      .from(assessmentTypes)
      .where(like(assessmentTypes.name, MARK_LIKE));
    for (const row of typeSweep) trackedTypes.add(row.id);
    const memberIds = [...trackedMembers];
    const typeIds = [...trackedTypes];

    if (session) {
      await db
        .delete(auditLog)
        .where(eq(auditLog.sessionId, session.sessionId));
    }
    if (memberIds.length > 0 || typeIds.length > 0) {
      const ownedAssessments = await db
        .select({ id: assessments.id })
        .from(assessments)
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
      const ids = ownedAssessments.map((a) => a.id);
      if (ids.length > 0) {
        await db
          .delete(measurements)
          .where(inArray(measurements.assessmentId, ids));
        await db.delete(assessments).where(inArray(assessments.id, ids));
      }
    }
    if (memberIds.length > 0) {
      await db
        .delete(membershipPeriods)
        .where(inArray(membershipPeriods.memberId, memberIds));
      await db.delete(members).where(inArray(members.id, memberIds));
    }
    if (typeIds.length > 0) {
      await db.delete(metrics).where(inArray(metrics.typeId, typeIds));
      await db
        .delete(assessmentTypes)
        .where(inArray(assessmentTypes.id, typeIds));
    }

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
