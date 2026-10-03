import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { SESSION_REVOKE_REASONS } from "../../lib/enums";
import { createdAt, inList, moment, updatedAt } from "./helpers";

/** The one shared login (D-012). Rules: docs/specs/member-records/auth.md */
export const appAccount = pgTable(
  "app_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** stored lower-case */
    username: text("username").notNull().unique(),
    /** argon2id via Bun.password (BR-REC-27) */
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: moment("password_changed_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    // Exactly one login account can exist (BR-REC-168): every row has the same index key.
    uniqueIndex("app_account_one_row").on(sql`(true)`),
  ],
);

/** One row per signed-in device. The refresh token is stored only as an HMAC. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => appAccount.id, { onDelete: "cascade" }),
    /** HMAC-SHA256(REFRESH_TOKEN_SECRET, refresh token) */
    tokenHash: text("token_hash").notNull().unique(),
    /** previous token, valid for a 60 s grace (BR-REC-32) */
    prevTokenHash: text("prev_token_hash"),
    rotatedAt: moment("rotated_at"),
    remember: boolean("remember").notNull(),
    /** remember: last use + 7 days; else 12 h cap (BR-REC-31) */
    expiresAt: moment("expires_at").notNull(),
    lastUsedAt: moment("last_used_at").notNull(),
    revokedAt: moment("revoked_at"),
    revokeReason: text("revoke_reason"),
    ip: text("ip"),
    device: text("device"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "auth_sessions_revoke_reason_check",
      inList(t.revokeReason, SESSION_REVOKE_REASONS),
    ),
    index("auth_sessions_prev_token_hash_idx").on(t.prevTokenHash),
    index("auth_sessions_account_active_idx")
      .on(t.accountId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

/**
 * ONE row: the sign-in lock is global (auth Q1 = B, BR-REC-28). The row is
 * created by `bun run seed`; the lock code resets it, never deletes it.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: smallint("id").primaryKey().default(1),
    failedCount: smallint("failed_count").notNull().default(0),
    windowStartedAt: moment("window_started_at"),
    lockedUntil: moment("locked_until"),
    updatedAt: updatedAt(),
  },
  (t) => [check("login_attempts_single_row_check", sql`${t.id} = 1`)],
);
