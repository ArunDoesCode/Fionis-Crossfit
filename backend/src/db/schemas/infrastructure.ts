import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, moment } from "./helpers";

/** Change log (BR-REC-158): one row per write, in the same transaction as the write. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    at: moment("at").notNull().defaultNow(),
    /** null = server command or failed sign-in */
    sessionId: uuid("session_id"),
    /** 'member.update', 'auth.login_failed', 'auth.unlock', ... */
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    /** changed fields only; never passwords or tokens */
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    ip: text("ip"),
    /** "Chrome on Android", max 60 chars */
    device: text("device"),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId, t.at.desc()),
    index("audit_log_at_idx").on(t.at.desc()),
  ],
);

/** Replay store for E17 / E22 (BR-REC-156). Pruned after 48 h (BR-REC-165). */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    sessionId: uuid("session_id").notNull(),
    key: uuid("key").notNull(),
    endpoint: text("endpoint").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    response: jsonb("response").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.key] })],
);
