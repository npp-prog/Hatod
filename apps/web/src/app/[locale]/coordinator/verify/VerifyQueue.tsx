'use client';

import { useTranslations } from 'next-intl';
import { TownSelect } from '@/components/coordinator/TownScope';
import { useListings } from '@/components/coordinator/useListings';
import { PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';

export function VerifyQueue() {
  const t = useTranslations('coord');
  const { data } = useListings();
  if (!data) return <Spinner label={t('loading')} />;
  const rows = [
    ...data.shops.map((s) => ({ kind: 'shop' as const, id: s.id, name: s.name, sub: `${s.barangayName}`, status: s.verificationStatus })),
    ...data.riders.map((r) => ({ kind: 'rider' as const, id: r.id, name: r.name, sub: `${r.vehicleDesc} · ${r.plateNo}`, status: r.verificationStatus })),
  ];
  const pending = rows.filter((r) => r.status === 'pending');
  const rejected = rows.filter((r) => r.status === 'rejected');
  const list = (items: typeof rows) => (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={`${r.kind}-${r.id}`}>
          <Link href={`/coordinator/listing/${r.kind}/${r.id}`} className="card flex items-center gap-3 p-3">
            <span className="rounded-full bg-page px-3 py-1 text-sm font-semibold">{t(r.kind)}</span>
            <span className="mr-auto">
              <span className="block font-semibold">{r.name}</span>
              <span className="block text-sm text-muted">{r.sub}</span>
            </span>
            <span className="text-brand">{t('open')}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto">
          <PageTitle>{t('verifyTitle')}</PageTitle>
        </span>
        <TownSelect />
      </div>
      <p className="text-muted">{t('verifyIntro')}</p>
      {pending.length === 0 ? <p className="card">{t('noneWaiting')}</p> : list(pending)}
      {rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">{t('rejected')}</h2>
          {list(rejected)}
        </section>
      )}
    </div>
  );
}
