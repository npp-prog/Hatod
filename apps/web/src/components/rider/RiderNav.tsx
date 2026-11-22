'use client';

import { useTranslations } from 'next-intl';
import { AreaTabs } from '@/components/AreaTabs';

export function RiderNav() {
  const t = useTranslations('rider.nav');
  return (
    <AreaTabs
      label={t('home')}
      tabs={[
        { href: '/rider', text: t('home') },
        { href: '/rider/jobs', text: t('jobs') },
        { href: '/rider/rates', text: t('rates') },
        { href: '/rider/area', text: t('area') },
        { href: '/rider/profile', text: t('profile') },
      ]}
    />
  );
}
