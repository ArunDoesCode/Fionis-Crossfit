import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";

import { db, type Tx } from "../../src/db/client";
import {
  appAccount,
  assessments,
  assessmentTypes,
  auditLog,
  authSessions,
  dueOverrides,
  gymSettings,
  idempotencyKeys,
  loginAttempts,
  measurements,
  members,
  membershipPeriods,
  metrics,
} from "../../src/db/schemas";
import {
  BETTER_DIRECTIONS,
  DATATYPES,
  DUE_OVERRIDE_KINDS,
  INTERVAL_UNITS,
  OBJECTIVES,
  PLANS,
  SESSION_REVOKE_REASONS,
  SEXES,
  TABLE_PARTS,
} from "../../src/lib/enums";
import { attempt, PG, rolledBack } from "../helpers/db";

// Schema tests for data-model v2 (BR-REC-163, 164, 168, 169, 175).
// Every statement runs in a transaction that is rolled back: no rows are left
// behind. Rows are labelled TEST_foundation_ for the (unlikely) case of a crash.

const P = "TEST_foundation_";

const TABLES = [
  "app_account",
  "assessment_types",
  "assessments",
  "audit_log",
  "auth_sessions",
  "due_overrides",
  "gym_settings",
  "idempotency_keys",
  "login_attempts",
  "measurements",
  "members",
  "membership_periods",
  "metrics",
] as const;

