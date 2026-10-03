import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, timestamp } from "drizzle-orm/pg-core";

/**
 * `column in ('a', 'b', ...)` for a `check` constraint, built from one of the
 * `as const` lists in `lib/enums.ts` (BR-REC-175: text + check, never pgEnum).
 * A NULL column passes the check, so nullable enum-like columns need no extra
 * clause. Values come from our own constants, never from user input.
 */
export function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  const literals = values.map((v) => sql.raw(`'${v.replaceAll("'", "''")}'`));
  return sql`${column} in (${sql.join(literals, sql.raw(", "))})`;
}

/**
 * A plain column written as an expression, for indexes that also contain an
 * expression. drizzle-kit push reads every column of such an index back as an
 * expression, so a plain column there makes it drop and re-create the index on
 * every run. The resulting index is identical.
 */
export function asExpression(column: AnyPgColumn): SQL {
  return sql`${column}`;
}

/** `timestamptz` moment (BR-REC-163). Calendar days use `date({ mode: "string" })`. */
export const moment = (column: string) =>
  timestamp(column, { withTimezone: true });

/** `created_at timestamptz not null default now()`. */
export const createdAt = () => moment("created_at").notNull().defaultNow();

/** `updated_at timestamptz not null default now()`, refreshed by Drizzle updates. */
export const updatedAt = () =>
  moment("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
