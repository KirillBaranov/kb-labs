import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(req: NextRequest): NextResponse {
  const res = intlMiddleware(req) as NextResponse;
  // Expose canonical pathname to request.ts for chunk resolution.
  // next-intl may redirect (e.g. / → /en/) — the header always reflects
  // the *original* request path so request.ts can derive the right chunk.
  res.headers.set('x-pathname', req.nextUrl.pathname);
  return res;
}

export const config = {
  // Match all paths except: Next.js internals, static files, and install.sh
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|install\\.sh|.*\\..*).*)'],
};
