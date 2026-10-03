import { db, type Tx } from "../db/client";
import { type AuditEntry, writeAudit } from "../lib/audit";
import type { Actor } from "../lib/auth-middleware";
import { env } from "../lib/env";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../lib/token";
import { authRepository } from "../repository/authRepository";
import type {
  ChangePasswordBody,
  LockState,
  LoginBody,
  RequestMeta,
} from "../types/auth.types";
import {
  afterWrongTry,
  CLEAR_LOCK,
  isLocked,
  retryAfterSeconds,
} from "./authLock";

// Sign-in rules: docs/specs/member-records/auth.md (BR-REC-01, 02, 25-35, 43, 171).
// Every function takes `now`; only controllers and scripts read the clock.

/** A replaced refresh token still works this long (two tabs refreshing at once, BR-REC-32). */
const REFRESH_GRACE_MS = 60 * 1000;

/** One text for "no such user" and "wrong password": the answer never says which (BR-REC-01). */
const INVALID_CREDENTIALS_MESSAGE = "That username or password is not right.";

/** Cheapest sensible argon2id under test so suites stay fast; Bun's defaults otherwise (BR-REC-27). */
const ARGON2 =
  env.NODE_ENV === "test"
    ? ({ algorithm: "argon2id", memoryCost: 1024, timeCost: 1 } as const)
    : ({ algorithm: "argon2id" } as const);

const hashPassword = (plain: string) => Bun.password.hash(plain, ARGON2);

// An unknown username still pays for one hash check, so response time does not reveal it.
let decoyHash: Promise<string> | undefined;

async function passwordMatches(
  plain: string,
  storedHash: string | undefined,
): Promise<boolean> {
  if (storedHash !== undefined) return Bun.password.verify(plain, storedHash);
  decoyHash ??= hashPassword(crypto.randomUUID());
  await Bun.password.verify(plain, await decoyHash);
  return false;
}

const lockedError = (lock: LockState, now: Date) =>
  new AppError(
    "Too many wrong tries, so sign-in is paused.",
    429,
    "LOGIN_LOCKED",
    { retryAfterSeconds: retryAfterSeconds(lock, now) },
  );

const sessionExpiredError = () =>
  new UnauthorizedError("Please sign in again", "SESSION_EXPIRED");

/** One change-log row (BR-REC-43) with the request's address and device. */
const log = (
  tx: Tx,
  meta: RequestMeta,
  entry: Omit<AuditEntry, "ip" | "device">,
) => writeAudit(tx, { ...entry, ip: meta.ip, device: meta.device });

/**
 * Counts one wrong try against the global lock and logs it (`auth.login_failed`, plus `auth.locked`
 * for the try that starts the lock). Runs under the lock row's row lock; a try that finds the login
 * already locked (it passed the fast check before another try started the lock) is refused, not counted.
 */
async function recordWrongTry(
  tx: Tx,
  sessionId: string | null,
  meta: RequestMeta,
  now: Date,
): Promise<LockState | null> {
  const lock = await authRepository.lockForUpdate(tx);
  if (isLocked(lock, now)) return lock;
  const next = afterWrongTry(lock, now);
  await authRepository.saveLock(tx, next.state);
  await log(tx, meta, { sessionId, action: "auth.login_failed" });
  if (next.startedLock) {
    await log(tx, meta, {
      sessionId,
      action: "auth.locked",
      after: { lockedUntil: next.state.lockedUntil?.toISOString() ?? null },
    });
  }
  return null;
}

/** The sign-in a sign-out request belongs to: by refresh token, else by a valid access token's `sid`. */
async function sessionIdOf(tokens: {
  refreshToken: string | undefined;
  accessToken: string | undefined;
}): Promise<string | undefined> {
  if (tokens.refreshToken) {
    const session = await authRepository.findSessionByTokenHash(
      hashRefreshToken(tokens.refreshToken),
    );
    if (session) return session.id;
  }
  if (!tokens.accessToken) return undefined;
  return verifyAccessToken(tokens.accessToken).then(
    (payload) => payload.sid,
    () => undefined,
  );
}

