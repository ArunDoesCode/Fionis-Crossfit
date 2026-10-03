import { type NextRequest, NextResponse } from 'next/server';

// Optimistic guard only: the backend (and each fetcher) remains the authoritative auth check.
// Cookie names follow the standard (§8.2); align with the backend contract when auth lands.
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);

  if (!hasSession && pathname !== '/login') {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
