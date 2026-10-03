import { createApp } from "./app";
import { connectDb, disconnectDb } from "./db/client";
import { env } from "./lib/env";
import { pruneIdempotencyKeys } from "./lib/idempotency";

const app = createApp();

/** Idempotency keys older than 48 h are useless (BR-REC-165); sweep them hourly. */
const PRUNE_EVERY_MS = 60 * 60 * 1000;

const pruneKeys = async () => {
  try {
    const removed = await pruneIdempotencyKeys(new Date());
    if (removed > 0) console.log(`Pruned ${removed} idempotency key(s)`);
  } catch (error) {
    console.error("Pruning idempotency keys failed", error);
  }
};

const startServer = async () => {
  await connectDb();
  console.log("Database connected");

  await pruneKeys();
  const pruneTimer = setInterval(() => void pruneKeys(), PRUNE_EVERY_MS);

  const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
  console.log(`Backend listening on ${server.url}`);

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`${signal} received, shutting down...`);
    clearInterval(pruneTimer);
    try {
      await server.stop();
      await disconnectDb();
      process.exit(0);
    } catch (error) {
      console.error("Shutdown failed", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
