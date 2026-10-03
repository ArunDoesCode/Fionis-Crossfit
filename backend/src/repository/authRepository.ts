import { and, eq, gt, isNull, ne, or } from "drizzle-orm";

import { type Db, db, type Tx } from "../db/client";
import { appAccount, authSessions, loginAttempts } from "../db/schemas";
import type { SessionRevokeReason } from "../lib/enums";
import { AppError } from "../lib/errors";
import type { LockState } from "../types/auth.types";

/** A transaction handle, or the shared client for a plain read. */
type Executor = Db | Tx;

export type Account = typeof appAccount.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;

/** A row the database must hold after our own write is missing: a bug, answered as a generic 500. */
const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

/** `login_attempts` holds exactly this one row. */
const LOCK_ROW_ID = 1;

/** A sign-in that can still be used: not ended, not past `expires_at` (BR-REC-31). */
const isActive = (now: Date) =>
  and(isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now));

/** The current or the previous (grace) refresh token (BR-REC-32). */
const holdsToken = (hash: string) =>
  or(eq(authSessions.tokenHash, hash), eq(authSessions.prevTokenHash, hash));

export const authRepository = {
  // ─── account ──────────────────────────────────────────────────────────────

  async findAccountByUsername(username: string, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(appAccount)
      .where(eq(appAccount.username, username));
    return row;
  },

  async findAccountById(id: string, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(appAccount)
      .where(eq(appAccount.id, id));
    return row;
  },

  /** The one login, whatever its name (a unique index allows no second row). */
  async findTheAccount(executor: Executor = db) {
    const [row] = await executor.select().from(appAccount).limit(1);
    return row;
  },

  async insertAccount(
    executor: Executor,
    values: { username: string; passwordHash: string; passwordChangedAt: Date },
  ): Promise<Account> {
    const [row] = await executor.insert(appAccount).values(values).returning();
    if (!row) throw invariantBroken();
    return row;
  },

  async updatePassword(
    executor: Executor,
    id: string,
    passwordHash: string,
    now: Date,
  ) {
    await executor
      .update(appAccount)
      .set({ passwordHash, passwordChangedAt: now })
      .where(eq(appAccount.id, id));
  },

  // ─── the lock: the single `login_attempts` row ────────────────────────────

  /** A plain read for the fast "is it locked" answer; the decision is re-made under `lockForUpdate`. */
  async readLock(executor: Executor = db): Promise<LockState | undefined> {
    const [row] = await executor
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.id, LOCK_ROW_ID));
    return row;
  },

  /** Creates the row if it is missing (a fresh database has none until the first try). */
  async ensureLockRow(executor: Executor) {
    await executor
      .insert(loginAttempts)
      .values({ id: LOCK_ROW_ID })
      .onConflictDoNothing();
  },

  /** Reads the row with a row lock held until the transaction ends: concurrent tries queue here. */
  async lockForUpdate(tx: Tx): Promise<LockState> {
    await authRepository.ensureLockRow(tx);
    const [row] = await tx
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.id, LOCK_ROW_ID))
      .for("update");
    if (!row) throw invariantBroken();
    return row;
  },

  async saveLock(tx: Tx, state: LockState) {
    await tx
      .update(loginAttempts)
      .set({
        failedCount: state.failedCount,
        windowStartedAt: state.windowStartedAt,
        lockedUntil: state.lockedUntil,
      })
      .where(eq(loginAttempts.id, LOCK_ROW_ID));
  },

  // ─── sign-ins (auth_sessions) ─────────────────────────────────────────────

  async insertSession(tx: Tx, values: NewAuthSession) {
    await tx.insert(authSessions).values(values);
  },

  async findSessionById(id: string, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, id));
    return row;
  },

  /** No lock: sign out only reads. */
  async findSessionByTokenHash(hash: string, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(authSessions)
      .where(holdsToken(hash))
      .limit(1);
    return row;
  },

  /** Row-locked for the rotation, so two refreshes with one token run one after the other. */
  async findSessionByTokenHashForUpdate(tx: Tx, hash: string) {
    const [row] = await tx
      .select()
      .from(authSessions)
      .where(holdsToken(hash))
      .limit(1)
      .for("update");
    return row;
  },

  async rotateSession(
    tx: Tx,
    id: string,
    values: {
      tokenHash: string;
      prevTokenHash: string;
      rotatedAt: Date;
      lastUsedAt: Date;
      expiresAt: Date;
    },
  ) {
    await tx.update(authSessions).set(values).where(eq(authSessions.id, id));
  },

  /** A use of the sign-in that keeps its tokens: only the sliding times move (replaced token in its grace). */
  async touchSession(
    tx: Tx,
    id: string,
    values: { lastUsedAt: Date; expiresAt: Date },
  ) {
    await tx.update(authSessions).set(values).where(eq(authSessions.id, id));
  },

  /** Ends one sign-in; one already ended keeps its first reason. Returns whether it changed. */
  async revokeSession(
    tx: Tx,
    id: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean> {
    const rows = await tx
      .update(authSessions)
      .set({ revokedAt: now, revokeReason: reason })
      .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return rows.length > 0;
  },

  /** Ends every active sign-in of the login (except `exceptId`); returns how many. */
  async revokeActiveSessions(
    tx: Tx,
    accountId: string,
    reason: SessionRevokeReason,
    now: Date,
    exceptId?: string,
  ): Promise<number> {
    const rows = await tx
      .update(authSessions)
      .set({ revokedAt: now, revokeReason: reason })
      .where(
        and(
          eq(authSessions.accountId, accountId),
          isActive(now),
          exceptId === undefined ? undefined : ne(authSessions.id, exceptId),
        ),
      )
      .returning({ id: authSessions.id });
    return rows.length;
  },
};
