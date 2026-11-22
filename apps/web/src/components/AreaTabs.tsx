'use client';

import { Link, usePathname } from '@/i18n/navigation';

/** Tab bar for a work area (shop, rider). The first tab is the area's home and matches exactly. */
export function AreaTabs({ label, tabs }: { label: string; tabs: { href: string; text: string }[] }) {
  const pathname = usePathname();
  const home = tabs[0]?.href;
  const active = (href: string) => (href === home ? pathname === href : pathname.startsWith(href));
  return (
    <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
      <ul className="flex gap-1">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={active(tab.href) ? 'page' : undefined}
              className={`inline-flex min-h-12 items-center whitespace-nowrap border-b-4 px-3 font-semibold ${
                active(tab.href) ? 'border-brand text-brand' : 'border-transparent text-muted'
              }`}
            >
              {tab.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
