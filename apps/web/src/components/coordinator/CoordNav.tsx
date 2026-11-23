'use client';

import { useTranslations } from 'next-intl';
import { AreaTabs } from '@/components/AreaTabs';

export function CoordNav() {
  const t = useTranslations('coord.nav');
  return (
    <AreaTabs
      label={t('home')}
      tabs={[
        { href: '/coordinator', text: t('home') },
        { href: '/coordinator/verify', text: t('verify') },
        { href: '/coordinator/listings', text: t('listings') },
        { href: '/coordinator/reports', text: t('reports') },
        { href: '/coordinator/payments', text: t('subs') },
        { href: '/coordinator/dashboard', text: t('dashboard') },
      ]}
    />
  );
}
