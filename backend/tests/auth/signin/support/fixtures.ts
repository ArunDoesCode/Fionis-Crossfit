/**
 * DB fixtures for the sign-in tests. Everything the tests create is TEST data:
 * the login's username starts with `test_auth_signin_` (usernames are stored lower-case),
 * session rows hang off that account, audit rows are removed by time window.
 * `app_account` and `login_attempts` are one-row tables, so these files run
 * one after another (bun test does) and each cleans up after itself.
 */
import { and, eq, gte, inArray, like, sql } from "drizzle-orm";

import { db } from "../../../../src/db/client";
import {
  appAccount,
  authSessions,
  loginAttempts,
} from "../../../../src/db/schemas/auth";
import { auditLog } from "../../../../src/db/schemas/infrastructure";

export const TEST_PREFIX = "test_auth_signin_";
export const TEST_USERNAME = "test_auth_signin_admin";
export const TEST_PASSWORD = "TEST-right-password-1";
export const WRONG_PASSWORD = "TEST-wrong-password-9";

const FIFTEEN_MINUTES = 15 * 60;

export async function hashPassword(password: string): Promise<string> {
  // Cheap argon2id parameters; the server verifies with the parameters stored in the hash.
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 1024,
    timeCost: 1,
  });
}

export type TestAccount = {
  id: string;
  username: string;
  password: string;
};

/**
 * Removes leftover logins of this suite (their sessions go with them). Throws if
 * the test DB holds any other login: this suite never deletes data it did not create.
 */
export async function removeTestAccounts(): Promise<void> {
  const rows = await db
    .select({ id: appAccount.id, username: appAccount.username })
    .from(appAccount);
  const foreign = rows.filter((r) => !r.username.startsWith(TEST_PREFIX));
  if (foreign.length > 0) {
    throw new Error(
      `The test database holds a login this suite did not create (username without the ${TEST_PREFIX} prefix). ` +
        "Another test run may be using the same database, or a run crashed: finish/clean it, then run again.",
    );
  }
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(appAccount).where(inArray(appAccount.id, ids));
  }
}

/** Replaces any TEST login with a fresh one (no sessions). */
export async function installAccount(
  options: { username?: string; password?: string } = {},
): Promise<TestAccount> {
  const username = options.username ?? TEST_USERNAME;
  const password = options.password ?? TEST_PASSWORD;
  await removeTestAccounts();
  const [row] = await db
    .insert(appAccount)
    .values({
      username,
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
    })
    .returning({ id: appAccount.id });
  if (!row) throw new Error("account fixture was not inserted");
  return { id: row.id, username, password };
}

export async function readAccount(accountId: string) {
  const [row] = await db
    .select()
    .from(appAccount)
    .where(eq(appAccount.id, accountId));
  return row;
}

export async function allAccounts() {
  return db.select().from(appAccount);
}

export async function sessionsOf(accountId: string) {
  return db
    .select()
    .from(authSessions)
    .where(eq(authSessions.accountId, accountId))
    .orderBy(authSessions.createdAt);
}

export async function sessionById(sid: string) {
  const [row] = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sid));
  return row;
}

/** A signed-in device without going through E01 (the refresh token is a placeholder, never presented). */
export async function insertSession(accountId: string): Promise<string> {
  const now = new Date();
  const [row] = await db
    .insert(authSessions)
    .values({
      accountId,
      tokenHash: `TEST_auth_signin_${crypto.randomUUID()}`,
      remember: true,
      expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
      lastUsedAt: now,
    })
    .returning({ id: authSessions.id });
  if (!row) throw new Error("session fixture was not inserted");
  return row.id;
}

// ---- the one-row lock store -------------------------------------------------

export type LockRow = {
  failedCount: number;
  windowStartedAt: Date | null;
  lockedUntil: Date | null;
};

export async function readLock(): Promise<LockRow | undefined> {
  const [row] = await db
    .select({
      failedCount: loginAttempts.failedCount,
      windowStartedAt: loginAttempts.windowStartedAt,
      lockedUntil: loginAttempts.lockedUntil,
    })
    .from(loginAttempts)
    .where(eq(loginAttempts.id, 1));
  return row;
}

/** The lock store as a fresh install leaves it: one row, nothing counted, not locked. */
export async function resetLock(): Promise<void> {
  await db
    .insert(loginAttempts)
    .values({
      id: 1,
      failedCount: 0,
      windowStartedAt: null,
      lockedUntil: null,
    })
    .onConflictDoUpdate({
      target: loginAttempts.id,
      set: { failedCount: 0, windowStartedAt: null, lockedUntil: null },
    });
}

export async function deleteLockRow(): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.id, 1));
}

/**
 * Time machine for the lock: moves every recorded moment `seconds` into the
 * past, as if that much time had gone by (the server reads the real clock).
 */
export async function rewindLock(seconds: number): Promise<void> {
  await db.execute(sql`
    update login_attempts
    set window_started_at = window_started_at - (${seconds}::float8 * interval '1 second'),
        locked_until = locked_until - (${seconds}::float8 * interval '1 second')
    where id = 1`);
}

/** Puts the login in a lock that ends `secondsFromNow` from now. */
export async function lockUntil(secondsFromNow: number): Promise<void> {
  const now = Date.now();
  await db
    .insert(loginAttempts)
    .values({
      id: 1,
      failedCount: 5,
      windowStartedAt: new Date(now - 60_000),
      lockedUntil: new Date(now + secondsFromNow * 1000),
    })
    .onConflictDoUpdate({
      target: loginAttempts.id,
      set: {
        failedCount: 5,
        windowStartedAt: new Date(now - 60_000),
        lockedUntil: new Date(now + secondsFromNow * 1000),
      },
    });
}

export const LOCK_SECONDS = FIFTEEN_MINUTES;

// ---- change log ---------------------------------------------------------------

export async function auditRows(action: string, since: Date) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, action), gte(auditLog.at, since)));
}

/** Everything the auth tables (and the change log since `since`) hold, as one string. */
export async function dumpAuthData(since: Date): Promise<string> {
  const [accounts, sessions, attempts, audit] = await Promise.all([
    db.select().from(appAccount),
    db.select().from(authSessions),
    db.select().from(loginAttempts),
    db.select().from(auditLog).where(gte(auditLog.at, since)),
  ]);
  return JSON.stringify({ accounts, sessions, attempts, audit });
}

/** Removes the change-log rows the sign-in actions wrote since `since`. */
export async function removeAuthAuditSince(since: Date): Promise<void> {
  await db
    .delete(auditLog)
    .where(and(like(auditLog.action, "auth.%"), gte(auditLog.at, since)));
}

/** Per-file start: a moment slightly before now, used to scope audit rows. */
export function suiteStart(): Date {
  return new Date(Date.now() - 2000);
}
