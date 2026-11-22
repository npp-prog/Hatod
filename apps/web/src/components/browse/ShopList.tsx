'use client';

import { SHOP_CATEGORIES, shopMatches, sortShopsForHome, type ShopCategory } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useLowData } from '@/components/LowDataProvider';
import { useTown } from '@/components/TownProvider';
import { Switch } from '@/components/ui';
import type { Shop } from '@/lib/data/shops';
import { useNow } from '@/lib/useNow';
import { ShopCard } from './ShopCard';

export function ShopList() {
  const t = useTranslations();
  const { town } = useTown();
  const { lowData, setLowData } = useLowData();
  const now = useNow();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState<ShopCategory | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!town) return;
    setShops(null);
    setFailed(false);
    // Loaded on demand so the Firebase SDK stays out of the home page's first load.
    import('@/lib/data/browse')
      .then((m) => m.fetchListedShops(town.id))
      .then(setShops)
      .catch(() => setFailed(true));
  }, [town]);

  const visible = useMemo(() => {
    if (!shops) return [];
    const filtered = shops.filter(
      (s) => (!category || s.category === category) && shopMatches(s, query, [t(`shop.categories.${s.category}`)]),
    );
    return sortShopsForHome(filtered, now);
  }, [shops, category, query, now, t]);

  if (!town) return null;
  if (failed) return <p className="card" role="alert">{t('browse.loadFailed')}</p>;

  return (
    <section className="space-y-4" aria-label={t('browse.shopCount', { count: visible.length })}>
      <div>
        <label htmlFor="search" className="sr-only">
          {t('browse.searchLabel')}
        </label>
        <input
          id="search"
          type="search"
          className="input"
          placeholder={t('browse.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-2" role="group" aria-label={t('browse.searchLabel')}>
          {[null, ...SHOP_CATEGORIES].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={category === c}
              className={`chip ${category === c ? 'chip-active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c ? t(`shop.categories.${c}`) : t('browse.all')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">{shops ? t('browse.shopCount', { count: visible.length }) : ''}</span>
        <span className="flex items-center gap-2">
          <span className="text-sm">{t('browse.lowData')}</span>
          <Switch checked={lowData} onChange={setLowData} label={t('browse.lowData')} />
        </span>
      </div>

      {!shops ? (
        <ul className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="card h-24 animate-pulse" />
          ))}
        </ul>
      ) : shops.length === 0 ? (
        <p className="card">{t('browse.noShops', { town: town.name })}</p>
      ) : visible.length === 0 ? (
        <div className="card space-y-3">
          <p>{t('browse.noResults', { query })}</p>
          <button type="button" className="btn-secondary" onClick={() => (setQuery(''), setCategory(null))}>
            {t('browse.clearSearch')}
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((s) => (
            <li key={s.id}>
              <ShopCard shop={s} now={now} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
