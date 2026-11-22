import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Skip Next internals, API routes and any file with an extension (sw.js, icons, manifest).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
