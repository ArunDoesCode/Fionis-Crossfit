import { QueryPromise } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../lib/env";
import { measureDb } from "../lib/server-timing";

// Server-Timing `db` (BR-REC-161): every Drizzle query is a `QueryPromise` that
// runs when it is awaited, so timing that one `then` measures all of them
// (select/insert/update/delete, `db.execute`, queries inside a transaction)
// without each repository calling `measureDb`. Outside a request it just runs.
// Raw `queryClient` calls and BEGIN/COMMIT are not counted.
const drizzleThen = QueryPromise.prototype.then;
// biome-ignore lint/suspicious/noThenProperty: replacing Drizzle's own `then` on purpose (see above)
QueryPromise.prototype.then = function (onFulfilled, onRejected) {
  return measureDb(() => drizzleThen.call(this)).then(onFulfilled, onRejected);
};

// Prepared statements off: the app must also work behind a transaction-mode
// pooler (Supabase pooler URL in production).
// One server process (D-018): a small fixed pool is enough, and idle connections are
// released after 30 s so a pooler / free-tier DB is not held open.
const queryClient = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle({ client: queryClient });

export const connectDb = async () => {
  await queryClient`select 1`;
};

export const disconnectDb = async () => {
  await queryClient.end({ timeout: 5 });
};

/** The shared client, and the handle a service gets inside `db.transaction(async (tx) => ...)`. */
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
