/**
 * Single source of truth for every route path. Paths are relative to their
 * feature router; the feature router is mounted at `MAIN_ROUTES[feature]`
 * under `API_BASE_PATH`. Add the constant here first, then use it.
 *
 * member-records: the feature routers (one per owner stream) share URL
 * prefixes (`/members/:memberId/...` belongs to members, assessments, due-list
 * and progress), so those routers are mounted at the root ("") and own their
 * full sub-paths. A path is keyed by resource, not by action: `collection`
 * serves both the list (GET) and the create (POST).
 */
export const API_BASE_PATH = "/api";

export const MAIN_ROUTES = {
  health: "/health",
  auth: "/auth",
  setup: "",
  members: "",
  assessments: "",
  due: "",
  progress: "",
  vitals: "/vitals",
} as const;

export const END_POINTS = {
  health: {
    check: "/",
  },
  // E01-E06
  auth: {
    login: "/login",
    refresh: "/refresh",
    logout: "/logout",
    logoutAll: "/logout-all",
    me: "/me",
    password: "/password",
  },
  // E07-E15
  setup: {
    settings: "/settings",
    types: "/assessment-types",
    typeOrder: "/assessment-types/order",
    type: "/assessment-types/:typeId",
    typeMetrics: "/assessment-types/:typeId/metrics",
    typeMetricOrder: "/assessment-types/:typeId/metric-order",
    metric: "/metrics/:metricId",
  },
  // E16-E24
  members: {
    collection: "/members",
    item: "/members/:memberId",
    archive: "/members/:memberId/archive",
    restore: "/members/:memberId/restore",
    periods: "/members/:memberId/periods",
    period: "/members/:memberId/periods/:periodId",
    ending: "/memberships/ending",
  },
  // E25-E30
  assessments: {
    entryForm: "/members/:memberId/entry-form",
    collection: "/assessments",
    item: "/assessments/:assessmentId",
  },
  // E31-E34
  due: {
    collection: "/due",
    memberDue: "/members/:memberId/due",
    memberDueAction: "/members/:memberId/due-actions/:typeId",
  },
  // E35-E39
  progress: {
    reportCard: "/members/:memberId/report-card",
    progress: "/reports/progress",
    leaderboard: "/reports/leaderboard",
    activeByPlan: "/reports/active-by-plan",
    export: "/exports/:file",
  },
  // E40
  vitals: {
    collect: "/",
  },
} as const;

/** Full contract path: `/api` + the feature mount + the sub-path (`/` = the mount itself). */
export function apiPath(mount: string, sub: string): string {
  return `${API_BASE_PATH}${mount}${sub === "/" ? "" : sub}`;
}
