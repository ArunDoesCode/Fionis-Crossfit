import { isApiError } from '@/lib/api/errors';
import { messageForCode } from '@/lib/messages/errors';
import { FIXED_LINES } from '@/lib/messages/words';

// Login-only sentences. Neither says which part was wrong (BR-REC-01).
export const INVALID_CREDENTIALS_LINE = 'That username or password is not right.';
/** Shown on Login after a refresh failed or the sign-in ended (BR-REC-41). */
export const SIGN_IN_AGAIN_LINE = 'Please sign in again.';
/** Next to "Current password" when E06 answers 400 CURRENT_PASSWORD_WRONG (BR-REC-34). */
export const CURRENT_PASSWORD_WRONG_LINE = 'Current password is not right';

/** Minutes left on the lock from `details.retryAfterSeconds`, rounded up; null when the answer has none. */
function lockMinutes(err: unknown): number | null {
  if (!isApiError(err)) return null;
  const details = (err.body as { details?: { retryAfterSeconds?: unknown } } | null | undefined)
    ?.details;
  const seconds = details?.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return Math.max(1, Math.ceil(seconds / 60));
}

/** The lock sentence (BR-REC-29) for a 429 LOGIN_LOCKED, or null for any other error. */
export function lockedMessage(err: unknown): string | null {
  if (!isApiError(err) || err.status !== 429 || err.code !== 'LOGIN_LOCKED') return null;
  const minutes = lockMinutes(err);
  return minutes === null ? messageForCode(err.code) : FIXED_LINES.signInLocked(minutes);
}

/** The one line under the Login form for a failed sign-in (BR-REC-01, 29). */
export function loginErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 401) return INVALID_CREDENTIALS_LINE;
    const locked = lockedMessage(err);
    if (locked) return locked;
    return messageForCode(err.code);
  }
  return messageForCode(undefined);
}

/** The line for a failed password change (E06): wrong current password, a lock, or the dictionary's text. */
export function changePasswordErrorMessage(err: unknown): string {
  if (isApiError(err) && err.code === 'CURRENT_PASSWORD_WRONG') return CURRENT_PASSWORD_WRONG_LINE;
  return lockedMessage(err) ?? messageForCode(isApiError(err) ? err.code : undefined);
}
