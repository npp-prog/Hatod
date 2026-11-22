'use client';

import { AREA_HOME, accessibleAreas, areaForPath } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { formatPHP, itemCount, itemsTotal } from '@hatod/shared';
import { useAuth } from './AuthProvider';
import { useCart } from './CartProvider';
import { LanguageSwitcher } from './LanguageSwitcher';

export function AppHeader() {
  const t = useTranslations();
  const { user, claims, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const current = areaForPath(pathname);
  const areas = user ? accessibleAreas(claims.roles) : [];

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2">
        <Link href="/" className="mr-auto flex min-h-12 items-center text-xl font-extrabold text-brand">
          {t('app.name')}
        </Link>
        <CartButton />
        <LanguageSwitcher />
        {!loading &&
          (user ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                await signOut();
                router.replace('/');
              }}
            >
              {t('nav.signOut')}
            </button>
          ) : (
            <Link href="/auth" className="btn-ghost">
              {t('nav.signIn')}
            </Link>
          ))}
      </div>
      {areas.length > 1 && (
        <nav aria-label={t('nav.switchTo')} className="mx-auto max-w-3xl overflow-x-auto px-4 pb-2">
          <ul className="flex gap-2">
            {areas.map((a) => (
              <li key={a}>
                <Link
                  href={AREA_HOME[a]}
                  aria-current={a === current ? 'page' : undefined}
                  className={`chip ${a === current ? 'chip-active' : ''}`}
                >
                  {t(`nav.areas.${a}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

function CartButton() {
  const t = useTranslations('nav');
  const { cart } = useCart();
  const count = itemCount(cart.lines);
  if (count === 0) return null;
  return (
    <Link href="/cart" className="btn-primary gap-1 px-3" aria-label={t('cart', { count })}>
      <span aria-hidden>🛒</span>
      <span>{count}</span>
      <span className="hidden sm:inline">· {formatPHP(itemsTotal(cart.lines))}</span>
    </Link>
  );
}
