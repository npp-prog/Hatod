'use client';

import { formatPHP, manilaParts } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { ContactButtons, ItemsTable } from '@/components/orders/OrderBits';
import { SoundToggle } from '@/components/orders/SoundToggle';
import { PushToggle } from '@/components/PushToggle';
import { RatingForm } from '@/components/trust/RatingForm';
import { ReportButton } from '@/components/trust/ReportButton';
import { useRider } from '@/components/rider/RiderProvider';
import { FieldError, PageTitle } from '@/components/ui';
import { startAlert, stopAlert } from '@/lib/alertSound';
import {
  advanceOrder,
  directionsUrl,
  markPaid,
  nudgeOrder,
  orderCode,
  riderRespondOffer,
  tsMillis,
  watchRiderOffers,
  watchRiderOrders,
  wazeUrl,
  type Offer,
  type Order,
} from '@/lib/data/orders';
import { callableMessage } from '@/lib/firebase/errors';
import { orderErrorText } from '@/lib/orderErrors';
import { useNow } from '@/lib/useNow';

export function RiderJobs() {
  const t = useTranslations('riderJobs');
  const { rider } = useRider();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [active, setActive] = useState<Order[]>([]);
  const [done, setDone] = useState<Order[]>([]);
  const now = useNow(1000);

  useEffect(() => watchRiderOffers(rider.id, setOffers), [rider.id]);
  useEffect(
    () =>
      watchRiderOrders(rider.id, (a, d) => {
        setActive(a);
        setDone(d);
      }),
    [rider.id],
  );

  const live = offers.filter((o) => tsMillis(o.expiresAt) > now.getTime());
  const expired = offers.filter((o) => tsMillis(o.expiresAt) <= now.getTime());
  useEffect(() => {
    if (live.length > 0) startAlert();
    else stopAlert();
    return () => stopAlert();
  }, [live.length]);
  // Close offers whose minute ran out at once, so the customer can choose again.
  useEffect(() => {
    for (const o of expired) void nudgeOrder(o.orderId);
  }, [expired.map((o) => o.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <PageTitle>{t('title')}</PageTitle>
      <SoundToggle label={t('soundOn')} readyLabel={t('soundOn')} />
      <PushToggle />
      {live.map((o) => (
        <OfferCard key={o.id} offer={o} now={now} />
      ))}
      {active.map((o) => (
        <ActiveJob key={o.id} order={o} />
      ))}
      {live.length === 0 && active.length === 0 && <p className="card">{rider.online ? t('waiting') : t('offline')}</p>}
      <Earnings done={done} />
    </div>
  );
}

function useAction() {
  const t = useTranslations('orders');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(orderErrorText(t, callableMessage(e) ?? 'generic'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function OfferCard({ offer, now }: { offer: Offer; now: Date }) {
  const t = useTranslations('riderJobs');
  const { busy, error, run } = useAction();
  // Capped at 60: the phone's clock may run a little behind the server's.
  const secs = Math.min(60, Math.max(0, Math.ceil((tsMillis(offer.expiresAt) - now.getTime()) / 1000)));
  return (
    <article className="card space-y-3 border-4 border-brand" aria-labelledby={`offer-${offer.id}`} role="alertdialog">
      <div className="flex items-center gap-2">
        <h2 id={`offer-${offer.id}`} className="mr-auto text-xl font-bold">
          {t('offerTitle')}
        </h2>
        <span className={`rounded-full px-3 py-1 font-bold ${secs <= 15 ? 'bg-danger text-white' : 'bg-warn'}`} aria-live="polite">
          {t('secondsLeft', { s: secs })}
        </span>
      </div>
      <dl className="space-y-2">
        <div>
          <dt className="text-sm text-muted">{t('from')}</dt>
          <dd className="font-semibold">{`${offer.shopName} · ${offer.pickup.landmark}, Brgy. ${offer.pickup.barangayName}`}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{t('to')}</dt>
          <dd className="font-semibold">{`${offer.dropoff.landmark}, Brgy. ${offer.dropoff.barangayName}`}</dd>
        </div>
        <div className="flex flex-wrap gap-x-4">
          <dd>{t('distance', { km: offer.distanceKm.toFixed(1) })}</dd>
          <dd>{t('items', { count: offer.itemCount })}</dd>
        </div>
      </dl>
      <p className="text-center">
        <span className="block text-sm text-muted">{t('fee')}</span>
        <span className="text-3xl font-extrabold">{formatPHP(offer.fee)}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost border-2 border-line" disabled={busy} onClick={() => run(() => riderRespondOffer({ offerId: offer.id, accept: false }))}>
          {t('decline')}
        </button>
        <button type="button" className="btn-primary text-lg" disabled={busy} onClick={() => run(() => riderRespondOffer({ offerId: offer.id, accept: true }))}>
          {t('accept')}
        </button>
      </div>
      {error && <FieldError id={`offer-err-${offer.id}`}>{error}</FieldError>}
    </article>
  );
}

function ActiveJob({ order }: { order: Order }) {
  const t = useTranslations('riderJobs');
  const tp = useTranslations('shop.payments');
  const { busy, error, run } = useAction();
  const s = order.status;
  const place = (label: string, title: string, where: string, geo: { lat: number; lng: number }, phone: string, who: string) => (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-semibold">{title}</p>
      <p>{where}</p>
      <div className="flex flex-wrap gap-2">
        <a className="btn-secondary" href={directionsUrl(geo)} target="_blank" rel="noopener noreferrer">
          {t('maps')}
        </a>
        <a className="btn-ghost" href={wazeUrl(geo)} target="_blank" rel="noopener noreferrer">
          {t('waze')}
        </a>
        <ContactButtons phone={phone} label={who} />
      </div>
    </div>
  );
  return (
    <article className="card space-y-3 border-2 border-brand" aria-label={t('activeTitle')}>
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-xl font-bold">{`${t('activeTitle')} · ${orderCode(order)}`}</h2>
        {s === 'RIDER_ASSIGNED' && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${order.ready ? 'bg-ok text-white' : 'bg-line'}`}>{order.ready ? t('readyBadge') : t('notReady')}</span>
        )}
      </div>
      {place(t('pickup'), order.shopName, `${order.pickup.landmark}, Brgy. ${order.pickup.barangayName}`, order.pickup.geo, order.shopPhone, order.shopName)}
      {place(
        t('dropoff'),
        order.customerName,
        [order.dropoff.landmark, order.dropoff.street, `Brgy. ${order.dropoff.barangayName}`].filter(Boolean).join(', '),
        order.dropoff.geo,
        order.customerPhone,
        order.customerName,
      )}
      <div className="border-t border-line pt-3">
        <ItemsTable order={order} />
      </div>
      <div className="space-y-1 rounded-xl bg-page p-3">
        <p className="font-semibold">
          {order.paymentMethod === 'cash' ? t('collectFood', { amount: formatPHP(order.itemsTotal) }) : t('foodPrepaid', { method: tp(order.paymentMethod) })}
        </p>
        <p className="font-semibold">{t('collectFee', { amount: formatPHP(order.deliveryFee ?? 0) })}</p>
      </div>
      {s === 'RIDER_ASSIGNED' && (
        <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={() => run(() => advanceOrder({ orderId: order.id, to: 'PICKED_UP' }))}>
          {t('pickedUp')}
        </button>
      )}
      {s === 'PICKED_UP' && (
        <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={() => run(() => advanceOrder({ orderId: order.id, to: 'DELIVERED' }))}>
          {t('delivered')}
        </button>
      )}
      {(s === 'PICKED_UP' || s === 'DELIVERED') && (
        <button
          type="button"
          className={order.riderPaid ? 'chip chip-active w-full justify-center' : 'btn-secondary w-full'}
          disabled={busy || order.riderPaid}
          onClick={() => run(() => markPaid({ orderId: order.id, party: 'rider' }))}
        >
          {order.riderPaid ? `✓ ${t('feeDone')}` : t('feeCollected')}
        </button>
      )}
      <ReportButton orderId={order.id} targets={['customer', 'shop']} />
      {error && <FieldError id={`job-err-${order.id}`}>{error}</FieldError>}
    </article>
  );
}

function Earnings({ done }: { done: Order[] }) {
  const t = useTranslations('riderJobs');
  const tt = useTranslations('trust');
  const today = manilaParts(new Date()).date;
  const weekAgo = Date.now() - 7 * 24 * 3600_000;
  const stats = useMemo(() => {
    const sum = (list: Order[]) => ({ count: list.length, total: list.reduce((s, o) => s + (o.deliveryFee ?? 0), 0) });
    return {
      today: sum(done.filter((o) => manilaParts(new Date(tsMillis(o.createdAt))).date === today)),
      week: sum(done.filter((o) => tsMillis(o.createdAt) >= weekAgo)),
    };
  }, [done, today, weekAgo]);
  return (
    <section className="card space-y-3" aria-labelledby="earn-title">
      <h2 id="earn-title" className="text-lg font-bold">
        {t('earningsTitle')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {(['today', 'week'] as const).map((k) => (
          <div key={k} className="rounded-xl bg-page p-3">
            <p className="text-sm text-muted">{t(k)}</p>
            <p className="text-2xl font-bold">{formatPHP(stats[k].total)}</p>
            <p className="text-sm">{t('deliveries', { count: stats[k].count })}</p>
          </div>
        ))}
      </div>
      {done.length === 0 ? (
        <p className="text-muted">{t('historyEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {done.slice(0, 20).map((o) => (
            <li key={o.id} className="space-y-2 py-2">
              <div className="flex justify-between">
                <span>{`${orderCode(o)} · ${o.shopName} → ${o.dropoff.barangayName}`}</span>
                <span className="font-semibold">{formatPHP(o.deliveryFee ?? 0)}</span>
              </div>
              {o.status === 'COMPLETED' && (
                <RatingForm orderId={o.id} toType="customer" title={tt('rateCustomer', { name: o.customerName })} already={o.ratings?.rider_customer} />
              )}
              <ReportButton orderId={o.id} targets={['customer', 'shop']} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">{t('yourRecord')}</p>
    </section>
  );
}
