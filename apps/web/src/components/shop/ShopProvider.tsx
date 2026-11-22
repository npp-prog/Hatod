'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { refreshMenuSummary, watchMenu, watchMyShop, type MenuItem, type Shop } from '@/lib/data/shops';

interface ShopState {
  shop: Shop;
  menu: MenuItem[] | null;
}

const ShopContext = createContext<ShopState | null>(null);

/** Loads the owner's shop and menu (live) for every page in the shop area. */
export function ShopProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);

  useEffect(() => {
    if (!user) return;
    return watchMyShop(user.uid, setShop, () => setShop(null));
  }, [user]);

  const shopId = shop?.id;
  useEffect(() => {
    if (!shopId) return;
    return watchMenu(shopId, setMenu, () => setMenu([]));
  }, [shopId]);

  // A menu without a summary (older data, or a refresh that failed offline) gets one.
  const needsSummary = !!shop && !!menu && menu.length > 0 && shop.menuSummary?.itemCount !== menu.length;
  useEffect(() => {
    if (needsSummary && shopId) refreshMenuSummary(shopId);
  }, [needsSummary, shopId]);

  if (shop === undefined) return <Spinner label={t('common.loading')} />;
  if (shop === null) {
    return (
      <div className="card space-y-3">
        <p>{t('shop.noShop')}</p>
        <Link href="/register/shop" className="btn-primary">
          {t('shop.register.cta')}
        </Link>
      </div>
    );
  }
  return <ShopContext.Provider value={{ shop, menu }}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopState {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside <ShopProvider>');
  return ctx;
}
