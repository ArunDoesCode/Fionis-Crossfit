import type { Db, Tx } from "../db/client";

// STUB (Stream 0 / S1): types, signatures and docs only. S3 builds the bodies.

/** What `writeAudit` writes into `audit_log` (BR-REC-158, 43). */
export type AuditEntry = {
  /** the actor's `sessionId`; null for a server command or a failed sign-in */
  sessionId: string | null;
  /** 'member.update', 'auth.login_failed', 'auth.unlock', ... */
  action: string;
  entity?: string;
  entityId?: string;
  /** changed fields only (see `diffChangedFields`); never passwords or tokens */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  /** "Chrome on Android", at most 60 characters */
  device?: string | null;
};

/** A transaction handle (normal case: every write runs in one) or the shared client. */
export type AuditExecutor = Tx | Db;

/** Field names (case-insensitive substring) whose values are never stored in the change log. */
export const AUDIT_REDACTED_FIELD_PATTERN = /password|token|secret|hash/i;

/**
 * Inserts exactly one `audit_log` row using `executor`, so it commits or rolls
 * back together with the write it describes (BR-REC-158). Fields matching
 * `AUDIT_REDACTED_FIELD_PATTERN` are removed from `before` / `after` first.
 * Not implemented yet.
 */
export async function writeAudit(
  _executor: AuditExecutor,
  _entry: AuditEntry,
): Promise<void> {
  throw new Error("not implemented");
}

/**
 * Compares two snapshots and returns only the fields whose value changed,
 * as `{ before, after }` with the same keys in both; `null` when nothing
 * changed. A `null` snapshot (create / delete) counts every field of the other
 * one as changed. Redacted fields (`AUDIT_REDACTED_FIELD_PATTERN`) are never
 * returned. Pure. Not implemented yet.
 */
export function diffChangedFields(
  _before: Record<string, unknown> | null,
  _after: Record<string, unknown> | null,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  throw new Error("not implemented");
}
