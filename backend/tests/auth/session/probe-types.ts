// Shared by `helpers.ts` (parent test process) and `probe.ts` (child process).
// Types and one constant only: importing this file never opens a database.

/** Printed by `probe.ts` right before its JSON result so log lines cannot confuse the parent. */
export const PROBE_MARKER = "@@AUTH-SESSION-PROBE-RESULT@@";

/** Error / success envelope of every API answer (`docs/specs/member-records/api-contract.md`). */
export type ApiBody = {
  success?: boolean;
  data?: Record<string, unknown>;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
};

/** One request the probe sends through a fresh `createApp()` in its own process. */
export type ProbeStep = {
  method?: string;
  path: string;
  body?: unknown;
  /** Cookies sent with this request (win over the jar). */
  cookies?: Record<string, string>;
  /** Also send every cookie the probe has been given so far (Set-Cookie of earlier steps). */
  useJar?: boolean;
  headers?: Record<string, string>;
  /** `undefined` = the app's own origin, `null` = send no Origin header. */
  origin?: string | null;
};

export type ProbeResult = {
  status: number;
  setCookie: string[];
  body: ApiBody | null;
};
