// Single source of endpoint paths (relative to the API base URL, which already ends in /api).
// Never hardcode paths elsewhere, including EventSource URLs.
// AUTH paths are placeholders from the standard; align them with the backend contract when auth lands.
export const API_ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
} as const;
