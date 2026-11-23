import type { Locale } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { PageTitle } from '@/components/ui';
import { Link } from '@/i18n/navigation';

/**
 * Shown by the service worker when a page that was never opened before is
 * requested without signal. Pages already visited (menus, orders) come from
 * the cache instead. Prerendered and precached for both languages.
 */
export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations('offline');
  return (
    <article className="card space-y-4">
      <PageTitle>{t('pageTitle')}</PageTitle>
      <p>{t('pageBody')}</p>
      <Link href="/" className="btn btn-primary">
        {t('tryAgain')}
      </Link>
    </article>
  );
}
