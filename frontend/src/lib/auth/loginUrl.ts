export const LOGIN_PATH = '/login';
/** `?reason=expired` makes Login say "Please sign in again" (BR-REC-41). */
export const SESSION_ENDED_REASON = 'expired';

/** The Login address, optionally with the page to come back to and the "sign in again" flag. */
export function loginPath(options: { next?: string; expired?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (options.next) params.set('next', options.next);
  if (options.expired) params.set('reason', SESSION_ENDED_REASON);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}
