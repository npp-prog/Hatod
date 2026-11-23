'use client';

import { useTranslations } from 'next-intl';
import { TownSelect, useTownScope } from '@/components/coordinator/TownScope';
import { MetricsDashboard } from '@/components/MetricsDashboard';
import { PageTitle } from '@/components/ui';

export function CoordDashboard() {
  const t = useTranslations('metrics');
  const { town } = useTownScope();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto">
          <PageTitle>{t('title')}</PageTitle>
        </span>
        <TownSelect />
      </div>
      {town && <MetricsDashboard townId={town.id} />}
    </div>
  );
}
