'use client';

import { useTranslations } from 'next-intl';
import { AreaTabs } from '@/components/AreaTabs';

export function ShopNav() {
  const t = useTranslations('shop.nav');
  return (
    <AreaTabs
      label={t('home')}
      tabs={[
        { href: '/shop', text: t('home') },
        { href: '/shop/orders', text: t('orders') },
        { href: '/shop/menu', text: t('menu') },
        { href: '/shop/hours', text: t('hours') },
        { href: '/shop/profile', text: t('profile') },
        { href: '/shop/subscription', text: t('plan') },
      ]}
    />
  );
}
