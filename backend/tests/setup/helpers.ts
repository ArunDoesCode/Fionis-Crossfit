// Shared fixtures and HTTP helpers for the setup tests (member-records/setup, E07-E15).
// Everything talks to the app only through its public surface: HTTP routes via
// `createApp().request` and the Drizzle tables. The catalog is empty at the start of
// every test; tests create the rows they need (directly, or through the endpoint
// under test) and everything is removed again.
import { expect } from "bun:test";

import { and, asc, eq, sql } from "drizzle-orm";

import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  assessments,
  assessmentTypes,
  auditLog,
  gymSettings,
  loginAttempts,
  measurements,
  members,
  metrics,
} from "../../src/db/schemas";
import { type CallOptions, call, mintToken, type Reply } from "../helpers/http";

// ---------------------------------------------------------------------------
// App and sign-in

let appInstance: ReturnType<typeof createApp> | undefined;
const app = () => {
  appInstance ??= createApp();
  return appInstance;
};

export type Actor = { sid: string; token: string };

const sessionIds = new Set<string>();

/** A signed-in actor with its own session id (the change log records it). */
export async function newActor(): Promise<Actor> {
  const sid = crypto.randomUUID();
  sessionIds.add(sid);
  return { sid, token: await mintToken(sid) };
}

let sharedActor: Actor | undefined;
async function defaultActor(): Promise<Actor> {
  sharedActor ??= await newActor();
  return sharedActor;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function send(
  method: Method,
  path: string,
  options: CallOptions = {},
): Promise<Reply> {
  const token =
    options.token === undefined ? (await defaultActor()).token : options.token;
  return call(app(), method, path, { ...options, token });
}

/** Signed-in by default (one shared session); pass `token: null` for no sign-in. */
export const api = {
  get: (path: string, options?: CallOptions) => send("GET", path, options),
  post: (path: string, options?: CallOptions) => send("POST", path, options),
  put: (path: string, options?: CallOptions) => send("PUT", path, options),
  patch: (path: string, options?: CallOptions) => send("PATCH", path, options),
  delete: (path: string, options?: CallOptions) =>
    send("DELETE", path, options),
};

export const PATH = {
  settings: "/api/settings",
  types: "/api/assessment-types",
  typeOrder: "/api/assessment-types/order",
  type: (typeId: string) => `/api/assessment-types/${typeId}`,
  typeMetrics: (typeId: string) => `/api/assessment-types/${typeId}/metrics`,
  typeMetricOrder: (typeId: string) =>
    `/api/assessment-types/${typeId}/metric-order`,
  metric: (metricId: string) => `/api/metrics/${metricId}`,
};

// ---------------------------------------------------------------------------
// Response shapes (contract.md "Response shapes")

export type MetricOut = {
  id: string;
  name: string;
  unit: string;
  datatype: "number" | "duration";
  decimals: number;
  better: "higher" | "lower" | "none";
  plausibleMin: number | null;
  plausibleMax: number | null;
  intervalCount: number | null;
  intervalUnit: "week" | "month" | null;
  tableGroup: string | null;
  tablePart: "whole_body" | "arms" | "trunk" | "legs" | null;
  isActive: boolean;
  sortOrder: number;
  hasValues: boolean;
};

export type TypeOut = {
  id: string;
  name: string;
  intervalCount: number;
  intervalUnit: "week" | "month";
  isActive: boolean;
  sortOrder: number;
  hasValues: boolean;
  metrics: MetricOut[];
};

export type SettingsOut = {
  gymName: string;
  timezone: string;
  upcomingLeadDays: number;
  expiryLeadDays: number;
};

export const METRIC_KEYS = [
  "better",
  "datatype",
  "decimals",
  "hasValues",
  "id",
  "intervalCount",
  "intervalUnit",
  "isActive",
  "name",
  "plausibleMax",
  "plausibleMin",
  "sortOrder",
  "tableGroup",
  "tablePart",
  "unit",
];

export const TYPE_KEYS = [
  "hasValues",
  "id",
  "intervalCount",
  "intervalUnit",
  "isActive",
  "metrics",
  "name",
  "sortOrder",
];

export const SETTINGS_KEYS = [
  "expiryLeadDays",
  "gymName",
  "timezone",
  "upcomingLeadDays",
];

export const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `data` of a success answer; any other answer stops the test with what was received. */
export const dataOf = <T>(reply: Reply): T => {
  if (reply.body?.success !== true) {
    throw new Error(
      `expected a success answer, got ${reply.status} ${JSON.stringify(reply.body)}`,
    );
  }
  return reply.body.data as T;
};
export const typeOf = (reply: Reply) => dataOf<TypeOut>(reply);
export const typesOf = (reply: Reply) => dataOf<TypeOut[]>(reply);
export const metricOf = (reply: Reply) => dataOf<MetricOut>(reply);
export const settingsOf = (reply: Reply) => dataOf<SettingsOut>(reply);
export const metaOf = (reply: Reply) => {
  if (reply.body?.success !== true || !reply.body.meta) {
    throw new Error(
      `expected a list answer with meta, got ${reply.status} ${JSON.stringify(reply.body)}`,
    );
  }
  return reply.body.meta as {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

// ---------------------------------------------------------------------------
// Error assertions

export type Issue = { path: string; message: string };

/** `details.issues` of a 400, each `path` as a dotted string ("a" or ["a"] both work). */
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
 * 400 `VALIDATION_ERROR`. With `path`, an issue is reported on that field (or inside it, e.g.
 * "metricIds.2" for "metricIds"); with `message` as well, one of them says that text.
 */
export function expectInvalid(reply: Reply, path?: string, message?: string) {
  expect(reply.status, JSON.stringify(reply.body)).toBe(400);
  expect(reply.body?.success).toBe(false);
  expect(reply.body?.code).toBe("VALIDATION_ERROR");
  if (path !== undefined) {
    const onPath = issuesOf(reply).filter(
      (issue) => issue.path === path || issue.path.startsWith(`${path}.`),
    );
    expect(
      onPath.length,
      `no issue on "${path}" in ${JSON.stringify(reply.body?.details)}`,
    ).toBeGreaterThan(0);
    if (message !== undefined) {
      expect(onPath.map((issue) => issue.message)).toContain(message);
    }
  }
}

export function expectError(reply: Reply, status: number, code: string) {
  expect(reply.status, JSON.stringify(reply.body)).toBe(status);
  expect(reply.body?.success).toBe(false);
  expect(reply.body?.code).toBe(code);
}

export function expectOk(reply: Reply, status = 200) {
  expect(reply.status, JSON.stringify(reply.body)).toBe(status);
  expect(reply.body?.success).toBe(true);
}

// ---------------------------------------------------------------------------
// Catalog fixtures

const SEED_NAMES = ["Body composition", "Fitness test"];
const MEMBER_PREFIX = "TEST_setup_member_";

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what}: no row`);
  return value;
}

/**
 * Stops the test run with a clear message when the test database catalog holds
 * anything but the seeded assessments or `TEST_` rows (we delete those only).
 */
export async function assertCatalogOnlyOurs(): Promise<void> {
  const names = await db
    .select({ name: assessmentTypes.name })
    .from(assessmentTypes);
  const foreign = names
    .map((row) => row.name)
    .filter((name) => !SEED_NAMES.includes(name) && !/^TEST_/i.test(name));
  if (foreign.length > 0) {
    throw new Error(
      `The test database catalog holds assessment(s) these tests did not create (${foreign.join(", ")}). Run \`bun run db:test:prepare\` and retry.`,
    );
  }
}

