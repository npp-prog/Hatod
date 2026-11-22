import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PageTitle } from './ui';

/** Placeholder landing screen for a work area until its milestone ships. */
export function AreaHome({ area, children }: { area: 'shop' | 'rider' | 'coordinator' | 'admin'; children?: ReactNode }) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <PageTitle>{t(`areas.${area}.title`)}</PageTitle>
      <p className="text-muted">{t(`areas.${area}.body`)}</p>
      {children}
      <p className="card text-muted">{t('common.comingSoon')}</p>
    </div>
  );
}