const COLUMNS: Record<(typeof TABLES)[number], string[]> = {
  audit_log: [
    "id",
    "at",
    "session_id",
    "action",
    "entity",
    "entity_id",
    "before",
    "after",
    "ip",
    "device",
  ],
  idempotency_keys: [
    "session_id",
    "key",
    "endpoint",
    "request_hash",
    "status_code",
    "response",
    "created_at",
  ],
  app_account: [
    "id",
    "username",
    "password_hash",
    "password_changed_at",
    "created_at",
    "updated_at",
  ],
  auth_sessions: [
    "id",
    "account_id",
    "token_hash",
    "prev_token_hash",
    "rotated_at",
    "remember",
    "expires_at",
    "last_used_at",
    "revoked_at",
    "revoke_reason",
    "ip",
    "device",
    "created_at",
  ],
  login_attempts: [
    "id",
    "failed_count",
    "window_started_at",
    "locked_until",
    "updated_at",
  ],
  gym_settings: [
    "id",
    "gym_name",
    "timezone",
    "upcoming_lead_days",
    "expiry_lead_days",
    "updated_at",
  ],
  assessment_types: [
    "id",
    "name",
    "interval_count",
    "interval_unit",
    "is_active",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  metrics: [
    "id",
    "type_id",
    "name",
    "unit",
    "datatype",
    "decimals",
    "better",
    "plausible_min",
    "plausible_max",
    "interval_count",
    "interval_unit",
    "table_group",
    "table_part",
    "is_active",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  members: [
    "id",
    "full_name",
    "phone",
    "phone_digits",
    "email",
    "date_of_birth",
    "sex",
    "joined_on",
    "objective",
    "notes",
    "archived_at",
    "created_at",
    "updated_at",
  ],
  membership_periods: [
    "id",
    "member_id",
    "plan",
    "start_on",
    "end_on",
    "created_at",
    "updated_at",
  ],
  assessments: [
    "id",
    "member_id",
    "type_id",
    "assessed_on",
    "is_estimated",
    "created_at",
    "updated_at",
  ],
  measurements: [
    "assessment_id",
    "metric_id",
    "member_id",
    "measured_on",
    "value",
    "created_at",
    "updated_at",
  ],
  due_overrides: [
    "member_id",
    "type_id",
    "kind",
    "set_on",
    "until_on",
    "created_at",
  ],
};

type Row = Record<string, unknown>;
const rows = async (query: ReturnType<typeof sql>): Promise<Row[]> =>
  Array.from(await db.execute(query)) as Row[];

// ─── builders for parent rows (always inside a rolled-back transaction) ─────

async function newMember(tx: Tx, extra: Row = {}): Promise<string> {
  const [row] = await tx
    .insert(members)
    .values({
      fullName: `${P}member`,
      phone: "9845012345",
      phoneDigits: "9845012345",
      dateOfBirth: "1982-05-10",
      sex: "male",
      joinedOn: "2025-06-01",
      ...extra,
    } as never)
    .returning({ id: members.id });
  return (row as { id: string }).id;
}

async function newType(tx: Tx, extra: Row = {}): Promise<string> {
  const [row] = await tx
    .insert(assessmentTypes)
    .values({
      name: `${P}type ${crypto.randomUUID()}`,
      intervalCount: 1,
      intervalUnit: "month",
      sortOrder: 1,
      ...extra,
    } as never)
    .returning({ id: assessmentTypes.id });
  return (row as { id: string }).id;
}

async function newMetric(
  tx: Tx,
  typeId: string,
  extra: Row = {},
): Promise<string> {
  const [row] = await tx
    .insert(metrics)
    .values({
      typeId,
      name: `${P}metric ${crypto.randomUUID()}`,
      datatype: "number",
      better: "higher",
      sortOrder: 1,
      ...extra,
    } as never)
    .returning({ id: metrics.id });
  return (row as { id: string }).id;
}

async function newAssessment(
  tx: Tx,
  memberId: string,
  typeId: string,
  assessedOn = "2026-10-03",
): Promise<string> {
  const [row] = await tx
    .insert(assessments)
    .values({ memberId, typeId, assessedOn } as never)
    .returning({ id: assessments.id });
  return (row as { id: string }).id;
}

const refused = (code: string) => ({ ok: false, code });

// ─── BR-REC-169: the schema is built from Drizzle alone ─────────────────────

describe("BR-REC-169 the schema has every table and column", () => {
  test("BR-REC-169 the database has exactly the 13 tables of the data model", async () => {
    const found = await rows(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const names = found
      .map((r) => String(r.table_name))
      .filter((n) => !n.startsWith("__drizzle"))
      .sort();
    expect(names).toEqual([...TABLES].sort());
  });

  for (const table of TABLES) {
    test(`BR-REC-169 ${table} has the columns of the data model`, async () => {
      const found = await rows(
        sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table}`,
      );
      const names = new Set(found.map((r) => String(r.column_name)));
      const missing = COLUMNS[table].filter((c) => !names.has(c));
      expect(missing).toEqual([]);
    });
  }

  test("BR-REC-169 the schema needs no Postgres extension (only the built-in plpgsql is installed)", async () => {
    const found = await rows(sql`select extname from pg_extension`);
    expect(found.map((r) => String(r.extname))).toEqual(["plpgsql"]);
  });

  test("BR-REC-169 no source under src/db or scripts asks for an extension, a trigram or exclusion constraint", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "migrations") {
            walk(full);
          }
        } else if (/\.(ts|sql)$/.test(entry.name)) {
          const text = readFileSync(full, "utf8");
          if (
            /create\s+extension|pg_trgm|btree_gist|gin_trgm_ops|exclude\s+using/i.test(
              text,
            )
          ) {
            hits.push(full);
          }
        }
      }
    };
    walk(join(import.meta.dir, "../../src/db"));
    walk(join(import.meta.dir, "../../scripts"));
    expect(hits).toEqual([]);
  });

  test("BR-REC-169 the one-row unique index app_account_one_row exists", async () => {
    const found = await rows(
      sql`select indexname from pg_indexes where schemaname = 'public' and tablename = 'app_account' and indexname = 'app_account_one_row'`,
    );
    expect(found).toHaveLength(1);
  });
});

describe("BR-REC-169 the checks and keys of the data model are enforced", () => {
  test("BR-REC-169 membership period: end before start is refused, end on start day is allowed", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const base = { memberId, plan: "monthly" };
      expect(
        await attempt(tx, (sp) =>
          sp.insert(membershipPeriods).values({
            ...base,
            startOn: "2026-10-03",
            endOn: "2026-10-02",
          } as never),
        ),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, (sp) =>
          sp.insert(membershipPeriods).values({
            ...base,
            startOn: "2026-10-03",
            endOn: "2026-10-03",
          } as never),
        ),
      ).toEqual({ ok: true });
    });
  });

  test("BR-REC-169 a member with a membership period cannot be deleted (restrict)", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      await tx.insert(membershipPeriods).values({
        memberId,
        plan: "annual",
        startOn: "2026-01-01",
        endOn: "2026-12-31",
      } as never);
      expect(
        await attempt(tx, (sp) =>
          sp.delete(members).where(eq(members.id, memberId)),
        ),
      ).toMatchObject(refused(PG.foreignKeyViolation));
    });
  });

  test("BR-REC-169 a membership period needs an existing member", async () => {
    await rolledBack(async (tx) => {
      expect(
        await attempt(tx, (sp) =>
          sp.insert(membershipPeriods).values({
            memberId: "00000000-0000-4000-8000-000000000009",
            plan: "annual",
            startOn: "2026-01-01",
            endOn: "2026-12-31",
          } as never),
        ),
      ).toMatchObject(refused(PG.foreignKeyViolation));
    });
  });

  test("BR-REC-169 gym settings: Due soon window 0-30 days, Ends soon window 0-60 days", async () => {
    await rolledBack(async (tx) => {
      await tx.insert(gymSettings).values({}).onConflictDoNothing();
      const update = (set: Row) => (sp: Tx) =>
        sp
          .update(gymSettings)
          .set(set as never)
          .where(eq(gymSettings.id, 1));
      expect(await attempt(tx, update({ upcomingLeadDays: 30 }))).toEqual({
        ok: true,
      });
      expect(await attempt(tx, update({ upcomingLeadDays: 0 }))).toEqual({
        ok: true,
      });
      expect(await attempt(tx, update({ upcomingLeadDays: 31 }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(await attempt(tx, update({ upcomingLeadDays: -1 }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(await attempt(tx, update({ expiryLeadDays: 60 }))).toEqual({
        ok: true,
      });
      expect(await attempt(tx, update({ expiryLeadDays: 61 }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(await attempt(tx, update({ expiryLeadDays: -1 }))).toMatchObject(
        refused(PG.checkViolation),
      );
    });
  });

  test("BR-REC-169 an assessment repeats every 1-24 weeks or months", async () => {
    await rolledBack(async (tx) => {
      const insert = (extra: Row) => (sp: Tx) => newType(sp, extra);
      expect(await attempt(tx, insert({ intervalCount: 1 }))).toEqual({
        ok: true,
      });
      expect(
        await attempt(tx, insert({ intervalCount: 24, intervalUnit: "week" })),
      ).toEqual({
        ok: true,
      });
      expect(await attempt(tx, insert({ intervalCount: 0 }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(await attempt(tx, insert({ intervalCount: 25 }))).toMatchObject(
        refused(PG.checkViolation),
      );
    });
  });

  test("BR-REC-169 an assessment name is unique ignoring case", async () => {
    await rolledBack(async (tx) => {
      await newType(tx, { name: `${P}Body composition` });
      expect(
        await attempt(tx, (sp) =>
          newType(sp, { name: `${P}body COMPOSITION` }),
        ),
      ).toMatchObject(refused(PG.uniqueViolation));
      expect(
        await attempt(tx, (sp) => newType(sp, { name: `${P}Fitness test` })),
      ).toEqual({ ok: true });
    });
  });

  test("BR-REC-169 measurement settings: decimals 0-2, check range min < max", async () => {
    await rolledBack(async (tx) => {
      const typeId = await newType(tx);
      const insert = (extra: Row) => (sp: Tx) => newMetric(sp, typeId, extra);
      expect(await attempt(tx, insert({ decimals: 0 }))).toEqual({ ok: true });
      expect(await attempt(tx, insert({ decimals: 2 }))).toEqual({ ok: true });
      expect(await attempt(tx, insert({ decimals: 3 }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(await attempt(tx, insert({ decimals: -1 }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(
        await attempt(tx, insert({ plausibleMin: 10, plausibleMax: 50 })),
      ).toEqual({
        ok: true,
      });
      expect(await attempt(tx, insert({ plausibleMin: 10 }))).toEqual({
        ok: true,
      });
      expect(await attempt(tx, insert({ plausibleMax: 50 }))).toEqual({
        ok: true,
      });
      expect(
        await attempt(tx, insert({ plausibleMin: 50, plausibleMax: 10 })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, insert({ plausibleMin: 10, plausibleMax: 10 })),
      ).toMatchObject(refused(PG.checkViolation));
    });
  });

  test("BR-REC-169 measurement own interval: count and unit are both set or both empty, 1-24", async () => {
    await rolledBack(async (tx) => {
      const typeId = await newType(tx);
      const insert = (extra: Row) => (sp: Tx) => newMetric(sp, typeId, extra);
      expect(
        await attempt(tx, insert({ intervalCount: 3, intervalUnit: "month" })),
      ).toEqual({
        ok: true,
      });
      expect(await attempt(tx, insert({ intervalCount: 3 }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(
        await attempt(tx, insert({ intervalUnit: "month" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, insert({ intervalCount: 25, intervalUnit: "week" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, insert({ intervalCount: 0, intervalUnit: "week" })),
      ).toMatchObject(refused(PG.checkViolation));
    });
  });

  test("BR-REC-169 measurement report-table place: group and part are both set or both empty", async () => {
    await rolledBack(async (tx) => {
      const typeId = await newType(tx);
      const insert = (extra: Row) => (sp: Tx) => newMetric(sp, typeId, extra);
      expect(
        await attempt(
          tx,
          insert({ tableGroup: "Skeletal muscle %", tablePart: "arms" }),
        ),
      ).toEqual({ ok: true });
      expect(
        await attempt(tx, insert({ tableGroup: "Skeletal muscle %" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(await attempt(tx, insert({ tablePart: "arms" }))).toMatchObject(
        refused(PG.checkViolation),
      );
    });
  });

  test("BR-REC-169 a measurement name is unique inside its assessment, ignoring case, but may repeat in another", async () => {
    await rolledBack(async (tx) => {
      const typeA = await newType(tx);
      const typeB = await newType(tx);
      await newMetric(tx, typeA, { name: `${P}Weight` });
      expect(
        await attempt(tx, (sp) => newMetric(sp, typeA, { name: `${P}WEIGHT` })),
      ).toMatchObject(refused(PG.uniqueViolation));
      expect(
        await attempt(tx, (sp) => newMetric(sp, typeB, { name: `${P}Weight` })),
      ).toEqual({ ok: true });
    });
  });

  test("BR-REC-169 an assessment with measurements cannot be deleted from the catalog (restrict)", async () => {
    await rolledBack(async (tx) => {
      const typeId = await newType(tx);
      await newMetric(tx, typeId);
      expect(
        await attempt(tx, (sp) =>
          sp.delete(assessmentTypes).where(eq(assessmentTypes.id, typeId)),
        ),
      ).toMatchObject(refused(PG.foreignKeyViolation));
    });
  });

  test("BR-REC-169 one assessment per member + type + date", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      const otherType = await newType(tx);
      await newAssessment(tx, memberId, typeId, "2025-12-30");
      expect(
        await attempt(tx, (sp) =>
          newAssessment(sp, memberId, typeId, "2025-12-30"),
        ),
      ).toMatchObject(refused(PG.uniqueViolation));
      expect(
        await attempt(tx, (sp) =>
          newAssessment(sp, memberId, typeId, "2025-12-31"),
        ),
      ).toEqual({ ok: true });
      expect(
        await attempt(tx, (sp) =>
          newAssessment(sp, memberId, otherType, "2025-12-30"),
        ),
      ).toEqual({ ok: true });
    });
  });

  test("BR-REC-169 deleting an assessment deletes its values; one value per measurement; a used measurement cannot be deleted", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      const metricId = await newMetric(tx, typeId);
      const assessmentId = await newAssessment(tx, memberId, typeId);
      const value = {
        assessmentId,
        metricId,
        memberId,
        measuredOn: "2026-10-03",
        value: 94,
      };
      await tx.insert(measurements).values(value as never);
      expect(
        await attempt(tx, (sp) =>
          sp.insert(measurements).values(value as never),
        ),
      ).toMatchObject(refused(PG.uniqueViolation));
      expect(
        await attempt(tx, (sp) =>
          sp.delete(metrics).where(eq(metrics.id, metricId)),
        ),
      ).toMatchObject(refused(PG.foreignKeyViolation));

      await tx.delete(assessments).where(eq(assessments.id, assessmentId));
      const left = await tx
        .select()
        .from(measurements)
        .where(eq(measurements.assessmentId, assessmentId));
      expect(left).toHaveLength(0);
    });
  });

  test("BR-REC-169 a due override is either a flag without a date or a snooze with a date at most 90 days ahead", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      const insert = (extra: Row) => (sp: Tx) =>
        sp
          .insert(dueOverrides)
          .values({ memberId, typeId, setOn: "2026-10-03", ...extra } as never);
      expect(await attempt(tx, insert({ kind: "flag" }))).toEqual({ ok: true });
      expect(
        await attempt(tx, insert({ kind: "snooze", untilOn: "2026-11-03" })),
      ).toEqual({
        ok: true,
      });
      expect(
        await attempt(tx, insert({ kind: "snooze", untilOn: "2027-01-01" })),
      ).toEqual({
        ok: true,
      }); // 90 days after 2026-10-03
      expect(
        await attempt(tx, insert({ kind: "snooze", untilOn: "2027-01-02" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(await attempt(tx, insert({ kind: "snooze" }))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(
        await attempt(tx, insert({ kind: "flag", untilOn: "2026-11-03" })),
      ).toMatchObject(refused(PG.checkViolation));
    });
  });

  test("BR-REC-169 one due override per member + assessment", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      const row = { memberId, typeId, kind: "flag", setOn: "2026-10-03" };
      await tx.insert(dueOverrides).values(row as never);
      expect(
        await attempt(tx, (sp) => sp.insert(dueOverrides).values(row as never)),
      ).toMatchObject(refused(PG.uniqueViolation));
    });
  });

  test("BR-REC-169 one stored answer per session + idempotency key", async () => {
    await rolledBack(async (tx) => {
      const row = {
        sessionId: crypto.randomUUID(),
        key: crypto.randomUUID(),
        endpoint: `${P}endpoint`,
        requestHash: "abc",
        statusCode: 201,
        response: { ok: true },
      };
      await tx.insert(idempotencyKeys).values(row);
      expect(
        await attempt(tx, (sp) => sp.insert(idempotencyKeys).values(row)),
      ).toMatchObject(refused(PG.uniqueViolation));
      expect(
        await attempt(tx, (sp) =>
          sp
            .insert(idempotencyKeys)
            .values({ ...row, sessionId: crypto.randomUUID() }),
        ),
      ).toEqual({ ok: true });
    });
  });

  test("BR-REC-169 a sign-in token hash is unique and deleting the account deletes its sign-ins", async () => {
    await rolledBack(async (tx) => {
      const [account] = await tx
        .insert(appAccount)
        .values({
          username: `${P.toLowerCase()}user`,
          passwordHash: "$argon2id$test",
          passwordChangedAt: new Date(),
        })
        .returning({ id: appAccount.id });
      const accountId = (account as { id: string }).id;
      const session = (extra: Row = {}) =>
        ({
          accountId,
          tokenHash: `${P}hash-1`,
          remember: true,
          expiresAt: new Date(Date.now() + 3600_000),
          lastUsedAt: new Date(),
          ...extra,
        }) as never;
      await tx.insert(authSessions).values(session());
      expect(
        await attempt(tx, (sp) => sp.insert(authSessions).values(session())),
      ).toMatchObject(refused(PG.uniqueViolation));
      expect(
        await attempt(tx, (sp) =>
          sp.insert(authSessions).values(session({ tokenHash: `${P}hash-2` })),
        ),
      ).toEqual({ ok: true });

      await tx.delete(appAccount).where(eq(appAccount.id, accountId));
      const left = await tx
        .select()
        .from(authSessions)
        .where(eq(authSessions.accountId, accountId));
      expect(left).toHaveLength(0);
    });
  });

  test("BR-REC-169 the change log accepts a row with no session and requires an action", async () => {
    await rolledBack(async (tx) => {
      expect(
        await attempt(tx, (sp) =>
          sp.insert(auditLog).values({ action: `${P}server.command` } as never),
        ),
      ).toEqual({ ok: true });
      expect(
        await attempt(tx, (sp) =>
          sp.insert(auditLog).values({ entity: "x" } as never),
        ),
      ).toMatchObject({ ok: false });
    });
  });
});

// ─── BR-REC-168: exactly one account, one settings row, one lock-counter row ─

describe("BR-REC-168 one login account, one settings row, one lock-counter row", () => {
  test("BR-REC-168 a second login account is refused by the database", async () => {
    await rolledBack(async (tx) => {
      const account = (username: string) =>
        ({
          username,
          passwordHash: "$argon2id$test",
          passwordChangedAt: new Date(),
        }) as never;
      await tx.insert(appAccount).values(account(`${P.toLowerCase()}first`));
      expect(
        await attempt(tx, (sp) =>
          sp.insert(appAccount).values(account(`${P.toLowerCase()}second`)),
        ),
      ).toMatchObject(refused(PG.uniqueViolation));
    });
  });

  test("BR-REC-168 a second settings row is refused (id must be 1, id 1 only once)", async () => {
    await rolledBack(async (tx) => {
      await tx.insert(gymSettings).values({}).onConflictDoNothing();
      expect(
        await attempt(tx, (sp) =>
          sp.insert(gymSettings).values({ id: 2 } as never),
        ),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, (sp) =>
          sp.insert(gymSettings).values({ id: 1 } as never),
        ),
      ).toMatchObject(refused(PG.uniqueViolation));
    });
  });

  test("BR-REC-168 a second lock-counter row is refused (id must be 1, id 1 only once)", async () => {
    await rolledBack(async (tx) => {
      await tx.insert(loginAttempts).values({}).onConflictDoNothing();
      expect(
        await attempt(tx, (sp) =>
          sp.insert(loginAttempts).values({ id: 2 } as never),
        ),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, (sp) =>
          sp.insert(loginAttempts).values({ id: 1 } as never),
        ),
      ).toMatchObject(refused(PG.uniqueViolation));
    });
  });

  test("BR-REC-168 a new lock-counter row starts with no failed tries and no lock", async () => {
    await rolledBack(async (tx) => {
      await tx.delete(loginAttempts);
      await tx.insert(loginAttempts).values({});
      const [row] = await tx.select().from(loginAttempts);
      expect(row).toMatchObject({ id: 1, failedCount: 0, lockedUntil: null });
    });
  });

  test("BR-REC-168 a new settings row has the gym's defaults", async () => {
    await rolledBack(async (tx) => {
      await tx.delete(gymSettings);
      await tx.insert(gymSettings).values({});
      const [row] = await tx.select().from(gymSettings);
      expect(row).toMatchObject({
        id: 1,
        gymName: "Fionis CrossFit",
        timezone: "Asia/Kolkata",
        upcomingLeadDays: 7,
        expiryLeadDays: 14,
      });
    });
  });
});

// ─── BR-REC-163: days are `date`, moments are `timestamptz` ─────────────────

describe("BR-REC-163 calendar days have no time, moments are in UTC", () => {
  const DAY_COLUMNS: [string, string][] = [
    ["members", "date_of_birth"],
    ["members", "joined_on"],
    ["membership_periods", "start_on"],
    ["membership_periods", "end_on"],
    ["assessments", "assessed_on"],
    ["measurements", "measured_on"],
    ["due_overrides", "set_on"],
    ["due_overrides", "until_on"],
  ];
  const MOMENT_COLUMNS: [string, string][] = [
    ["audit_log", "at"],
    ["idempotency_keys", "created_at"],
    ["app_account", "password_changed_at"],
    ["app_account", "created_at"],
    ["auth_sessions", "expires_at"],
    ["auth_sessions", "last_used_at"],
    ["auth_sessions", "revoked_at"],
    ["auth_sessions", "created_at"],
    ["login_attempts", "window_started_at"],
    ["login_attempts", "locked_until"],
    ["members", "archived_at"],
    ["members", "created_at"],
    ["members", "updated_at"],
    ["measurements", "created_at"],
    ["due_overrides", "created_at"],
  ];

  const typeOf = async (table: string, column: string) => {
    const found = await rows(
      sql`select data_type from information_schema.columns where table_schema = 'public' and table_name = ${table} and column_name = ${column}`,
    );
    return found[0]?.data_type;
  };

  for (const [table, column] of DAY_COLUMNS) {
    test(`BR-REC-163 ${table}.${column} is a date`, async () => {
      expect(await typeOf(table, column)).toBe("date");
    });
  }
  for (const [table, column] of MOMENT_COLUMNS) {
    test(`BR-REC-163 ${table}.${column} is timestamptz`, async () => {
      expect(await typeOf(table, column)).toBe("timestamp with time zone");
    });
  }

  test("BR-REC-163 no column in the schema is a timestamp without time zone, and every *_on column is a date", async () => {
    const found = await rows(
      sql`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and table_name in (${sql.join(
        TABLES.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    );
    const naive = found.filter(
      (r) => r.data_type === "timestamp without time zone",
    );
    const dayAsMoment = found.filter(
      (r) => String(r.column_name).endsWith("_on") && r.data_type !== "date",
    );
    expect(naive).toEqual([]);
    expect(dayAsMoment).toEqual([]);
  });

  test("BR-REC-163 an assessment typed at 23:30 IST on 3 Oct is stored as the day 2026-10-03", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      // the service passes the gym day; the column keeps exactly that day, no time zone shift
      const assessmentId = await newAssessment(
        tx,
        memberId,
        typeId,
        "2026-10-03",
      );
      const [row] = await tx
        .select({ day: assessments.assessedOn })
        .from(assessments)
        .where(eq(assessments.id, assessmentId));
      expect(row?.day).toBe("2026-10-03");
      const text = await tx.execute(
        sql`select assessed_on::text as day from assessments where id = ${assessmentId}`,
      );
      expect((Array.from(text)[0] as Row).day).toBe("2026-10-03");
    });
  });
});

// ─── BR-REC-164: numeric(12,3) values ───────────────────────────────────────

describe("BR-REC-164 values are numeric(12,3)", () => {
  test("BR-REC-164 measurements.value and the check range columns are numeric(12,3)", async () => {
    const found = await rows(
      sql`select table_name, column_name, data_type, numeric_precision, numeric_scale from information_schema.columns where table_schema = 'public' and ((table_name = 'measurements' and column_name = 'value') or (table_name = 'metrics' and column_name in ('plausible_min', 'plausible_max')))`,
    );
    expect(found).toHaveLength(3);
    for (const col of found) {
      expect(col).toMatchObject({
        data_type: "numeric",
        numeric_precision: 12,
        numeric_scale: 3,
      });
    }
  });

  test('BR-REC-164 Plank "2:02" is stored as 122.000 and read back as 122', async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      const metricId = await newMetric(tx, typeId, {
        datatype: "duration",
        decimals: 0,
      });
      const assessmentId = await newAssessment(tx, memberId, typeId);
      await tx.insert(measurements).values({
        assessmentId,
        metricId,
        memberId,
        measuredOn: "2026-10-03",
        value: 122,
      } as never);

      const [row] = await tx
        .select({ value: measurements.value })
        .from(measurements)
        .where(eq(measurements.assessmentId, assessmentId));
      expect(row?.value).toBe(122);

      const text = await tx.execute(
        sql`select value::text as v from measurements where assessment_id = ${assessmentId}`,
      );
      expect((Array.from(text)[0] as Row).v).toBe("122.000");
    });
  });

  test("BR-REC-164 a weight of 95.5 kg is kept exactly, a value with more than 3 decimals is rounded to 3", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      const weight = await newMetric(tx, typeId, { name: `${P}weight` });
      const fat = await newMetric(tx, typeId, { name: `${P}fat` });
      const assessmentId = await newAssessment(tx, memberId, typeId);
      const base = { assessmentId, memberId, measuredOn: "2026-10-03" };
      await tx.insert(measurements).values([
        { ...base, metricId: weight, value: 95.5 },
        { ...base, metricId: fat, value: 21.34567 },
      ] as never);
      const text = await tx.execute(
        sql`select metric_id, value::text as v from measurements where assessment_id = ${assessmentId}`,
      );
      const byMetric = new Map(
        (Array.from(text) as Row[]).map((r) => [r.metric_id, r.v]),
      );
      expect(byMetric.get(weight)).toBe("95.500");
      expect(byMetric.get(fat)).toBe("21.346");
    });
  });

  test("BR-REC-164 a value that does not fit 12 digits with 3 decimals is refused", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      const metricId = await newMetric(tx, typeId);
      const assessmentId = await newAssessment(tx, memberId, typeId);
      const value = (v: number) => (sp: Tx) =>
        sp.insert(measurements).values({
          assessmentId,
          metricId,
          memberId,
          measuredOn: "2026-10-03",
          value: v,
        } as never);
      expect(await attempt(tx, value(999_999_999.999))).toEqual({ ok: true });
      expect(await attempt(tx, value(1_000_000_000))).toMatchObject(
        refused(PG.numericOutOfRange),
      );
    });
  });
});

