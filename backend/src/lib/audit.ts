import type { Db, Tx } from "../db/client";
import { auditLog } from "../db/schemas";

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

const DEVICE_MAX_LENGTH = 60;

type Snapshot = Record<string, unknown>;

/** A copy of `value` without any field whose name is redacted, at every depth. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Snapshot = {};
    for (const [key, field] of Object.entries(value as Snapshot)) {
      if (!AUDIT_REDACTED_FIELD_PATTERN.test(key)) out[key] = redact(field);
    }
    return out;
  }
  return value;
}

/** Deep equality for what a snapshot can hold; `undefined` and `null` count as the same "nothing". */
function sameValue(a: unknown, b: unknown): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left === right) return true;
  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, i) => sameValue(item, right[i]))
    );
  }
  if (
    typeof left === "object" &&
    typeof right === "object" &&
    left !== null &&
    right !== null
  ) {
    const l = left as Snapshot;
    const r = right as Snapshot;
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    return [...keys].every((key) => sameValue(l[key], r[key]));
  }
  return false;
}

/**
 * Inserts exactly one `audit_log` row using `executor`, so it commits or rolls
 * back together with the write it describes (BR-REC-158). Fields matching
 * `AUDIT_REDACTED_FIELD_PATTERN` are removed from `before` / `after` first.
 */
export async function writeAudit(
  executor: AuditExecutor,
  entry: AuditEntry,
): Promise<void> {
  await executor.insert(auditLog).values({
    sessionId: entry.sessionId,
    action: entry.action,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    before: entry.before ? (redact(entry.before) as Snapshot) : null,
    after: entry.after ? (redact(entry.after) as Snapshot) : null,
    ip: entry.ip ?? null,
    device: entry.device ? entry.device.slice(0, DEVICE_MAX_LENGTH) : null,
  });
}

/**
 * Compares two snapshots and returns only the fields whose value changed,
 * as `{ before, after }` with the same keys in both; `null` when nothing
 * changed. A `null` snapshot (create / delete) counts every field of the other
 * one as changed. Redacted fields (`AUDIT_REDACTED_FIELD_PATTERN`) are never
 * returned. Pure.
 */
export function diffChangedFields(
  before: Snapshot | null,
  after: Snapshot | null,
): { before: Snapshot; after: Snapshot } | null {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changedBefore: Snapshot = {};
  const changedAfter: Snapshot = {};
  for (const key of keys) {
    if (AUDIT_REDACTED_FIELD_PATTERN.test(key)) continue;
    const wholeRow = before === null || after === null;
    if (!wholeRow && sameValue(before[key], after[key])) continue;
    changedBefore[key] = before?.[key] ?? null;
    changedAfter[key] = after?.[key] ?? null;
  }
  return Object.keys(changedAfter).length === 0
    ? null
    : { before: changedBefore, after: changedAfter };
}
