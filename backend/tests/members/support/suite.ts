import { afterAll, beforeAll, expect } from "bun:test";

import { eq, inArray, like, or, sql } from "drizzle-orm";

import { createApp } from "../../../src/app";
import { db } from "../../../src/db/client";
import {
  assessments,
  assessmentTypes,
  auditLog,
  gymSettings,
  idempotencyKeys,
  members,
  membershipPeriods,
} from "../../../src/db/schemas";
import { call, type Json, type Reply } from "../../helpers/http";
import { createSignedInSession } from "../../helpers/session";

// Shared plumbing for the member-records/members tests (E16-E24).
// Fixtures: every member made here carries MARK in its name, so the cleanup in
// afterAll (and `q=MARK` in a list query) touches only rows this suite made.
// Dates are relative to the gym's today: the API reads the real clock.

export const MARK = "TEST_members";
const MARK_LIKE = "%TEST\\_members%";

export type IsoDate = string;
export type PlanName = "monthly" | "quarterly" | "half_annual" | "annual";

// ─── dates (independent of the code under test) ─────────────────────────────

export function addDays(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = (iso: IsoDate) => {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
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

/**
 * BR-REC-51: the day before the same date N months later; when that date does
 * not exist in that month, the last day of that month. Used only to build
 * fixtures relative to today; the spec table cases are hard-coded in the tests.
 */
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

/**
 * A start day whose `plan` period ends exactly on `endOn` (the latest such start),
 * for fixtures like "a membership that ends in 7 days".
 */
export function startFor(plan: PlanName, endOn: IsoDate): IsoDate {
  const months = PLAN_MONTHS[plan];
  for (let back = months * 28 - 2; back <= months * 31 + 2; back++) {
    const start = addDays(endOn, -back);
    if (endOf(plan, start) === endOn) return start;
  }
  throw new Error(`no ${plan} start ends on ${endOn}`);
}

/**
 * A date of birth that is `years` before `today`, moved by `shiftDays`:
 * (30, 0) is a 30th birthday today, (30, 1) is a 30th birthday tomorrow.
 */
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
  const d = m === 2 && rawDay === 29 ? 28 : rawDay; // no 29 Feb in the birth year
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

/**
 * BR-REC-52 for the latest period: Ended if its end is before today; a period
 * that has not started yet is Active; otherwise Ends soon when it ends within
 * the lead days (ending today counts, 14 days left with lead 14 counts).
 */
export function statusOracle(
  period: { startOn: IsoDate; endOn: IsoDate },
  today: IsoDate,
  leadDays: number,
): { status: "active" | "expiring" | "expired"; daysLeft: number } {
  const daysLeft = daysBetween(today, period.endOn);
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (period.startOn > today) return { status: "active", daysLeft };
  return { status: daysLeft <= leadDays ? "expiring" : "active", daysLeft };
}

// ─── response shapes (the contract's E16-E24 `data`) ────────────────────────

export type PeriodView = {
  id: string;
  plan: PlanName;
  startOn: IsoDate;
  endOn: IsoDate;
};
export type MembershipView = {
  status: "active" | "expiring" | "expired";
  plan: PlanName;
  startOn: IsoDate;
  endOn: IsoDate;
  daysLeft: number;
};
export type MemberView = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  dateOfBirth: IsoDate;
  age: number;
  sex: "male" | "female";
  joinedOn: IsoDate;
  objective: string | null;
  notes: string | null;
  archivedAt: string | null;
  membership: MembershipView;
  periods: PeriodView[];
};
export type ListItem = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  lastAssessedOn: IsoDate | null;
  archivedAt: string | null;
  membership: Omit<MembershipView, "startOn">;
};
export type EndingItem = {
  memberId: string;
  fullName: string;
  phone: string;
  plan: PlanName;
  endOn: IsoDate;
  daysLeft: number;
};
export type PeriodResult = PeriodView & { memberRestored: boolean };

// ─── tiny assertions ────────────────────────────────────────────────────────

/** `data` of a reply, after checking the status. */
export function dataOf<T>(reply: Reply, status = 200): T {
  expect(reply.status).toBe(status);
  expect(reply.body?.success).toBe(true);
  return reply.body?.data as T;
}