/** Empties the catalog and everything that hangs on it (values, due overrides, TEST_setup_ members). */
export async function wipeCatalog(): Promise<void> {
  await db.execute(
    sql`delete from due_overrides where type_id in (select id from assessment_types)`,
  );
  await db.execute(
    sql`delete from assessments where type_id in (select id from assessment_types)`,
  );
  await db.execute(
    sql`delete from metrics where type_id in (select id from assessment_types)`,
  );
  await db.execute(sql`delete from assessment_types`);
  await db.execute(
    sql`delete from members where full_name like ${"TEST\\_setup\\_member\\_%"}`,
  );
}

type NewType = Partial<{
  name: string;
  intervalCount: number;
  intervalUnit: "week" | "month";
  isActive: boolean;
  sortOrder: number;
}>;

let sequence = 0;

async function nextOrder(
  table: "assessment_types" | "metrics",
  typeId?: string,
) {
  const rows = Array.from(
    await db.execute(
      table === "metrics"
        ? sql`select coalesce(max(sort_order), 0)::int as n from metrics where type_id = ${typeId as string}`
        : sql`select coalesce(max(sort_order), 0)::int as n from assessment_types`,
    ),
  ) as { n: number }[];
  return must(rows[0], "max sort order").n + 1;
}

/** Inserts an assessment directly (a fixture, not the endpoint under test). Names start with `TEST_setup_` unless given. */
export async function makeType(options: NewType = {}) {
  sequence += 1;
  const [row] = await db
    .insert(assessmentTypes)
    .values({
      name: options.name ?? `TEST_setup_type_${sequence}`,
      intervalCount: options.intervalCount ?? 1,
      intervalUnit: options.intervalUnit ?? "month",
      isActive: options.isActive ?? true,
      sortOrder: options.sortOrder ?? (await nextOrder("assessment_types")),
    })
    .returning();
  return must(row, "makeType");
}

