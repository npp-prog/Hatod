'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { TownSelect, useTownScope } from '@/components/coordinator/TownScope';
import { useListings } from '@/components/coordinator/useListings';
import { PageTitle } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { watchReports } from '@/lib/data/trust';

export function CoordHome() {
  const t = useTranslations();
  const { town, isAdmin } = useTownScope();
  const { data } = useListings();
  const [openReports, setOpenReports] = useState<number | null>(null);
  useEffect(() => (town ? watchReports(isAdmin ? null : [town.id], 'open', (r) => setOpenReports(r.filter((x) => x.townId === town.id).length)) : undefined), [town, isAdmin]);
  const pending = data ? [...data.shops, ...data.riders].filter((x) => x.verificationStatus === 'pending').length : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto">
          <PageTitle>{t('areas.coordinator.title')}</PageTitle>
        </span>
        <TownSelect />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/coordinator/verify" className="card block">
          <span className="block text-3xl font-bold">{pending ?? '…'}</span>
          <span className="block">{t('coord.pendingLabel')}</span>
        </Link>
        <Link href="/coordinator/reports" className="card block">
          <span className="block text-3xl font-bold">{openReports ?? '…'}</span>
          <span className="block">{t('coord.openReports')}</span>
        </Link>
      </div>
      {town?.acceptingSignups && !town.isLive && <SignupLinks townId={town.id} />}
    </div>
  );
}

function SignupLinks({ townId }: { townId: string }) {
  const t = useTranslations('coord');
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const links = [
    { key: 'signupShop', url: `${origin}/register/shop?town=${encodeURIComponent(townId)}` },
    { key: 'signupRider', url: `${origin}/register/rider?town=${encodeURIComponent(townId)}` },
  ] as const;
  return (
    <section className="card space-y-3" aria-labelledby="signup-title">
      <h2 id="signup-title" className="text-lg font-bold">
        {t('signupTitle')}
      </h2>
      <p className="text-muted">{t('signupHint')}</p>
      {links.map((l) => (
        <div key={l.key} className="space-y-1">
          <p className="font-semibold">{t(l.key)}</p>
          <div className="flex gap-2">
            <input className="input text-sm" readOnly value={l.url} aria-label={t(l.key)} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                await navigator.clipboard?.writeText(l.url).catch(() => {});
                setCopied(l.key);
              }}
            >
              {copied === l.key ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
