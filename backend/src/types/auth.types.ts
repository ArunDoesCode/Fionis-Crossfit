import { z } from "zod";

import { emptyDataSchema, isoDateTimeSchema } from "./common.types";

// Owner: auth stream. Endpoints E01-E06 (api-contract.md). Cookies (`access_token`,
// `refresh_token`) are set/cleared by the handlers, not described by these schemas.

/** E01. `remember` is required: the Login page sends its tick-box (default ticked, BR-REC-31). */
export const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
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

/** E06 body. Length rules (8-128, BR-REC-02/27) belong to the auth stream. */
export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

/** E06 `data`. */
export const changePasswordResultSchema = emptyDataSchema;