type NewMetric = Partial<{
  name: string;
  unit: string;
  datatype: "number" | "duration";
  decimals: number;
  better: "higher" | "lower" | "none";
  plausibleMin: number | null;
  plausibleMax: number | null;
  intervalCount: number | null;
  intervalUnit: "week" | "month" | null;
  tableGroup: string | null;
  tablePart: "whole_body" | "arms" | "trunk" | "legs" | null;
  isActive: boolean;
  sortOrder: number;
}>;

/** Inserts a measurement directly under `typeId`. */
export async function makeMetric(typeId: string, options: NewMetric = {}) {
  sequence += 1;
  const [row] = await db
    .insert(metrics)
    .values({
      typeId,
      name: options.name ?? `Metric ${sequence}`,
      unit: options.unit ?? "kg",
      datatype: options.datatype ?? "number",
      decimals: options.decimals ?? 1,
      better: options.better ?? "higher",
      plausibleMin: options.plausibleMin ?? null,
      plausibleMax: options.plausibleMax ?? null,
      intervalCount: options.intervalCount ?? null,
      intervalUnit: options.intervalUnit ?? null,
      tableGroup: options.tableGroup ?? null,
      tablePart: options.tablePart ?? null,
      isActive: options.isActive ?? true,
      sortOrder: options.sortOrder ?? (await nextOrder("metrics", typeId)),
    })
    .returning();
  return must(row, "makeMetric");
}

/** Stores one value of `metricId` (member + assessment + measurement rows), so the metric has values (C6). */
export async function addValue(metricId: string, value = 10) {
  const [metric] = await db
    .select({ typeId: metrics.typeId })
    .from(metrics)
    .where(eq(metrics.id, metricId));
  const typeId = must(metric, "addValue metric").typeId;
  sequence += 1;
  const [member] = await db
    .insert(members)
    .values({
      fullName: `${MEMBER_PREFIX}${sequence}`,
      phone: "9845012345",
      phoneDigits: "9845012345",
      dateOfBirth: "1982-05-10",
      sex: "male",
      joinedOn: "2025-06-01",
    })
    .returning({ id: members.id });
  const memberId = must(member, "addValue member").id;
  const [assessment] = await db
    .insert(assessments)
    .values({ memberId, typeId, assessedOn: "2026-01-15" })
    .returning({ id: assessments.id });
  await db.insert(measurements).values({
    assessmentId: must(assessment, "addValue assessment").id,
    metricId,
    memberId,
    measuredOn: "2026-01-15",
    value,
  });
}

