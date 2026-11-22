'use client';

import { estimatedPrepMinutes, formatPHP, formatTime12, openStatus } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useLowData } from '@/components/LowDataProvider';
import { Link } from '@/i18n/navigation';
import type { Shop } from '@/lib/data/shops';

export function ShopCard({ shop, now }: { shop: Shop; now: Date }) {
  const t = useTranslations();
  const { lowData } = useLowData();
  const status = openStatus(shop, now);
  const photo = !lowData ? shop.photos[0] : undefined;
  const min = shop.menuSummary?.minPrice;

  return (
    <Link href={`/shops/${shop.id}`} className={`card flex gap-3 p-3 ${status.open ? '' : 'opacity-75'}`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" width={88} height={88} loading="lazy" decoding="async" className="size-22 shrink-0 rounded-xl object-cover" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="mr-auto block truncate text-lg font-bold">{shop.name}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold ${status.open ? 'bg-ok text-white' : 'bg-line'}`}>
            {status.open
              ? t('browse.openNow')
              : status.opensAt && status.opensAt.daysAhead === 0
                ? t('browse.opensAt', { time: formatTime12(status.opensAt.time) })
                : t('browse.closedNow')}
          </span>
        </span>
        <span className="block text-muted">
          {t(`shop.categories.${shop.category}`)} · {shop.barangayName}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-3 text-sm">
          <span>
            {shop.ratingCount > 0 ? `★ ${t('browse.rating', { rating: shop.ratingAvg.toFixed(1), count: shop.ratingCount })}` : t('browse.newShop')}
          </span>
          <span>{t('browse.minutes', { minutes: estimatedPrepMinutes(shop) })}</span>
          {min != null && <span>{t('browse.from', { price: formatPHP(min) })}</span>}
          {shop.hasOwnRider && <span className="font-semibold text-brand">{t('browse.shopDelivers')}</span>}
        </span>
      </span>
    </Link>
  );
}
