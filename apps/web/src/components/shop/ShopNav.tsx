'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const TABS = [
  { href: '/shop', key: 'home' },
  { href: '/shop/menu', key: 'menu' },
  { href: '/shop/hours', key: 'hours' },
  { href: '/shop/profile', key: 'profile' },
] as const;

export function ShopNav() {
  const t = useTranslations('shop.nav');
  const pathname = usePathname();
  const active = (href: string) => (href === '/shop' ? pathname === '/shop' : pathname.startsWith(href));
  return (
    <nav aria-label={t('home')} className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
      <ul className="flex gap-1">
        {TABS.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={active(tab.href) ? 'page' : undefined}
              className={`inline-flex min-h-12 items-center whitespace-nowrap border-b-4 px-3 font-semibold ${
                active(tab.href) ? 'border-brand text-brand' : 'border-transparent text-muted'
              }`}
            >
              {t(tab.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