// ---------------------------------------------------------------------------
// Reading the database

export const dbType = async (typeId: string) =>
  must(
    (
      await db
        .select()
        .from(assessmentTypes)
        .where(eq(assessmentTypes.id, typeId))
    )[0],
    `type ${typeId}`,
  );

export const dbMetric = async (metricId: string) =>
  must(
    (await db.select().from(metrics).where(eq(metrics.id, metricId)))[0],
    `metric ${metricId}`,
  );

export const dbTypesInOrder = () =>
  db.select().from(assessmentTypes).orderBy(asc(assessmentTypes.sortOrder));

export const dbMetricsInOrder = (typeId: string) =>
  db
    .select()
    .from(metrics)
    .where(eq(metrics.typeId, typeId))
    .orderBy(asc(metrics.sortOrder));

export const dbTypeCount = async () =>
  (await db.select().from(assessmentTypes)).length;

export const dbMetricCount = async (typeId: string) =>
  (await db.select().from(metrics).where(eq(metrics.typeId, typeId))).length;

export const dbStoredValues = (metricId: string) =>
  db
    .select({ value: measurements.value })
    .from(measurements)
    .where(eq(measurements.metricId, metricId));

export const dbSettings = () => db.select().from(gymSettings);

/** Everything the setup endpoints can change, as one comparable value. */
export async function catalogSnapshot(): Promise<string> {
  const [types, allMetrics, settings] = await Promise.all([
    db.select().from(assessmentTypes).orderBy(asc(assessmentTypes.id)),
    db.select().from(metrics).orderBy(asc(metrics.id)),
    db.select().from(gymSettings),
  ]);
  return JSON.stringify({ types, allMetrics, settings });
}

// ---------------------------------------------------------------------------
// Settings and the other singleton rows

/** Saves the settings and login-lock rows; the returned function puts them back exactly. */
export async function snapshotSingletons(): Promise<() => Promise<void>> {
  const savedSettings = await db.select().from(gymSettings);
  const savedLock = await db.select().from(loginAttempts);
  return async () => {
    await db.delete(gymSettings);
    await db.delete(loginAttempts);
    if (savedSettings.length > 0) {
      await db.insert(gymSettings).values(savedSettings);
    }
    if (savedLock.length > 0) {
      await db.insert(loginAttempts).values(savedLock);
    }
  };
}

export const DEFAULT_SETTINGS: SettingsOut = {
  gymName: "Fionis CrossFit",
  timezone: "Asia/Kolkata",
  upcomingLeadDays: 7,
  expiryLeadDays: 14,
};

/** One settings row with the gym's defaults (BR-REC-60). */
export async function resetSettings(): Promise<void> {
  await db.delete(gymSettings);
  await db.insert(gymSettings).values({ id: 1, ...DEFAULT_SETTINGS });
}

// ---------------------------------------------------------------------------
// Change log

export const auditRows = (sessionId: string) =>
  db
    .select()
    .from(auditLog)
    .where(eq(auditLog.sessionId, sessionId))
    .orderBy(asc(auditLog.id));

export const auditRowsFor = (sessionId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.sessionId, sessionId), eq(auditLog.action, action)));

/** Removes the change-log rows written by the sessions these tests signed in with. */
export async function cleanupAudit(): Promise<void> {
  for (const sid of sessionIds) {
    await db.delete(auditLog).where(eq(auditLog.sessionId, sid));
  }
}

/** Removes everything the setup tests may leave behind (catalog, members, change log). */
export async function cleanupAll(): Promise<void> {
  await wipeCatalog();
  await cleanupAudit();
}
