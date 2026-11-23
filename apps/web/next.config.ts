import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // The service worker would cache stale dev bundles; enable it only in builds.
  disable: process.env.NODE_ENV === 'development',
  reloadOnOnline: false,
  // The "No signal" fallback pages (see src/app/sw.ts).
  additionalPrecacheEntries: [
    { url: '/offline', revision: process.env.SOURCE_VERSION ?? String(Date.now()) },
    { url: '/fil/offline', revision: process.env.SOURCE_VERSION ?? String(Date.now()) },
  ],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hatod/shared'],
  poweredByHeader: false,
  images: { formats: ['image/webp'] },
};

export default withSerwist(withNextIntl(nextConfig));
