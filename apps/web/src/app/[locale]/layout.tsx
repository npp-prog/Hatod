import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { AuthProvider } from '@/components/AuthProvider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { TownProvider } from '@/components/TownProvider';
import { routing } from '@/i18n/routing';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : 'en', namespace: 'app' });
  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('description'),
    applicationName: t('name'),
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' },
    icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#0b7a3e',
  width: 'device-width',
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <AuthProvider>
            <TownProvider>
              <OfflineBanner />
              <AppHeader />
              <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
            </TownProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
