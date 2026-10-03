import { eq } from "drizzle-orm";

import { db } from "../../src/db/client";
import { appAccount, authSessions } from "../../src/db/schemas";
import { signAccessToken } from "../../src/lib/token";

/** The one fake account this helper creates when the test DB has none (`app_account` holds at most one row). */
const TEST_USERNAME = "test_foundation_session";

export type SignedInSession = {
  /** access token whose `sid` is a real, active `auth_sessions` row */
  token: string;
  sessionId: string;
  accountId: string;
  /** Removes the session row, and the account only if this helper created it. Safe to call twice. */
  cleanup: () => Promise<void>;
};

/**
 * A signed-in state that exists in the database: an `app_account` row (reused if the test
 * DB already has one, else a `TEST_` one) plus a fresh active `auth_sessions` row.
 * Endpoints that read the session row (E05 `/auth/me`) need this; a token minted for a made-up
 * session id only proves the signature.
 */
export async function createSignedInSession(): Promise<SignedInSession> {
  let [account] = await db.select().from(appAccount).limit(1);
  let createdAccount = false;
  if (!account) {
    await db
      .insert(appAccount)
      .values({
        username: TEST_USERNAME,
        passwordHash: "TEST_foundation_not_a_real_hash",
        passwordChangedAt: new Date(Date.now() - 24 * 3_600_000),
      })
      .onConflictDoNothing();
    [account] = await db.select().from(appAccount).limit(1);
    createdAccount = account?.username === TEST_USERNAME;
  }
  if (!account) throw new Error("could not create or find an app_account");

  const sessionId = crypto.randomUUID();
  const now = new Date();
  await db.insert(authSessions).values({
    id: sessionId,
    accountId: account.id,
    tokenHash: `TEST_foundation_${crypto.randomUUID()}`,
    remember: false,
    expiresAt: new Date(now.getTime() + 3_600_000),
    lastUsedAt: now,
  });

  const token = await signAccessToken({
    userId: account.id,
    userName: account.username,
    permissions: [],
    sid: sessionId,
  });
  const accountId = account.id;

  return {
    token,
    sessionId,
    accountId,
    cleanup: async () => {
      await db.delete(authSessions).where(eq(authSessions.id, sessionId));
      if (createdAccount) {
        await db.delete(appAccount).where(eq(appAccount.id, accountId));
      }
    },
  };
}
