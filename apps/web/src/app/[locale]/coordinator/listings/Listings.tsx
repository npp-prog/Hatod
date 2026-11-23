'use client';

import { useTranslations } from 'next-intl';
import { TownSelect } from '@/components/coordinator/TownScope';
import { useListings } from '@/components/coordinator/useListings';
import { PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';

export function StatusPills({ status, verification }: { status: string; verification: string }) {
  const t = useTranslations('coord');
  return (
    <span className="flex shrink-0 flex-wrap gap-1 text-sm font-semibold">
      <span className={`rounded-full px-2 py-0.5 ${verification === 'approved' ? 'bg-ok text-white' : verification === 'rejected' ? 'bg-danger text-white' : 'bg-warn'}`}>
        {verification === 'approved' ? t('verified') : verification === 'rejected' ? t('rejectedBadge') : t('pending')}
      </span>
      {status !== 'active' && (
        <span className="rounded-full bg-danger px-2 py-0.5 text-white">{status === 'banned' ? t('statusBanned') : t('statusSuspended')}</span>
      )}
    </span>
  );
}

export function Listings() {
  const t = useTranslations('coord');
  const { data } = useListings();
  if (!data) return <Spinner label={t('loading')} />;
  const section = (title: string, kind: 'shop' | 'rider', items: { id: string; name: string; sub: string; status: string; verificationStatus: string }[]) => (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-lg font-bold">{`${title} (${items.length})`}</h2>
      <ul className="space-y-2">
        {items.map((x) => (
          <li key={x.id}>
            <Link href={`/coordinator/listing/${kind}/${x.id}`} className="card flex items-center gap-3 p-3">
              <span className="mr-auto min-w-0">
                <span className="block truncate font-semibold">{x.name}</span>
                <span className="block text-sm text-muted">{x.sub}</span>
              </span>
              <StatusPills status={x.status} verification={x.verificationStatus} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto">
          <PageTitle>{t('listingsTitle')}</PageTitle>
        </span>
        <TownSelect />
      </div>
      {section(t('shop'), 'shop', data.shops.map((s) => ({ id: s.id, name: s.name, sub: s.barangayName, status: s.status, verificationStatus: s.verificationStatus })))}
      {section(t('rider'), 'rider', data.riders.map((r) => ({ id: r.id, name: r.name, sub: `${r.vehicleDesc} · ${r.plateNo}`, status: r.status, verificationStatus: r.verificationStatus })))}
    </div>
  );
}
