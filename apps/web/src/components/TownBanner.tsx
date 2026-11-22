'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from './AuthProvider';
import { useTown } from './TownProvider';

/** Home-screen strip: which town you are ordering in, plus quick links. */
export function TownBanner() {
  const t = useTranslations();
  const { town, loading } = useTown();
  const { user, needsProfile } = useAuth();

  if (loading) return <div className="card h-24 animate-pulse" aria-hidden />;

  if (!town) {
    return (
      <section className="card space-y-3 border-2 border-brand">
        <p className="font-semibold">{t('town.pickPrompt')}</p>
        <Link href="/town" className="btn-primary">
          {t('town.pick')}
        </Link>
      </section>
    );
  }

  return (
    <section className="card flex flex-wrap items-center gap-3">
      <p className="mr-auto text-lg font-bold">{t('town.deliveringIn', { town: town.name })}</p>
      <Link href="/town" className="btn-ghost">
        {t('town.change')}
      </Link>
      {user && !needsProfile && (
        <Link href="/addresses" className="btn-secondary">
          {t('nav.addresses')}
        </Link>
      )}
    </section>
  );
}
