'use client';

import { canTransition, CANCEL_REASONS, DECLINE_REASONS, formatPHP, READY_TIME_OPTIONS, type CancelReason } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ContactButtons, ItemsTable, StatusBadge, useTime } from '@/components/orders/OrderBits';
import { SoundToggle } from '@/components/orders/SoundToggle';
import { PushToggle } from '@/components/PushToggle';
import { RatingForm } from '@/components/trust/RatingForm';
import { ReportButton } from '@/components/trust/ReportButton';
import { useShop } from '@/components/shop/ShopProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { startAlert, stopAlert } from '@/lib/alertSound';
import { advanceOrder, cancelOrder, markPaid, markReady, nudgeOrder, orderCode, shopRespondOrder, tsMillis, watchShopOrders, type Order } from '@/lib/data/orders';
import { callableMessage } from '@/lib/firebase/errors';
import { orderErrorText } from '@/lib/orderErrors';
import { useNow } from '@/lib/useNow';

export function ShopOrders() {
  const t = useTranslations('shopOrders');
  const tc = useTranslations('common');
  const { shop } = useShop();
  const [active, setActive] = useState<Order[] | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const now = useNow(5000);

  useEffect(
    () =>
      watchShopOrders(shop.id, (a, r) => {
        setActive(a);
        setRecent(r);
      }),
    [shop.id],
  );

  const waiting = (active ?? []).filter((o) => o.status === 'PLACED');
  // Ring while any new order waits for an answer.
  useEffect(() => {
    if (waiting.length > 0) startAlert();
    else stopAlert();
    return () => stopAlert();
  }, [waiting.length]);
  // Orders past their 10 minutes expire right away (instead of at the next sweep).
  useEffect(() => {
    for (const o of waiting) if (o.expiresAt && tsMillis(o.expiresAt) < now.getTime()) void nudgeOrder(o.id);
  }, [waiting, now]);

  if (!active) return <Spinner label={tc('loading')} />;
  const inProgress = active.filter((o) => o.status !== 'PLACED');

  return (
    <div className="space-y-6">
      <PageTitle>{t('title')}</PageTitle>
      <SoundToggle label={t('soundOn')} readyLabel={t('soundReady')} />
      <PushToggle />

      {active.length === 0 && <p className="card">{t('empty')}</p>}

      {waiting.length > 0 && (
        <section className="space-y-3" aria-labelledby="new-title">
          <h2 id="new-title" className="text-xl font-bold text-danger">{`${t('new')} (${waiting.length})`}</h2>
          {waiting.map((o) => (
            <NewOrderCard key={o.id} order={o} now={now} />
          ))}
        </section>
      )}

      {inProgress.length > 0 && (
        <section className="space-y-3" aria-labelledby="prog-title">
          <h2 id="prog-title" className="text-xl font-bold">
            {t('inProgress')}
          </h2>
          {inProgress.map((o) => (
            <ProgressCard key={o.id} order={o} />
          ))}
        </section>
      )}

      {recent.length > 0 && (
        <section className="space-y-2" aria-labelledby="recent-title">
          <h2 id="recent-title" className="text-lg font-bold">
            {t('recent')}
          </h2>
          <ul className="space-y-2">
            {recent.map((o) => (
              <RecentRow key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}
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

function OrderHead({ order }: { order: Order }) {
  const t = useTranslations('shopOrders');
  const tp = useTranslations('shop.payments');
  const time = useTime();
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <span className="mr-auto text-lg font-bold">{orderCode(order)}</span>
        <span className="text-sm text-muted">{time(order.createdAt)}</span>
      </div>
      <p>
        {`${t('customer')}: ${order.customerName} · `}
        {`Brgy. ${order.dropoff.barangayName}`}
      </p>
      <p className="text-sm text-muted">{t('payment', { method: tp(order.paymentMethod) })}</p>
    </div>
  );
}

function NewOrderCard({ order, now }: { order: Order; now: Date }) {
  const t = useTranslations('shopOrders');
  const to = useTranslations('orders');
  const { busy, error, run } = useAction();
  const [declining, setDeclining] = useState(false);
  const minsLeft = Math.min(10, Math.max(0, Math.ceil((tsMillis(order.expiresAt) - now.getTime()) / 60_000)));
  return (
    <article className="card space-y-3 border-4 border-warn" aria-label={orderCode(order)}>
      <OrderHead order={order} />
      <p className="font-semibold text-danger">{t('answerWithin', { min: minsLeft })}</p>
      <ItemsTable order={order} />
      {!declining ? (
        <>
          <p className="label mb-0">{`${t('accept')} · ${t('readyIn')}`}</p>
          <div className="grid grid-cols-3 gap-2">
            {READY_TIME_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className="btn-primary px-2"
                disabled={busy}
                onClick={() => run(() => shopRespondOrder({ orderId: order.id, accept: true, readyInMinutes: m }))}
              >
                {t('minutes', { n: m })}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost w-full text-danger" onClick={() => setDeclining(true)}>
            {t('decline')}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="label mb-0">{t('declineWhy')}</p>
          <div className="flex flex-wrap gap-2">
            {DECLINE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => run(() => shopRespondOrder({ orderId: order.id, accept: false, reason: r }))}
              >
                {to(`declineReasons.${r}`)}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost" onClick={() => setDeclining(false)}>
            {to('keepOrder')}
          </button>
        </div>
      )}
      <ReportButton orderId={order.id} targets={order.riderId ? ['customer', 'rider'] : ['customer']} />
      {error && <FieldError id={`err-${order.id}`}>{error}</FieldError>}
    </article>
  );
}

function ProgressCard({ order }: { order: Order }) {
  const t = useTranslations('shopOrders');
  const to = useTranslations('orders');
  const { busy, error, run } = useAction();
  const [cancelling, setCancelling] = useState(false);
  const s = order.status;
  const preparing = ['SHOP_ACCEPTED', 'RIDER_OFFERED', 'RIDER_ASSIGNED'].includes(s);
  return (
    <article className="card space-y-3" aria-label={orderCode(order)}>
      <div className="flex items-start gap-2">
        <div className="mr-auto">
          <OrderHead order={order} />
        </div>
        <StatusBadge status={s} />
      </div>
      <ItemsTable order={order} />

      {order.selfDelivery ? (
        <p className="font-semibold">{t('selfDeliver')}</p>
      ) : order.rider ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto">{t('riderAssigned', { name: order.rider.name, plate: order.rider.plateNo })}</span>
          <ContactButtons phone={order.rider.phone} label={order.rider.name} />
        </div>
      ) : s === 'RIDER_OFFERED' ? (
        <p className="text-muted">{t('waitingRider')}</p>
      ) : (
        <p className="text-muted">{t('customerChoosing')}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-muted">{t('customer')}</span>
        <ContactButtons phone={order.customerPhone} label={order.customerName} />
      </div>

      <div className="flex flex-wrap gap-2">
        {preparing && !order.ready && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => markReady({ orderId: order.id }))}>
            {t('markReady')}
          </button>
        )}
        {preparing && order.ready && <span className="chip chip-active">{`✓ ${t('ready')}`}</span>}
        {order.selfDelivery && s === 'RIDER_ASSIGNED' && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => advanceOrder({ orderId: order.id, to: 'PICKED_UP' }))}>
            {t('pickedUp')}
          </button>
        )}
        {order.selfDelivery && s === 'PICKED_UP' && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => advanceOrder({ orderId: order.id, to: 'DELIVERED' }))}>
            {t('delivered')}
          </button>
        )}
        <button
          type="button"
          className={order.shopPaid ? 'chip chip-active' : 'btn-secondary'}
          disabled={busy || order.shopPaid}
          onClick={() => run(() => markPaid({ orderId: order.id, party: 'shop' }))}
        >
          {order.shopPaid ? `✓ ${t('markShopPaid')}` : t('markShopPaid')}
        </button>
        {order.selfDelivery && (
          <button
            type="button"
            className={order.riderPaid ? 'chip chip-active' : 'btn-secondary'}
            disabled={busy || order.riderPaid}
            onClick={() => run(() => markPaid({ orderId: order.id, party: 'rider' }))}
          >
            {order.riderPaid ? `✓ ${t('markRiderPaid')}` : t('markRiderPaid')}
          </button>
        )}
      </div>

      {canTransition(s, 'CANCELLED', 'shop') &&
        (cancelling ? (
          <div className="flex flex-wrap gap-2">
            {CANCEL_REASONS.filter((r) => ['sold_out', 'closing', 'customer_unreachable', 'other'].includes(r)).map((r) => (
              <button
                key={r}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => run(() => cancelOrder({ orderId: order.id, reason: r as CancelReason }))}
              >
                {to(`cancelReasons.${r}`)}
              </button>
            ))}
            <button type="button" className="btn-ghost" onClick={() => setCancelling(false)}>
              {to('keepOrder')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost text-danger" onClick={() => setCancelling(true)}>
            {t('cancelOrder')}
          </button>
        ))}
      <ReportButton orderId={order.id} targets={order.riderId ? ['customer', 'rider'] : ['customer']} />
      {error && <FieldError id={`err-${order.id}`}>{error}</FieldError>}
    </article>
  );
}

function RecentRow({ order }: { order: Order }) {
  const tt = useTranslations('trust');
  const done = order.status === 'COMPLETED';
  return (
    <li className="card space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto font-semibold">{`${orderCode(order)} · ${order.customerName}`}</span>
        <span>{formatPHP(order.itemsTotal)}</span>
        <StatusBadge status={order.status} />
      </div>
      {done && (
        <RatingForm orderId={order.id} toType="customer" title={tt('rateCustomer', { name: order.customerName })} already={order.ratings?.shop_customer} />
      )}
      {order.status !== 'EXPIRED' && <ReportButton orderId={order.id} targets={order.riderId ? ['customer', 'rider'] : ['customer']} />}
    </li>
  );
}
