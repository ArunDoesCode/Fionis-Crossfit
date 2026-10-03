import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

import { env } from "./lib/env";
import { AppError } from "./lib/errors";
import { failure } from "./lib/http";
import { originCheck } from "./lib/origin-check";
import { dataResponseHeaders } from "./lib/response-headers";
import { serverTiming } from "./lib/server-timing";
import { mainRouter } from "./routes";
import { API_BASE_PATH } from "./routes/end-points";

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Builds the full Hono app (middleware, routes, error handler) without
 * connecting to the DB or listening on a port. `src/index.ts` serves it;
 * HTTP tests call `createApp().request(...)` to exercise the real stack.
 */
export function createApp() {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    if (env.NODE_ENV === "test") return;
    console.log(
      `${c.req.method} ${c.req.path} -> ${c.res.status} (${Date.now() - start}ms)`,
    );
  });

  app.use("*", serverTiming());
  app.use("*", dataResponseHeaders());

  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        failure(c, 413, "Request body too large", "PAYLOAD_TOO_LARGE"),
    }),
  );

  // Same origin (D-018, BR-REC-36): no CORS. A write must come from the app's own address (BR-REC-37).
  app.use("*", originCheck([env.APP_ORIGIN, ...env.APP_ORIGINS_EXTRA]));

  app.route(API_BASE_PATH, mainRouter);

  app.notFound((c) => failure(c, 404, "Not found", "NOT_FOUND"));

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return failure(
        c,
        error.statusCode as Parameters<typeof failure>[1],
        error.message,
        error.code,
        error.details,
      );
    }

    if (error instanceof ZodError) {
      return failure(c, 400, "Validation failed", "VALIDATION_ERROR", {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (error instanceof HTTPException) {
      return failure(c, error.status, error.message);
    }

    console.error(`Unhandled error: ${c.req.method} ${c.req.path}`, error);
    return failure(c, 500, "Internal server error", "INTERNAL_ERROR");
  });

  return app;
}
