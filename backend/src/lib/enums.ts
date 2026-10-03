/**
 * One `as const` list + one union per enum-like value set (BR-REC-175).
 * The Drizzle `check` constraints (`db/schemas/*`) and the Zod schemas
 * (`types/*.types.ts`) are both built from these lists, so the database, the
 * API and the TypeScript unions can never drift apart. Never use `pgEnum`.
 *
 * Values are stored and sent exactly as written here (snake_case). API-only
 * unions (membership status filter, due state, age band, export file, ...) live
 * in the owning `types/*.types.ts`; `MEMBERSHIP_STATUSES` is here because the
 * pure domain code and the API both return it.
 */

/** Membership plan (members.membership_periods.plan). */
export const PLANS = ["monthly", "quarterly", "half_annual", "annual"] as const;
export type Plan = (typeof PLANS)[number];

/** Member sex (members.sex). */
export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

/** Member goal (members.objective, optional). */
export const OBJECTIVES = [
  "fat_loss",
  "strength",
  "general_fitness",
  "other",
] as const;
export type Objective = (typeof OBJECTIVES)[number];

/** Metric value kind (metrics.datatype). `duration` = whole seconds. */
export const DATATYPES = ["number", "duration"] as const;
export type Datatype = (typeof DATATYPES)[number];

/** Which direction is better (metrics.better). `none` = "No direction". */
export const BETTER_DIRECTIONS = ["higher", "lower", "none"] as const;
export type BetterDirection = (typeof BETTER_DIRECTIONS)[number];

/** Repeat interval unit (assessment_types.interval_unit, metrics.interval_unit). */
export const INTERVAL_UNITS = ["week", "month"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

/** Report-table body part (metrics.table_part). */
export const TABLE_PARTS = ["whole_body", "arms", "trunk", "legs"] as const;
export type TablePart = (typeof TABLE_PARTS)[number];

/** Due-list override kind (due_overrides.kind). */
export const DUE_OVERRIDE_KINDS = ["flag", "snooze"] as const;
export type DueOverrideKind = (typeof DUE_OVERRIDE_KINDS)[number];

/** Why a sign-in ended (auth_sessions.revoke_reason). */
export const SESSION_REVOKE_REASONS = [
  "logout",
  "logout_all",
  "password_change",
  "reuse",
  "reset",
  "expired",
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

/** Derived membership state (BR-REC-52). Never stored; computed from dates. */
export const MEMBERSHIP_STATUSES = ["active", "expiring", "expired"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
