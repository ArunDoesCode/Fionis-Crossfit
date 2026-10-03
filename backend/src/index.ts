import { createApp } from "./app";
import { connectDb, disconnectDb } from "./db/client";
import { env } from "./lib/env";

const app = createApp();

const startServer = async () => {
  await connectDb();
  console.log("Database connected");

  const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
  console.log(`Backend listening on ${server.url}`);

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`${signal} received, shutting down...`);
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
