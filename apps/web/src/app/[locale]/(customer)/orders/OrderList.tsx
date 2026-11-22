'use client';

import { formatPHP, isActive } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { StatusBadge, useTime } from '@/components/orders/OrderBits';
import { PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { orderCode, watchCustomerOrders, type Order } from '@/lib/data/orders';

export function OrderList() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const { user } = useAuth();
  const time = useTime();
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => (user ? watchCustomerOrders(user.uid, setOrders) : undefined), [user]);

  if (!orders) return <Spinner label={tc('loading')} />;
  return (
    <div className="space-y-5">
      <PageTitle>{t('title')}</PageTitle>
      {orders.length === 0 ? (
        <div className="card space-y-3 text-center">
          <p>{t('empty')}</p>
          <Link href="/" className="btn-primary">
            {t('findFood')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className={`card flex flex-col gap-1 p-3 ${isActive(o.status) ? 'border-2 border-brand' : ''}`}>
                <span className="flex items-start gap-2">
                  <span className="mr-auto font-bold">{o.shopName}</span>
                  <StatusBadge status={o.status} />
                </span>
                <span className="text-sm text-muted">
                  {t('code', { code: orderCode(o) })} · {t('placed', { when: time(o.createdAt, true) })} · {t('items', { count: o.items.reduce((n, i) => n + i.qty, 0) })}
                </span>
                <span className="font-semibold">{formatPHP(o.itemsTotal + (o.deliveryFee ?? 0))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
