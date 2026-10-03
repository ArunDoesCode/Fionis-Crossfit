import type { Context } from "hono";

import { readAccessToken } from "../lib/auth-middleware";
import {
  clearAuthCookies,
  clientAddress,
  deviceLabel,
  ok,
  readJsonBody,
  readRefreshCookie,
  setAccessCookie,
  setRefreshCookie,
} from "../lib/http";
import type { AppEnv } from "../lib/types";
import { authService } from "../service/authService";
import {
  changePasswordBodySchema,
  loginBodySchema,
  type RequestMeta,
} from "../types/auth.types";

type AuthContext = Context<AppEnv>;

/** Address and device of the request, for the sign-in row and the change log (BR-REC-43). */
const requestMeta = (c: AuthContext): RequestMeta => ({
  ip: clientAddress(c),
  device: deviceLabel(c.req.header("user-agent")),
});

export const authController = {
  /** E01 */
  async login(c: AuthContext) {
    const body = loginBodySchema.parse(await readJsonBody(c));
    const result = await authService.login(body, requestMeta(c), new Date());
    setAccessCookie(c, result.accessToken);
    setRefreshCookie(c, result.refreshToken, result.remember);
    return ok(c, {
      username: result.username,
      remember: result.remember,
      expiresAt: result.expiresAt.toISOString(),
    });
  },

  /** E02 */
  async refresh(c: AuthContext) {
    const result = await authService.refresh(
      readRefreshCookie(c),
      requestMeta(c),
      new Date(),
    );
    setAccessCookie(c, result.accessToken);
    setRefreshCookie(c, result.refreshToken, result.remember);
    return ok(c, { expiresAt: result.expiresAt.toISOString() });
  },

  /** E03 (public: it must work with an expired access token) */
  async logout(c: AuthContext) {
    await authService.logout(
      { refreshToken: readRefreshCookie(c), accessToken: readAccessToken(c) },
      requestMeta(c),
      new Date(),
    );
    clearAuthCookies(c);
    return ok(c, {});
  },

  /** E04 */
  async logoutAll(c: AuthContext) {
    const signedOut = await authService.logoutAll(
      c.get("actor"),
      requestMeta(c),
      new Date(),
    );
    clearAuthCookies(c);
    return ok(c, { signedOut });
  },

  /** E05 */
  async me(c: AuthContext) {
    const view = await authService.me(c.get("actor"));
    return ok(c, {
      username: view.username,
      remember: view.remember,
      expiresAt: view.expiresAt.toISOString(),
    });
  },

  /** E06 */
  async changePassword(c: AuthContext) {
    const body = changePasswordBodySchema.parse(await readJsonBody(c));
    await authService.changePassword(
      c.get("actor"),
      body,
      requestMeta(c),
      new Date(),
    );
    return ok(c, {});
  },
};
