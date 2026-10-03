/**
 * Single source of truth for every route path. Paths are relative to their
 * feature router; the feature router is mounted at `MAIN_ROUTES[feature]`
 * under `API_BASE_PATH`. Add the constant here first, then use it.
 */
export const API_BASE_PATH = "/api";

export const MAIN_ROUTES = {
  health: "/health",
} as const;

export const END_POINTS = {
  health: {
    check: "/",
  },
} as const;
