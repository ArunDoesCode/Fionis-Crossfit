import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../lib/env";

// Prepared statements off: the app must also work behind a transaction-mode
// pooler (Supabase pooler URL in production).
const queryClient = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle({ client: queryClient });

export const connectDb = async () => {
  await queryClient`select 1`;
};

export const disconnectDb = async () => {
  await queryClient.end({ timeout: 5 });
};
