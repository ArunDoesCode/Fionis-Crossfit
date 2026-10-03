import { db, type Tx } from "../../src/db/client";

/** Thrown on purpose to roll a test transaction back; never an assertion failure. */
export class Rollback extends Error {
  constructor() {
    super("rollback");
  }
}

/**
 * Runs `fn` in a transaction that is ALWAYS rolled back, so a schema test
 * leaves nothing behind. Assertion failures inside `fn` still propagate.
 */
export async function rolledBack<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return result as T;
}

function chain(error: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let current: unknown = error;
  for (let i = 0; i < 6 && current && typeof current === "object"; i++) {
    out.push(current as Record<string, unknown>);
    current = (current as { cause?: unknown }).cause;
  }
  return out;
}

/** The Postgres SQLSTATE and constraint name inside a (possibly wrapped) database error. */
export function pgErrorOf(error: unknown): {
  code: string | undefined;
  constraint: string | undefined;
} {
  let code: string | undefined;
  let constraint: string | undefined;
  for (const e of chain(error)) {
    if (!code && typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      code = e.code;
    }
    if (!constraint && typeof e.constraint_name === "string") {
      constraint = e.constraint_name;
    }
  }
  return { code, constraint };
}

export type DbOutcome =
  | { ok: true }
  | { ok: false; code: string | undefined; constraint: string | undefined };

/**
 * Runs one statement inside a savepoint of `tx` and always undoes it. Returns
 * `{ ok: false, code }` with the Postgres SQLSTATE when the database refused it
 * (23514 check, 23505 unique, 23503 foreign key, 22003 out of range ...).
 */
export async function attempt(
  tx: Tx,
  run: (sp: Tx) => Promise<unknown>,
): Promise<DbOutcome> {
  try {
    await tx.transaction(async (sp) => {
      await run(sp);
      throw new Rollback();
    });
  } catch (error) {
    if (error instanceof Rollback) return { ok: true };
    const { code, constraint } = pgErrorOf(error);
    return { ok: false, code, constraint };
  }
  return { ok: true };
}

export const PG = {
  checkViolation: "23514",
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  numericOutOfRange: "22003",
} as const;
