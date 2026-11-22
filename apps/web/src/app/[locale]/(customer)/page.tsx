import type { Locale } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { PageTitle } from '@/components/ui';

/** Customer home. Public: anyone can browse. Shops and search arrive in M5. */
export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations('home');

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      <section className="card">
        <h2 className="text-lg font-bold">{t('howItWorks')}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
        </ol>
        <p className="mt-4 font-semibold text-brand">{t('noFees')}</p>
      </section>
      <section className="card">
        <h2 className="text-lg font-bold">{t('workWithUs')}</h2>
        <p className="mt-2 text-muted">{t('workWithUsBody')}</p>
      </section>
    </div>
  );
}
