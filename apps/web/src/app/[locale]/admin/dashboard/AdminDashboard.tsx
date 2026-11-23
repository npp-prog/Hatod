'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MetricsDashboard } from '@/components/MetricsDashboard';
import { PageTitle } from '@/components/ui';
import { fetchAllTowns, type Town } from '@/lib/data/places';

export function AdminDashboard() {
  const t = useTranslations('metrics');
  const [towns, setTowns] = useState<Town[]>([]);
  const [townId, setTownId] = useState<string>('');
  useEffect(() => {
    fetchAllTowns().then(setTowns);
  }, []);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto">
          <PageTitle>{t('title')}</PageTitle>
        </span>
        <select className="input w-auto" value={townId} onChange={(e) => setTownId(e.target.value)} aria-label={t('allTowns')}>
          <option value="">{t('allTowns')}</option>
          {towns.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <MetricsDashboard key={townId || 'all'} townId={townId || null} />
    </div>
  );
}
