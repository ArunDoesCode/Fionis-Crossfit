import { z } from "zod";

import { emptyDataSchema, isoDateTimeSchema } from "./common.types";

// Owner: auth stream. Endpoints E01-E06 (api-contract.md). Cookies (`access_token`,
// `refresh_token`) are set/cleared by the handlers, not described by these schemas.

/** Longest username any input accepts (login form and `bootstrap-admin`). */
export const USERNAME_MAX_LENGTH = 64;
/** Password length rule, BR-REC-27 (8-128 characters, no other complexity rule). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * E01. `remember` is required: the Login page sends its tick-box (default ticked, BR-REC-31).
 * The caps keep a huge body away from the password hash; no valid password is longer.
 */
export const loginBodySchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  remember: z.boolean(),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

/** E01 and E05 `data`. */
export const sessionInfoSchema = z.object({
  username: z.string(),
  remember: z.boolean(),
  expiresAt: isoDateTimeSchema,
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/** E02 `data`. */
export const refreshResultSchema = z.object({ expiresAt: isoDateTimeSchema });
export type RefreshResult = z.infer<typeof refreshResultSchema>;

/** E03 `data` (cookies are cleared). */
export const logoutResultSchema = emptyDataSchema;

/** E04 `data`: how many sign-ins were ended, this one included. */
export const logoutAllResultSchema = z.object({
  signedOut: z.number().int().min(0),
});
export type LogoutAllResult = z.infer<typeof logoutAllResultSchema>;

/**
 * E06 body. A `newPassword` outside 8-128 characters is 400 `VALIDATION_ERROR`
 * with `details.issues[].path = ["newPassword"]` (BR-REC-02, 27). Lengths count
 * JavaScript string length. A wrong `currentPassword` is a different 400
 * (`CURRENT_PASSWORD_WRONG`), decided by the service.
 */
export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

/** E06 `data`. */
export const changePasswordResultSchema = emptyDataSchema;
