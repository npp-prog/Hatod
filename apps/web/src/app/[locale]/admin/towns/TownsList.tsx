'use client';

import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { fetchAllTowns, type Town } from '@/lib/data/places';
import { firebase } from '@/lib/firebase/client';

export function TownsList() {
  const t = useTranslations('admin.towns');
  const tc = useTranslations('common');
  const [towns, setTowns] = useState<(Town & { barangays: number })[] | null>(null);

  useEffect(() => {
    (async () => {
      const list = await fetchAllTowns();
      const { db } = firebase();
      const counts = await Promise.all(
        list.map((tw) =>
          getCountFromServer(query(collection(db, 'barangays'), where('townId', '==', tw.id)))
            .then((c) => c.data().count)
            .catch(() => 0),
        ),
      );
      setTowns(list.map((tw, i) => ({ ...tw, barangays: counts[i] ?? 0 })));
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      <Link href="/admin/towns/new" className="btn-primary">
        {t('add')}
      </Link>
      {!towns && <Spinner label={tc('loading')} />}
      {towns?.length === 0 && <p className="card">{t('empty')}</p>}
      <ul className="space-y-3">
        {towns?.map((tw) => (
          <li key={tw.id}>
            <Link href={`/admin/towns/${tw.id}`} className="card flex flex-wrap items-center gap-2">
              <span className="mr-auto">
                <span className="block text-lg font-bold">{tw.name}</span>
                <span className="block text-muted">
                  {tw.province} · {t('tier', { tier: tw.tier })} · {t('barangayCount', { count: tw.barangays })}
                </span>
              </span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${tw.isLive ? 'bg-ok text-white' : 'bg-line'}`}
              >
                {tw.isLive ? t('live') : t('notLive')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