/** The member as E18 shows it: exactly these fields (the answer of E17, E18, E19, E20 and E21). */
export const MEMBER_KEYS = [
  "age",
  "archivedAt",
  "dateOfBirth",
  "email",
  "fullName",
  "id",
  "joinedOn",
  "membership",
  "notes",
  "objective",
  "periods",
  "phone",
  "sex",
] as const;

export function expectMemberShape(member: unknown): void {
  expect(Object.keys(member as object).sort()).toEqual([...MEMBER_KEYS]);
  const m = member as MemberView;
  expect(Object.keys(m.membership).sort()).toEqual([
    "daysLeft",
    "endOn",
    "plan",
    "startOn",
    "status",
  ]);
  expect(typeof m.age).toBe("number");
  expect(Array.isArray(m.periods)).toBe(true);
}

/** The error envelope of BR-REC-154: `{ success: false, message, code }`. */
export function expectError(reply: Reply, status: number, code: string): void {
  expect(reply.status).toBe(status);
  expect(reply.body).toMatchObject({ success: false, code });
  expect(typeof reply.body?.message).toBe("string");
}

/** The members of `items` this suite made (their name ends with MARK). */
export function mine<T extends { fullName: string }>(items: T[]): T[] {
  return items.filter((item) => item.fullName.includes(MARK));
}

/** `fullName` without the MARK suffix: "Surya K TEST_members" -> "Surya K". */
export function bare(fullName: string): string {
  return fullName.replace(` ${MARK}`, "");
}

let phoneCounter = 0;
const PHONE_SALT = String(Math.floor(10_000 + Math.random() * 89_999));
/** A 10-digit phone nobody else uses: "9" + run salt + counter. */
export function nextPhone(): string {
  phoneCounter += 1;
  return `9${PHONE_SALT}${String(phoneCounter).padStart(4, "0")}`;
}

// ─── the suite ──────────────────────────────────────────────────────────────

export type SeedPeriod = { plan?: PlanName; startOn: IsoDate; endOn?: IsoDate };
export type SeedMember = {
  /** shown name without the MARK suffix, e.g. "Surya K" */
  name: string;
  phone?: string;
  email?: string | null;
  dateOfBirth?: IsoDate;
  sex?: "male" | "female";
  joinedOn?: IsoDate;
  objective?: string | null;
  notes?: string | null;
  archived?: boolean | Date;
  /** default: one annual period that started 100 days ago */
  periods?: SeedPeriod[];
  /** assessment days (any type) */
  assessedOn?: IsoDate[];
};
export type Seeded = { id: string; fullName: string; periodIds: string[] };

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

export type Suite = ReturnType<typeof useMembersSuite>;

/**
 * Call at the top level of a test file. Signs in with a real session, makes
 * sure the gym settings row exists (Asia/Kolkata, 14 lead days), and removes
 * everything this file created afterwards.
 */
