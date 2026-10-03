import type { MiddlewareHandler } from "hono";
import type { ZodType } from "zod";

import { readJsonBody } from "./http";
import type { AppEnv } from "./types";

export type ValidationTarget = "param" | "query" | "json";

/**
 * Validates one part of the request against a Zod schema before the handler
 * runs. A failure is thrown as a `ZodError`, which the global error handler
 * answers as 400 `VALIDATION_ERROR` (an unparsable JSON body is 400
 * `INVALID_JSON`). The handler still parses with the same schema to get the
 * typed value (controllers parse; this guard guarantees the 400 comes first).
 */
export function validate(
  target: ValidationTarget,
  schema: ZodType,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const input =
      target === "param"
        ? c.req.param()
        : target === "query"
          ? c.req.query()
          : await readJsonBody(c);
    schema.parse(input);
    await next();
  };
}