export const authService = {
  /**
   * E01. Locked (even with the right password) -> 429 without checking the password. Right password
   * -> clears the count, creates the sign-in (`auth_sessions` row, HMAC of the refresh token) and
   * logs it, in one transaction. Wrong or unknown user -> counts toward the lock, 401.
   */
  async login(input: LoginBody, meta: RequestMeta, now: Date) {
    const lock = await authRepository.readLock();
    if (lock && isLocked(lock, now)) throw lockedError(lock, now);

    const account = await authRepository.findAccountByUsername(
      input.username.toLowerCase(),
    );
    const matches = await passwordMatches(
      input.password,
      account?.passwordHash,
    );

    if (!account || !matches) {
      const lockedMeanwhile = await db.transaction((tx) =>
        recordWrongTry(tx, null, meta, now),
      );
      if (lockedMeanwhile) throw lockedError(lockedMeanwhile, now);
      throw new UnauthorizedError(
        INVALID_CREDENTIALS_MESSAGE,
        "INVALID_CREDENTIALS",
      );
    }

    const sid = crypto.randomUUID();
    const refreshToken = generateRefreshToken();
    const lifetimeSeconds = input.remember
      ? env.REFRESH_TOKEN_TTL_SECONDS
      : env.SESSION_SHORT_TTL_SECONDS;
    const expiresAt = new Date(now.getTime() + lifetimeSeconds * 1000);

    const lockedWhileChecking = await db.transaction(async (tx) => {
      // The lock may have started while the password was being checked: decide again under the row lock.
      const current = await authRepository.lockForUpdate(tx);
      if (isLocked(current, now)) return current;
      await authRepository.saveLock(tx, CLEAR_LOCK);
      await authRepository.insertSession(tx, {
        id: sid,
        accountId: account.id,
        tokenHash: hashRefreshToken(refreshToken),
        remember: input.remember,
        expiresAt,
        lastUsedAt: now,
        ip: meta.ip,
        device: meta.device,
      });
      await log(tx, meta, {
        sessionId: sid,
        action: "auth.login",
      });
      return null;
    });
    if (lockedWhileChecking) throw lockedError(lockedWhileChecking, now);

    const accessToken = await signAccessToken({
      userId: account.id,
      userName: account.username,
      permissions: [],
      sid,
    });
    return {
      username: account.username,
      remember: input.remember,
      expiresAt,
      accessToken,
      refreshToken,
    };
  },

  /**
   * E02. Rotates the refresh token (BR-REC-32): the replaced one still works for 60 s, later use
   * ends the sign-in (`reuse`) and is logged. Slides `expires_at` 7 days when `remember`; the
   * 12 h cap of a sign-in without it never moves (BR-REC-31). Ignores the lock (BR-REC-171).
   */
  async refresh(
    refreshToken: string | undefined,
    meta: RequestMeta,
    now: Date,
  ) {
    if (!refreshToken) throw sessionExpiredError();
    const presented = hashRefreshToken(refreshToken);

    const rotated = await db.transaction(async (tx) => {
      const session = await authRepository.findSessionByTokenHashForUpdate(
        tx,
        presented,
      );
      if (
        !session ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= now.getTime()
      ) {
        return null;
      }

      const isCurrent = session.tokenHash === presented;
      const inGrace =
        session.rotatedAt !== null &&
        now.getTime() - session.rotatedAt.getTime() <= REFRESH_GRACE_MS;
      if (!isCurrent && !inGrace) {
        // A replaced token, long after its replacement: the stolen-token signal.
        await authRepository.revokeSession(tx, session.id, "reuse", now);
        await log(tx, meta, {
          sessionId: session.id,
          action: "auth.token_reuse",
        });
        return { reused: true } as const;
      }

      const account = await authRepository.findAccountById(
        session.accountId,
        tx,
      );
      if (!account) return null;

      const nextToken = generateRefreshToken();
      const expiresAt = session.remember
        ? new Date(now.getTime() + env.REFRESH_TOKEN_TTL_SECONDS * 1000)
        : session.expiresAt;
      await authRepository.rotateSession(tx, session.id, {
        tokenHash: hashRefreshToken(nextToken),
        prevTokenHash: session.tokenHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt,
      });
      return { account, session, nextToken, expiresAt, reused: false } as const;
    });
    // Thrown after the transaction: a reuse must commit its revoke and log row first.
    if (!rotated || rotated.reused) throw sessionExpiredError();

    const accessToken = await signAccessToken({
      userId: rotated.account.id,
      userName: rotated.account.username,
      permissions: [],
      sid: rotated.session.id,
    });
    return {
      remember: rotated.session.remember,
      expiresAt: rotated.expiresAt,
      accessToken,
      refreshToken: rotated.nextToken,
    };
  },

  /**
   * E03. Ends this device's sign-in, found by its refresh token (the access token may have
   * expired) or else by a valid access token's `sid`. Nothing to end is not an error.
   */
  async logout(
    tokens: {
      refreshToken: string | undefined;
      accessToken: string | undefined;
    },
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const sid = await sessionIdOf(tokens);
    if (sid === undefined) return;

    await db.transaction(async (tx) => {
      const ended = await authRepository.revokeSession(tx, sid, "logout", now);
      if (!ended) return;
      await log(tx, meta, {
        sessionId: sid,
        action: "auth.logout",
      });
    });
  },

  /** E04. Ends every active sign-in, the caller's too; returns how many (BR-REC-35). */
  async logoutAll(actor: Actor, meta: RequestMeta, now: Date): Promise<number> {
    return db.transaction(async (tx) => {
      const signedOut = await authRepository.revokeActiveSessions(
        tx,
        actor.id,
        "logout_all",
        now,
      );
      await log(tx, meta, {
        sessionId: actor.sessionId,
        action: "auth.logout_all",
        after: { signedOut },
      });
      return signedOut;
    });
  },

  /**
   * E05. The access token was checked by signature in the middleware (BR-REC-33); `remember` and
   * `expiresAt` come from the sign-in row of its `sid`. A revoked row still answers: no revocation check.
   */
  async me(actor: Actor) {
    const session = await authRepository.findSessionById(actor.sessionId);
    if (!session || session.accountId !== actor.id) {
      throw new UnauthorizedError("Unauthorized");
    }
    return {
      username: actor.name,
      remember: session.remember,
      expiresAt: session.expiresAt,
    };
  },

  /**
   * E06. Locked -> 429 before the password is looked at. A wrong current password counts toward the
   * lock and is 400, never 401 (BR-REC-34). Success: new hash, every other sign-in ended
   * (`password_change`), this one kept, one log row.
   */
  async changePassword(
    actor: Actor,
    body: ChangePasswordBody,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const lock = await authRepository.readLock();
    if (lock && isLocked(lock, now)) throw lockedError(lock, now);

    const account = await authRepository.findAccountById(actor.id);
    if (!account) throw new UnauthorizedError("Unauthorized");

    if (!(await passwordMatches(body.currentPassword, account.passwordHash))) {
      const lockedMeanwhile = await db.transaction((tx) =>
        recordWrongTry(tx, actor.sessionId, meta, now),
      );
      if (lockedMeanwhile) throw lockedError(lockedMeanwhile, now);
      throw new BadRequestError(
        "Current password is not right",
        "CURRENT_PASSWORD_WRONG",
      );
    }

    const passwordHash = await hashPassword(body.newPassword);
    const lockedWhileChanging = await db.transaction(async (tx) => {
      const current = await authRepository.lockForUpdate(tx);
      if (isLocked(current, now)) return current;
      await authRepository.updatePassword(tx, account.id, passwordHash, now);
      await authRepository.revokeActiveSessions(
        tx,
        account.id,
        "password_change",
        now,
        actor.sessionId,
      );
      await log(tx, meta, {
        sessionId: actor.sessionId,
        action: "auth.password_changed",
      });
      return null;
    });
    if (lockedWhileChanging) throw lockedError(lockedWhileChanging, now);
  },

  // ─── `bootstrap-admin` (BR-REC-25, 26, 171): the script validates input, these do the work ───

  /** Creates the one login and the lock row; 409 when a login already exists (BR-REC-25). */
  async createAccount(
    input: { username: string; password: string },
    meta: RequestMeta,
    now: Date,
  ): Promise<{ username: string }> {
    const passwordHash = await hashPassword(input.password);
    return db.transaction(async (tx) => {
      await authRepository.ensureLockRow(tx);
      if (await authRepository.findTheAccount(tx)) {
        throw new ConflictError("A login already exists", "ACCOUNT_EXISTS");
      }
      const account = await authRepository.insertAccount(tx, {
        username: input.username.toLowerCase(),
        passwordHash,
        passwordChangedAt: now,
      });
      await log(tx, meta, {
        sessionId: null,
        action: "auth.account_created",
      });
      return { username: account.username };
    });
  },

  /** Sets a new password and ends every sign-in (`reset`, BR-REC-26); 404 when there is no login yet. */
  async resetPassword(
    password: string,
    meta: RequestMeta,
    now: Date,
  ): Promise<{ username: string; signedOut: number }> {
    const passwordHash = await hashPassword(password);
    return db.transaction(async (tx) => {
      const account = await authRepository.findTheAccount(tx);
      if (!account)
        throw new NotFoundError("No login exists yet", "NO_ACCOUNT");
      await authRepository.updatePassword(tx, account.id, passwordHash, now);
      const signedOut = await authRepository.revokeActiveSessions(
        tx,
        account.id,
        "reset",
        now,
      );
      await log(tx, meta, {
        sessionId: null,
        action: "auth.password_reset",
        after: { signedOut },
      });
      return { username: account.username, signedOut };
    });
  },

  /** Clears the lock counter and logs `auth.unlock` (BR-REC-171); harmless when nothing is locked. */
  async unlock(meta: RequestMeta, now: Date): Promise<{ wasLocked: boolean }> {
    return db.transaction(async (tx) => {
      const lock = await authRepository.lockForUpdate(tx);
      await authRepository.saveLock(tx, CLEAR_LOCK);
      await log(tx, meta, { sessionId: null, action: "auth.unlock" });
      return { wasLocked: isLocked(lock, now) };
    });
  },
};
