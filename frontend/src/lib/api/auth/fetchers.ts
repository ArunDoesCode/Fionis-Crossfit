import { api } from '@/lib/api/client';
import { API_ROUTES } from '@/lib/api/routes';
import type { ChangePasswordInput, LoginInput } from '@/lib/validators/auth';
import type { operations } from '@/types/api.generated';

type Body<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Ok<Name extends keyof operations> = operations[Name] extends {
  responses: { 200: infer R };
}
  ? Body<R>
  : never;

export type SessionInfo = Ok<'postApiAuthLogin'>['data'];
export type LogoutAllResult = Ok<'postApiAuthLogout-all'>['data'];

// Success is `{ success: true, data }`; the fetchers hand back `data`. Failures throw ApiError.
export async function login(input: LoginInput): Promise<SessionInfo> {
  const res = await api.post<Ok<'postApiAuthLogin'>, LoginInput>(API_ROUTES.AUTH.LOGIN, input);
  return res.data;
}

export async function getMe(): Promise<SessionInfo> {
  const res = await api.get<Ok<'getApiAuthMe'>>(API_ROUTES.AUTH.ME);
  return res.data;
}

export async function logout(): Promise<void> {
  await api.post<Ok<'postApiAuthLogout'>>(API_ROUTES.AUTH.LOGOUT);
}

export async function logoutAll(): Promise<LogoutAllResult> {
  const res = await api.post<Ok<'postApiAuthLogout-all'>>(API_ROUTES.AUTH.LOGOUT_ALL);
  return res.data;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.post<Ok<'postApiAuthPassword'>, ChangePasswordInput>(
    API_ROUTES.AUTH.CHANGE_PASSWORD,
    input,
  );
}
