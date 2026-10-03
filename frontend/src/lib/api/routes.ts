// Single source of endpoint paths (relative to the API base URL, which already ends in /api).
// Never hardcode paths elsewhere, including EventSource URLs.
// One leaf per route in backend/.contracts/api-manifest.json (E01–E40 + health); `:param` placeholders are
// spelled exactly as there. Fill them with `apiPath`. Methods are the caller's: leaves that share a path
// (e.g. MEMBERS.LIST and MEMBERS.CREATE) differ only by HTTP method.
export const API_ROUTES = {
  HEALTH: {
    CHECK: '/health',
  },
  AUTH: {
    LOGIN: '/auth/login', // E01 POST
    REFRESH: '/auth/refresh', // E02 POST
    LOGOUT: '/auth/logout', // E03 POST
    LOGOUT_ALL: '/auth/logout-all', // E04 POST
    ME: '/auth/me', // E05 GET
    CHANGE_PASSWORD: '/auth/password', // E06 POST
  },
  SETTINGS: {
    GET: '/settings', // E07 GET
    UPDATE: '/settings', // E08 PATCH
  },
  ASSESSMENT_TYPES: {
    LIST: '/assessment-types', // E09 GET
    CREATE: '/assessment-types', // E10 POST
    UPDATE: '/assessment-types/:typeId', // E11 PATCH
    ORDER: '/assessment-types/order', // E12 PUT
    METRICS: '/assessment-types/:typeId/metrics', // E13 POST
    METRIC_ORDER: '/assessment-types/:typeId/metric-order', // E15 PUT
  },
  METRICS: {
    UPDATE: '/metrics/:metricId', // E14 PATCH
  },
  MEMBERS: {
    LIST: '/members', // E16 GET
    CREATE: '/members', // E17 POST
    DETAIL: '/members/:memberId', // E18 GET
    UPDATE: '/members/:memberId', // E19 PATCH
    ARCHIVE: '/members/:memberId/archive', // E20 POST
    RESTORE: '/members/:memberId/restore', // E21 POST
    PERIODS: '/members/:memberId/periods', // E22 POST
    PERIOD: '/members/:memberId/periods/:periodId', // E23 PATCH
    ENTRY_FORM: '/members/:memberId/entry-form', // E25 GET
    DUE: '/members/:memberId/due', // E32 GET
    DUE_ACTION: '/members/:memberId/due-actions/:typeId', // E33 PUT, E34 DELETE
    REPORT_CARD: '/members/:memberId/report-card', // E35 GET
  },
  MEMBERSHIPS: {
    ENDING: '/memberships/ending', // E24 GET
  },
  ASSESSMENTS: {
    LIST: '/assessments', // E27 GET
    SAVE: '/assessments', // E26 POST
    DETAIL: '/assessments/:assessmentId', // E28 GET, E29 PATCH, E30 DELETE
  },
  DUE: {
    LIST: '/due', // E31 GET
  },
  REPORTS: {
    PROGRESS: '/reports/progress', // E36 GET
    LEADERBOARD: '/reports/leaderboard', // E37 GET
    ACTIVE_BY_PLAN: '/reports/active-by-plan', // E38 GET
  },
  EXPORTS: {
    FILE: '/exports/:file', // E39 GET
  },
  VITALS: {
    REPORT: '/vitals', // E40 POST
  },
} as const;

type PathParamNames<Template extends string> = Template extends `${string}:${infer Rest}`
  ? Rest extends `${infer Name}/${infer After}`
    ? Name | PathParamNames<`/${After}`>
    : Rest
  : never;

type PathParams<Template extends string> = [PathParamNames<Template>] extends [never]
  ? []
  : [params: Record<PathParamNames<Template>, string | number>];

/**
 * Fills the `:param` placeholders of a path template, URL-encoding each value.
 * `apiPath(API_ROUTES.MEMBERS.DETAIL, { memberId })` → `/members/<id>`. A missing value throws.
 */
export const apiPath = <Template extends string>(
  template: Template,
  ...[params]: PathParams<Template>
): string =>
  template.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_placeholder, name: string) => {
    const value = (params as Record<string, string | number> | undefined)?.[name];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(String(value));
  });
