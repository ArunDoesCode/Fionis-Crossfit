import type { Handler, Hono, MiddlewareHandler } from "hono";

import { requireAuth, requirePermission } from "../lib/auth-middleware";
import { NotImplementedError } from "../lib/errors";
import {
  type AuthRequirement,
  type RouteDescriptor,
  register,
} from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import { validate } from "../lib/validate";
import { apiPath } from "./end-points";

/** Route needs no sign-in (member-records: E01-E03 and health only, BR-REC-159). */
export const PUBLIC = { type: "public" } as const satisfies AuthRequirement;

/** Route needs the shared login; no permission keys yet (BR-REC-159). */
export const ANY_AUTHENTICATED = {
  type: "any-authenticated",
} as const satisfies AuthRequirement;

/**
 * Placeholder handler (D-019): answers 501 `NOT_IMPLEMENTED` until the owning
 * stream replaces it with a real controller. Auth and request validation have
 * already run by then, so a bad request is still a 400 and a missing sign-in a 401.
 */
export const notImplemented: Handler<AppEnv> = async () => {
  throw new NotImplementedError();
};

export type RouteSpec = Omit<RouteDescriptor, "path">;

/**
 * Binds a feature router to its mount path and returns `route(sub, spec,
 * handler, extra?)`, which does the three things that must never drift apart:
 *  1. registers the descriptor in the route registry (the API contract),
 *  2. adds the auth guard the descriptor declares (`auth`),
 *  3. adds request validation for the schemas the descriptor declares (`request`),
 * then `extra` middleware (idempotency, ETag), then the handler.
 * `sub` comes from `END_POINTS[feature]`; the contract path is `apiPath(mount, sub)`.
 */
export function routeMounter(router: Hono<AppEnv>, mount: string) {
  return (
    sub: string,
    spec: RouteSpec,
    handler: Handler<AppEnv>,
    extra: readonly MiddlewareHandler<AppEnv>[] = [],
  ): void => {
    const guards: MiddlewareHandler<AppEnv>[] = [];
    if (spec.auth.type === "any-authenticated") guards.push(requireAuth);
    if (spec.auth.type === "permission") {
      guards.push(requirePermission(spec.auth.key));
    }
    if (spec.request?.params)
      guards.push(validate("param", spec.request.params));
    if (spec.request?.query) guards.push(validate("query", spec.request.query));
    if (spec.request?.body) guards.push(validate("json", spec.request.body));

    router.on(spec.method, [sub], ...guards, ...extra, handler);
    register({ ...spec, path: apiPath(mount, sub) });
  };
}
