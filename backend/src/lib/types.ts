import type { Actor } from "./auth-middleware";

/** Hono environment shared by every router: what auth middleware puts on the context. */
export type AppEnv = {
  Variables: {
    actor: Actor;
  };
};

/**
 * Like `Partial<T>`, but each property also accepts an explicit `undefined`
 * (needed with `exactOptionalPropertyTypes` when update payloads are built from
 * Zod-inferred partial objects). The one shared helper — do not use `Partial<T>`.
 */
export type PartialUpdate<T> = {
  [K in keyof T]?: T[K] | undefined;
};
