import type { Locale } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { PageTitle } from '@/components/ui';

// TODO(lawyer): replace the draft text in messages/*.json (legal.terms) before launch.
export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations('legal');
  const paragraphs = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
  return (
    <article className="card space-y-4">
      <PageTitle>{t('terms.title')}</PageTitle>
      <p className="rounded-xl bg-warn/20 p-3 font-semibold">{t('draftNotice')}</p>
      {paragraphs.map((p) => (
        <p key={p}>{t(`terms.${p}`)}</p>
      ))}
    </article>
  );
}
