'use client';

import {
  estimatedPrepMinutes,
  formatPHP,
  formatTime12,
  itemCount,
  itemsTotal,
  openStatus,
  startingPrice,
  type OpenStatus,
} from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useCart } from '@/components/CartProvider';
import { useLowData } from '@/components/LowDataProvider';
import { PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { fetchMenu, fetchShop } from '@/lib/data/browse';
import type { MenuItem, Shop } from '@/lib/data/shops';
import { useNow } from '@/lib/useNow';
import { ItemSheet } from './ItemSheet';

export function useOpenText() {
  const t = useTranslations();
  return (s: OpenStatus) => {
    const n = s.opensAt;
    if (!n) return t('shop.dash.noHours');
    if (n.daysAhead === 0) return t('shop.dash.opensToday', { time: formatTime12(n.time) });
    if (n.daysAhead === 1) return t('shop.dash.opensTomorrow', { time: formatTime12(n.time) });
    return t('shop.dash.opensOn', { day: t(`shop.days.${n.day}`), time: formatTime12(n.time) });
  };
}

export function ShopPage({ shopId }: { shopId: string }) {
  const t = useTranslations();
  const { lowData } = useLowData();
  const { cart } = useCart();
  const now = useNow();
  const openText = useOpenText();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchShop(shopId).then((s) => {
      setShop(s && s.verified && s.status === 'active' ? s : null);
      if (s) fetchMenu(shopId).then(setMenu).catch(() => setMenu([]));
    });
  }, [shopId]);

  if (shop === undefined) return <Spinner label={t('common.loading')} />;
  if (shop === null) {
    return (
      <div className="card space-y-3">
        <p>{t('shopPage.notFound')}</p>
        <Link href="/" className="btn-primary">
          {t('shopPage.back')}
        </Link>
      </div>
    );
  }

  const status = openStatus(shop, now);
  const cats = [...shop.menuCategories, ...new Set((menu ?? []).map((m) => m.category).filter((c) => !shop.menuCategories.includes(c)))];
  const inCart = cart.shopId === shop.id ? cart.lines : [];

  return (
    <div className="space-y-5 pb-24">
      {!lowData && shop.photos[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shop.photos[0]} alt="" className="-mx-4 -mt-6 aspect-[2/1] w-[calc(100%+2rem)] max-w-none object-cover" />
      )}
      <header className="space-y-1">
        <PageTitle>{shop.name}</PageTitle>
        <p className="text-muted">
          {t(`shop.categories.${shop.category}`)} · {`${shop.landmark}, ${shop.barangayName}`}
        </p>
        <p>
          {shop.ratingCount > 0 ? `★ ${t('browse.rating', { rating: shop.ratingAvg.toFixed(1), count: shop.ratingCount })} · ` : ''}
          {t('shopPage.prep', { minutes: estimatedPrepMinutes(shop) })}
        </p>
        <p className="text-muted">{t('shopPage.pays', { methods: shop.paymentMethods.map((m) => t(`shop.payments.${m}`)).join(', ') })}</p>
        {shop.description && <p>{shop.description}</p>}
        {shop.hasOwnRider && <p className="font-semibold text-brand">{t('shopPage.selfDelivery', { fee: formatPHP(shop.selfDeliveryFee) })}</p>}
      </header>

      {!status.open && (
        <p className="rounded-2xl border-2 border-warn bg-warn/20 p-4" role="status">
          <span className="font-bold">{t('shopPage.closedBanner', { when: openText(status) })}</span> {t('shopPage.closedCanBrowse')}
        </p>
      )}

      {!menu ? (
        <Spinner label={t('common.loading')} />
      ) : menu.length === 0 ? (
        <p className="card">{t('shopPage.empty')}</p>
      ) : (
        <>
          {cats.length > 1 && (
            <nav className="sticky top-0 z-10 -mx-4 overflow-x-auto bg-page px-4 py-2" aria-label={t('shop.menu.categoriesTitle')}>
              <ul className="flex gap-2">
                {cats.map((c, i) => (
                  <li key={c}>
                    <a href={`#cat-${i}`} className="chip">
                      {c}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {cats.map((c, i) => {
            const items = menu.filter((m) => m.category === c);
            if (!items.length) return null;
            return (
              <section key={c} id={`cat-${i}`} aria-labelledby={`cat-${i}-title`} className="scroll-mt-20">
                <h2 id={`cat-${i}-title`} className="mb-2 text-xl font-bold">
                  {c}
                </h2>
                <ul className="space-y-2">
                  {items.map((item) => {
                    const qty = inCart.filter((l) => l.itemId === item.id).reduce((n, l) => n + l.qty, 0);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`card flex w-full items-center gap-3 p-3 text-left ${item.available ? '' : 'opacity-60'}`}
                          disabled={!item.available}
                          onClick={() => setPicked(item)}
                        >
                          {!lowData && item.photoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.photoUrl} alt="" width={64} height={64} loading="lazy" className="size-16 shrink-0 rounded-lg object-cover" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{item.name}</span>
                            {item.description && <span className="block text-sm text-muted">{item.description}</span>}
                            <span className="block">
                              {item.available
                                ? item.variants.length
                                  ? t('browse.from', { price: formatPHP(startingPrice(item)) })
                                  : formatPHP(item.price)
                                : t('shopPage.soldOut')}
                            </span>
                          </span>
                          {qty > 0 ? (
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand font-bold text-white">{qty}</span>
                          ) : item.available ? (
                            <span className="btn-secondary min-h-10 px-3" aria-hidden>
                              {t('shopPage.add')}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {toast && (
        <p role="status" className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-xl bg-ink p-3 text-center text-white">
          {toast}
        </p>
      )}

      {inCart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3">
          <Link href="/cart" className="btn-primary mx-auto flex w-full max-w-3xl">
            {t('shopPage.viewCart', { count: itemCount(inCart), total: formatPHP(itemsTotal(inCart)) })}
          </Link>
        </div>
      )}

      {picked && (
        <ItemSheet
          shop={shop}
          item={picked}
          onClose={() => setPicked(null)}
          onAdded={() => {
            setPicked(null);
            setToast(t('shopPage.added'));
            setTimeout(() => setToast(null), 2000);
          }}
        />
      )}
    </div>
  );
}
