import { NextRequest, NextResponse } from 'next/server';

// Guards the (dashboard) route group. This is a UX convenience only —
// the real authorization boundary is the backend's JwtAuthGuard/RolesGuard,
// since a client-side check can always be bypassed.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/users',
  '/settings',
  '/employees',
  '/clients',
  '/locations',
  '/placement-requests',
  '/attendance',
  '/leave-requests',
  '/overtime-requests',
  '/holidays',
  '/reports',
  '/payroll',
  '/profile-change-requests',
  '/temporary-assignments',
  '/absence-cases',
  '/profile',
  '/activity',
  '/approvals',
  '/system',
  '/requests',
  '/account',
];

export function middleware(req: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get('papaiz_access_token')?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/users/:path*',
    '/settings/:path*',
    '/employees/:path*',
    '/clients/:path*',
    '/locations/:path*',
    '/placement-requests/:path*',
    '/attendance/:path*',
    '/leave-requests/:path*',
    '/overtime-requests/:path*',
    '/holidays/:path*',
    '/reports/:path*',
    '/payroll/:path*',
    '/profile-change-requests/:path*',
    '/temporary-assignments/:path*',
    '/absence-cases/:path*',
    '/profile/:path*',
    '/activity/:path*',
    '/approvals/:path*',
    '/system/:path*',
    '/requests/:path*',
    '/account/:path*',
  ],
};
