import type { ZodType } from "zod";

import type { PermissionKey } from "./permissions";

export type AuthRequirement =
  | { type: "public" }
  | { type: "any-authenticated" }
  | { type: "permission"; key: PermissionKey };

export type RouteDescriptor = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Full path including the `/api` base, with `:param` placeholders. */
  path: string;
  tags: string[];
  summary: string;
  auth: AuthRequirement;
  request?: {
    query?: ZodType;
    body?: ZodType;
    params?: ZodType;
  };
  /** Keyed by HTTP status code. */
  responses: Record<string, ZodType>;
  pagination?: {
    sortableFields: string[];
    searchable: boolean;
  };
  notes?: string[];
};

const registry = new Map<string, RouteDescriptor>();

/**
 * Registers a route descriptor for the API contract. Called once per route,
 * directly below the router definition. Throws on a duplicate method+path.
 */
export function register(descriptor: RouteDescriptor): void {
  const key = `${descriptor.method} ${descriptor.path}`;
  if (registry.has(key)) {
    throw new Error(`Route descriptor already registered for ${key}`);
  }
  registry.set(key, descriptor);
}

/** Returns all registered route descriptors, in registration order. */
export function getRegistry(): readonly RouteDescriptor[] {
  return Array.from(registry.values());
}