// ─── BR-REC-175: text + check, never a Postgres enum ────────────────────────

describe("BR-REC-175 enum-like columns are text with a check that equals the TS union", () => {
  // [table, column, the allowed values as the data-model spec lists them, the exported TS list]
  const ENUM_COLUMNS: [string, string, string[], readonly string[]][] = [
    [
      "membership_periods",
      "plan",
      ["monthly", "quarterly", "half_annual", "annual"],
      PLANS,
    ],
    ["members", "sex", ["male", "female"], SEXES],
    [
      "members",
      "objective",
      ["fat_loss", "strength", "general_fitness", "other"],
      OBJECTIVES,
    ],
    ["metrics", "datatype", ["number", "duration"], DATATYPES],
    ["metrics", "better", ["higher", "lower", "none"], BETTER_DIRECTIONS],
    ["assessment_types", "interval_unit", ["week", "month"], INTERVAL_UNITS],
    ["metrics", "interval_unit", ["week", "month"], INTERVAL_UNITS],
    [
      "metrics",
      "table_part",
      ["whole_body", "arms", "trunk", "legs"],
      TABLE_PARTS,
    ],
    ["due_overrides", "kind", ["flag", "snooze"], DUE_OVERRIDE_KINDS],
    [
      "auth_sessions",
      "revoke_reason",
      ["logout", "logout_all", "password_change", "reuse", "reset", "expired"],
      SESSION_REVOKE_REASONS,
    ],
  ];

  async function checkLiterals(
    table: string,
    column: string,
  ): Promise<string[][]> {
    const found = await rows(sql`
      select pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'c' and n.nspname = 'public' and t.relname = ${table}
        and array_length(c.conkey, 1) = 1
        and (select a.attname from pg_attribute a where a.attrelid = t.oid and a.attnum = c.conkey[1]) = ${column}`);
    return found.map((r) =>
      [...String(r.def).matchAll(/'([^']*)'/g)].map((m) => String(m[1])).sort(),
    );
  }

  for (const [table, column, listed, union] of ENUM_COLUMNS) {
    test(`BR-REC-175 ${table}.${column} is text and its check allows exactly the listed values`, async () => {
      const type = await rows(
        sql`select data_type from information_schema.columns where table_schema = 'public' and table_name = ${table} and column_name = ${column}`,
      );
      expect(type[0]?.data_type).toBe("text");

      const checks = await checkLiterals(table, column);
      expect(checks.length).toBeGreaterThanOrEqual(1);
      expect(checks[0]).toEqual([...listed].sort());
      // and the TS union all layers use is the same list
      expect([...union].sort()).toEqual([...listed].sort());
    });
  }

  test('BR-REC-175 plan "weekly" is refused by the database, every listed plan is accepted', async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const period = (plan: string) => (sp: Tx) =>
        sp.insert(membershipPeriods).values({
          memberId,
          plan,
          startOn: "2026-10-03",
          endOn: "2026-10-31",
        } as never);
      expect(await attempt(tx, period("weekly"))).toMatchObject(
        refused(PG.checkViolation),
      );
      for (const plan of PLANS) {
        expect(await attempt(tx, period(plan))).toEqual({ ok: true });
      }
    });
  });

  test("BR-REC-175 members.sex rejects a value outside the list, members.objective may stay empty", async () => {
    await rolledBack(async (tx) => {
      expect(
        await attempt(tx, (sp) => newMember(sp, { sex: "other" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, (sp) => newMember(sp, { objective: "weights" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, (sp) => newMember(sp, { sex: "female" })),
      ).toEqual({ ok: true });
      expect(
        await attempt(tx, (sp) => newMember(sp, { objective: null })),
      ).toEqual({ ok: true });
    });
  });

  test("BR-REC-175 metrics datatype and better reject a value outside the list", async () => {
    await rolledBack(async (tx) => {
      const typeId = await newType(tx);
      expect(
        await attempt(tx, (sp) => newMetric(sp, typeId, { datatype: "text" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, (sp) => newMetric(sp, typeId, { better: "up" })),
      ).toMatchObject(refused(PG.checkViolation));
      expect(
        await attempt(tx, (sp) => newMetric(sp, typeId, { better: "none" })),
      ).toEqual({
        ok: true,
      });
    });
  });

  test("BR-REC-175 interval unit and report-table part reject a value outside the list", async () => {
    await rolledBack(async (tx) => {
      expect(
        await attempt(tx, (sp) => newType(sp, { intervalUnit: "day" })),
      ).toMatchObject(refused(PG.checkViolation));
      const typeId = await newType(tx);
      expect(
        await attempt(tx, (sp) =>
          newMetric(sp, typeId, { tableGroup: "g", tablePart: "head" }),
        ),
      ).toMatchObject(refused(PG.checkViolation));
    });
  });

  test("BR-REC-175 due override kind and sign-in end reason reject a value outside the list", async () => {
    await rolledBack(async (tx) => {
      const memberId = await newMember(tx);
      const typeId = await newType(tx);
      expect(
        await attempt(tx, (sp) =>
          sp.insert(dueOverrides).values({
            memberId,
            typeId,
            kind: "later",
            setOn: "2026-10-03",
          } as never),
        ),
      ).toMatchObject(refused(PG.checkViolation));

      const [account] = await tx
        .insert(appAccount)
        .values({
          username: `${P.toLowerCase()}user`,
          passwordHash: "$argon2id$test",
          passwordChangedAt: new Date(),
        })
        .returning({ id: appAccount.id });
      const accountId = (account as { id: string }).id;
      const session = (revokeReason: string | null) => (sp: Tx) =>
        sp.insert(authSessions).values({
          accountId,
          tokenHash: `${P}${crypto.randomUUID()}`,
          remember: false,
          expiresAt: new Date(Date.now() + 3600_000),
          lastUsedAt: new Date(),
          revokeReason,
        } as never);
      expect(await attempt(tx, session("bored"))).toMatchObject(
        refused(PG.checkViolation),
      );
      expect(await attempt(tx, session(null))).toEqual({ ok: true });
      for (const reason of SESSION_REVOKE_REASONS) {
        expect(await attempt(tx, session(reason))).toEqual({ ok: true });
      }
    });
  });

  test("BR-REC-175 no source file under src/db/schemas uses pgEnum", () => {
    const dir = join(import.meta.dir, "../../src/db/schemas");
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      // comments may say "never pgEnum"; only code counts
      const code = readFileSync(join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (/pgEnum/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  test("BR-REC-175 the database has no Postgres enum type", async () => {
    const found = await rows(
      sql`select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e' and n.nspname = 'public'`,
    );
    expect(found).toEqual([]);
  });
});