export function useMembersSuite() {
  const app = createApp();
  const trackedMembers = new Set<string>();
  let session: Awaited<ReturnType<typeof createSignedInSession>> | null = null;
  let settingsBefore: SettingsRow | null = null;
  let typeId: string | null = null;
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

    /** Changes the one gym settings row (time zone and/or the expiry lead days). */
    async setSettings(patch: {
      timezone?: string;
      expiryLeadDays?: number;
    }): Promise<void> {
      await db.insert(gymSettings).values({}).onConflictDoNothing();
      await db.update(gymSettings).set(patch).where(eq(gymSettings.id, 1));
      if (patch.timezone) timezone = patch.timezone;
    },

    // ── HTTP ──
    get(path: string, query?: Query): Promise<Reply> {
      return call(app, "GET", `${path}${queryString(query)}`, {
        token: suite.token,
      });
    },
    send(
      method: "POST" | "PATCH" | "DELETE",
      path: string,
      options: { body?: unknown; key?: string | null; rawBody?: string } = {},
    ): Promise<Reply> {
      const headers: Record<string, string> = {};
      if (options.key !== null && options.key !== undefined) {
        headers["Idempotency-Key"] = options.key;
      }
      return call(app, method, path, {
        token: suite.token,
        headers,
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(options.rawBody !== undefined ? { rawBody: options.rawBody } : {}),
      });
    },
    /** E16 */
    list(query?: Query): Promise<Reply> {
      return suite.get("/api/members", query);
    },
    /** E16 across every page (pageSize 100), for lists that cannot be narrowed with `q`. */
    async listAll(query: Query = {}): Promise<ListItem[]> {
      const items: ListItem[] = [];
      for (let page = 1; ; page++) {
        const reply = await suite.list({ ...query, page, pageSize: 100 });
        expect(reply.status).toBe(200);
        const body = reply.body as unknown as {
          data: ListItem[];
          meta: { totalPages: number };
        };
        items.push(...body.data);
        if (page >= body.meta.totalPages) return items;
      }
    },
    /** E24 across every page (pageSize 100). */
    async endingAll(status: "expiring" | "expired"): Promise<EndingItem[]> {
      const items: EndingItem[] = [];
      for (let page = 1; ; page++) {
        const reply = await suite.ending({ status, page, pageSize: 100 });
        expect(reply.status).toBe(200);
        const body = reply.body as unknown as {
          data: EndingItem[];
          meta: { totalPages: number };
        };
        items.push(...body.data);
        if (page >= body.meta.totalPages) return items;
      }
    },
    /** E17: a valid body with `overrides` merged in; a fresh Idempotency-Key unless `key` is given. */
    async createMember(
      overrides: Json = {},
      key: string | null = crypto.randomUUID(),
    ): Promise<Reply> {
      const reply = await suite.send("POST", "/api/members", {
        body: suite.memberBody(overrides),
        key,
      });
      const id = (reply.body?.data as { id?: string } | undefined)?.id;
      if (reply.status === 201 && id) trackedMembers.add(id);
      return reply;
    },
    /** A valid E17 body (a joined-1-Jun-2025 annual member). Name carries MARK. */
    memberBody(overrides: Json = {}): Json {
      return {
        fullName: `Surya Pratap ${MARK}`,
        phone: nextPhone(),
        dateOfBirth: "1982-05-10",
        sex: "male",
        joinedOn: "2025-06-01",
        firstPeriod: { plan: "annual", startOn: "2025-06-01" },
        ...overrides,
      };
    },
    /** E18 */
    getMember(id: string): Promise<Reply> {
      return suite.get(`/api/members/${id}`);
    },
    /** E19 */
    patchMember(id: string, body: unknown): Promise<Reply> {
      return suite.send("PATCH", `/api/members/${id}`, { body });
    },
    /** E20 */
    archive(id: string): Promise<Reply> {
      return suite.send("POST", `/api/members/${id}/archive`);
    },
    /** E21 */
    restore(id: string): Promise<Reply> {
      return suite.send("POST", `/api/members/${id}/restore`);
    },
    /** E22 */
    addPeriod(
      memberId: string,
      body: unknown,
      key: string | null = crypto.randomUUID(),
    ): Promise<Reply> {
      return suite.send("POST", `/api/members/${memberId}/periods`, {
        body,
        key,
      });
    },
    /** E23 */
    editPeriod(
      memberId: string,
      periodId: string,
      body: unknown,
    ): Promise<Reply> {
      return suite.send(
        "PATCH",
        `/api/members/${memberId}/periods/${periodId}`,
        { body },
      );
    },
    /** E24 */
    ending(query: Query): Promise<Reply> {
      return suite.get("/api/memberships/ending", query);
    },

    // ── database fixtures (so a test of one endpoint does not depend on another) ──
    async seedMember(seed: SeedMember): Promise<Seeded> {
      const periods: SeedPeriod[] = seed.periods ?? [
        { plan: "annual", startOn: suite.day(-100) },
      ];
      const earliest = periods
        .map((p) => p.startOn)
        .sort()
        .at(0) as IsoDate;
      const phone = seed.phone ?? nextPhone();
      const fullName = `${seed.name} ${MARK}`;
      const archivedAt =
        seed.archived === true
          ? new Date(Date.now() - 3_600_000)
          : seed.archived instanceof Date
            ? seed.archived
            : null;
      const [row] = await db
        .insert(members)
        .values({
          fullName,
          phone,
          phoneDigits: phone.replace(/\D/g, ""),
          email: seed.email ?? null,
          dateOfBirth: seed.dateOfBirth ?? "1982-05-10",
          sex: seed.sex ?? "male",
          joinedOn: seed.joinedOn ?? earliest,
          objective: seed.objective ?? null,
          notes: seed.notes ?? null,
          archivedAt,
        })
        .returning({ id: members.id });
      const id = (row as { id: string }).id;
      trackedMembers.add(id);

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

      for (const day of seed.assessedOn ?? []) {
        await db.insert(assessments).values({
          memberId: id,
          typeId: await suite.assessmentType(),
          assessedOn: day,
        });
      }
      return { id, fullName, periodIds };
    },

    /** The one assessment type of this file (assessments need a type). */
    async assessmentType(): Promise<string> {
      if (typeId) return typeId;
      const [row] = await db
        .insert(assessmentTypes)
        .values({
          name: `${MARK}_type_${crypto.randomUUID()}`,
          intervalCount: 1,
          intervalUnit: "month",
          sortOrder: 9999,
        })
        .returning({ id: assessmentTypes.id });
      typeId = (row as { id: string }).id;
      return typeId;
    },

    /** Stored row of a member (what the database holds, not what the API says). */
    async memberRow(id: string) {
      const [row] = await db.select().from(members).where(eq(members.id, id));
      return row;
    },
    async periodRows(memberId: string) {
      return db
        .select()
        .from(membershipPeriods)
        .where(eq(membershipPeriods.memberId, memberId));
    },
    async memberCountByName(fullName: string): Promise<number> {
      const rows = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.fullName, fullName));
      return rows.length;
    },
    /** Change-log rows written by this file's sign-in, optionally narrowed. */
    async audit(filter: { action?: string; entityId?: string } = {}) {
      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.sessionId, suite.sessionId))
        .orderBy(auditLog.id);
      return rows.filter(
        (r) =>
          (!filter.action || r.action === filter.action) &&
          (!filter.entityId || r.entityId === filter.entityId),
      );
    },
    /** Change-log rows about one member and (optionally) its periods, oldest first. */
    async auditAbout(memberId: string, periodIds: string[] = []) {
      const rows = await suite.audit();
      const ids = new Set([memberId, ...periodIds]);
      return rows.filter((r) => r.entityId && ids.has(r.entityId));
    },
  };

  beforeAll(async () => {
    session = await createSignedInSession();
    const [existing] = await db.select().from(gymSettings).limit(1);
    settingsBefore = existing ?? null;
    await db.insert(gymSettings).values({}).onConflictDoNothing();
    await db
      .update(gymSettings)
      .set({ timezone: "Asia/Kolkata", expiryLeadDays: 14 })
      .where(eq(gymSettings.id, 1));
    timezone = "Asia/Kolkata";
  });

  afterAll(async () => {
    const sweep = await db
      .select({ id: members.id })
      .from(members)
      .where(like(members.fullName, MARK_LIKE));
    for (const row of sweep) trackedMembers.add(row.id);
    const ids = [...trackedMembers];

    if (session) {
      await db
        .delete(auditLog)
        .where(eq(auditLog.sessionId, session.sessionId));
      await db
        .delete(idempotencyKeys)
        .where(eq(idempotencyKeys.sessionId, session.sessionId));
    }
    if (ids.length > 0) {
      await db.delete(assessments).where(inArray(assessments.memberId, ids));
      await db
        .delete(membershipPeriods)
        .where(inArray(membershipPeriods.memberId, ids));
      await db.delete(members).where(inArray(members.id, ids));
    }
    if (typeId) {
      await db.delete(assessments).where(eq(assessments.typeId, typeId));
      await db.delete(assessmentTypes).where(eq(assessmentTypes.id, typeId));
    }
    await db
      .delete(assessmentTypes)
      .where(or(like(assessmentTypes.name, `${MARK_LIKE}`)));

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
