import { type NextRequest, NextResponse } from 'next/server';
import { API_ROUTES } from '@/lib/api/routes';
import { LOGIN_PATH, loginPath, SESSION_ENDED_REASON } from '@/lib/auth/loginUrl';
import { safeNextPath } from '@/lib/auth/safeNextPath';
import { getServerEnv } from '@/lib/envServer';

// Page guard (BR-REC-01, 39, 40, 42). Cookie names and attributes: backend contract (BR-REC-30).
// Optimistic: it reads cookie presence, never a token; the API stays the authoritative check.
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const HOME = '/admin';
const REFRESH_TIMEOUT_MS = 5_000;
// Passed to the API unchanged so it rate-limits and logs the visitor, not the Next server (BR-REC-38, 43).
const VISITOR_HEADERS = ['x-forwarded-for', 'user-agent'] as const;

const hasCookie = (request: NextRequest, name: string) => Boolean(request.cookies.get(name)?.value);

/**
 * Asks the API for a new sign-in (E02) on behalf of the page. A server fetch sends no `Origin`, and the
 * API refuses a write without it (BR-REC-37), so it is set to the app's own address. The visitor's
 * `X-Forwarded-For` and `User-Agent` go along when present (review R-2). Returns every
 * `Set-Cookie` line of a good answer, or null for anything else (BR-REC-40).
 */
async function refreshOnServer(request: NextRequest): Promise<string[] | null> {
  try {
    const headers = new Headers({
      Cookie: `${REFRESH_COOKIE}=${request.cookies.get(REFRESH_COOKIE)?.value ?? ''}`,
      Origin: request.nextUrl.origin,
    });
    for (const name of VISITOR_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const res = await fetch(`${getServerEnv().API_URL}${API_ROUTES.AUTH.REFRESH}`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const setCookies = res.headers.getSetCookie();
    return setCookies.some((line) => line.startsWith(`${ACCESS_COOKIE}=`)) ? setCookies : null;
  } catch {
    return null;
  }
}

/** The request's own Cookie header with the refreshed cookies in place of the old ones, so the page renders signed in. */
function forwardedHeaders(request: NextRequest, setCookies: string[]): Headers {
  const fresh = new Map<string, string>();
  for (const line of setCookies) {
    const pair = line.split(';', 1)[0] ?? '';
    const at = pair.indexOf('=');
    if (at > 0) fresh.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  const kept = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair && !fresh.has(pair.slice(0, pair.indexOf('=')).trim()));

  const headers = new Headers(request.headers);
  headers.set(
    'cookie',
    [...kept, ...[...fresh].map(([name, value]) => `${name}=${value}`)].join('; '),
  );
  return headers;
}

/** Hands the browser the new cookies exactly as the API sent them (HttpOnly, SameSite, lifetime and all). */
function withNewCookies(response: NextResponse, setCookies: string[]): NextResponse {
  for (const line of setCookies) response.headers.append('Set-Cookie', line);
  return response;
}

const redirectTo = (request: NextRequest, path: string) =>
  NextResponse.redirect(new URL(path, request.nextUrl.origin));

/** Login with the page asked for as `next` (only a path inside the app; Home alias "/" has none). */
function redirectToLogin(request: NextRequest, expired: boolean) {
  const { pathname, search } = request.nextUrl;
  const target = `${pathname}${search}`;
  const next = pathname !== '/' && safeNextPath(target) === target ? target : undefined;
  return redirectTo(request, loginPath({ next, expired }));
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isLogin = pathname === LOGIN_PATH;

  // The app sent this device to Login because its sign-in ended (BR-REC-41); BR-REC-42 does not apply then.
  const justExpired = isLogin && searchParams.get('reason') === SESSION_ENDED_REASON;

  // Signed in: no API call. Login while signed in goes straight to Home (BR-REC-42), unless the app just
  // sent it there: a 401 that outlives the refresh would otherwise bounce between Login and Home.
  if (hasCookie(request, ACCESS_COOKIE)) {
    return isLogin && !justExpired ? redirectTo(request, HOME) : NextResponse.next();
  }

  // Access cookie gone, refresh cookie there: refresh before the page renders, so nobody sees Login
  // or a flash (BR-REC-40). A Login that follows a failed refresh does not try the same cookie again.
  const hasRefresh = hasCookie(request, REFRESH_COOKIE);
  if (hasRefresh && !justExpired) {
    const setCookies = await refreshOnServer(request);
    if (setCookies) {
      return withNewCookies(
        isLogin
          ? redirectTo(request, HOME)
          : NextResponse.next({ request: { headers: forwardedHeaders(request, setCookies) } }),
        setCookies,
      );
    }
  }

  if (isLogin) return NextResponse.next();
  return redirectToLogin(request, hasRefresh);
}

// Never on /api (the API has its own 401), static files, images, the service worker or the manifest.
export const config = {
  matcher: [
    '/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2)$).*)',
  ],
};
