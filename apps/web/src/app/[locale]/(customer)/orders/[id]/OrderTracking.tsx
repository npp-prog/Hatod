'use client';

import {
  CANCEL_REASONS,
  cancelNeedsReason,
  canTransition,
  formatPHP,
  formatPhMobile,
  ORDER_TIMING,
  riderOptions,
  type CancelReason,
} from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useCart } from '@/components/CartProvider';
import { ContactButtons, ItemsTable, StatusBadge, Timeline, useTime } from '@/components/orders/OrderBits';
import { PushToggle } from '@/components/PushToggle';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { fetchOnlineRiders, fetchShop } from '@/lib/data/browse';
import { advanceOrder, cancelOrder, chooseRider, nudgeOrder, orderCode, tsMillis, watchOrder, type Order } from '@/lib/data/orders';
import type { Rider } from '@/lib/data/riders';
import type { Shop } from '@/lib/data/shops';
import { callableMessage } from '@/lib/firebase/errors';
import { orderErrorText } from '@/lib/orderErrors';
import { useNow } from '@/lib/useNow';

export function OrderTracking({ orderId }: { orderId: string }) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const tp = useTranslations('shop.payments');
  const router = useRouter();
  const { addLine, replaceWith, cart } = useCart();
  const now = useNow(5000);
  const time = useTime();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [shop, setShop] = useState<Shop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<CancelReason | ''>('');

  useEffect(() => watchOrder(orderId, setOrder), [orderId]);
  const shopId = order?.shopId;
  useEffect(() => {
    if (shopId) fetchShop(shopId).then(setShop);
  }, [shopId]);

  // Apply due timeouts right away instead of waiting for the server's sweep.
  const lastChange = order ? tsMillis(order.statusHistory.at(-1)?.at) : 0;
  const due =
    !!order &&
    ((order.status === 'PLACED' && order.expiresAt && tsMillis(order.expiresAt) < now.getTime()) ||
      (order.status === 'RIDER_OFFERED' && now.getTime() - lastChange > ORDER_TIMING.offerMs + 5000));
  useEffect(() => {
    if (due) void nudgeOrder(orderId);
  }, [due, orderId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(orderErrorText(t, callableMessage(e) ?? 'generic'));
    } finally {
      setBusy(false);
    }
  }

  if (order === undefined) return <Spinner label={tc('loading')} />;
  if (order === null) return <p className="card">{t('notFound')}</p>;

  const s = order.status;
  const needsRider = s === 'SHOP_ACCEPTED' && !order.selfDelivery && !order.chosenRiderId && !order.riderId;
  const canCancel = canTransition(s, 'CANCELLED', 'customer');
  const needReason = cancelNeedsReason(s, 'customer');
  const final = ['COMPLETED', 'CANCELLED', 'SHOP_DECLINED', 'EXPIRED'].includes(s);
  const qrUrl = shop ? (order.paymentMethod === 'gcash' ? shop.gcashQrUrl : order.paymentMethod === 'maya' ? shop.mayaQrUrl : null) : null;

  function reorder() {
    const target = { id: order!.shopId, name: order!.shopName, townId: order!.townId };
    order!.items.forEach((i, k) => {
      const line = { itemId: i.itemId, name: i.name, variant: i.variant, addOns: i.addOns, qty: i.qty, note: i.note, unitPrice: i.unitPrice };
      if (k === 0 && cart.shopId && cart.shopId !== order!.shopId) replaceWith(target, line);
      else addLine(target, line);
    });
    router.push('/cart');
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <PageTitle>{order.shopName}</PageTitle>
        <p className="text-muted">
          {t('code', { code: orderCode(order) })} · {t('placed', { when: time(order.createdAt, true) })}
        </p>
        <StatusBadge status={s} />
      </div>
      {!final && <PushToggle />}

      {s === 'SHOP_DECLINED' && <Final text={`${t('status.SHOP_DECLINED')}. ${order.declineReason ? t('declinedBecause', { reason: t(`declineReasons.${order.declineReason}`) }) : ''}`} />}
      {s === 'EXPIRED' && <Final text={t('expiredBody')} />}
      {s === 'CANCELLED' && <Final text={t('cancelledBy', { who: t(`who.${order.cancelledBy ?? 'system'}`) })} />}

      {!final || s === 'COMPLETED' ? (
        <section className="card" aria-label={t('status.PLACED')}>
          <Timeline order={order} />
          {order.readyAt && !order.ready && ['SHOP_ACCEPTED', 'RIDER_OFFERED', 'RIDER_ASSIGNED'].includes(s) && (
            <p className="mt-3 text-muted">{t('readyIn', { time: time(order.readyAt) })}</p>
          )}
          {order.ready && ['SHOP_ACCEPTED', 'RIDER_OFFERED', 'RIDER_ASSIGNED'].includes(s) && <p className="mt-3 font-semibold text-ok">{t('readyNow')}</p>}
        </section>
      ) : null}

      {needsRider && <ChooseAnotherRider order={order} onChoose={(riderId) => run(() => chooseRider({ orderId, riderId }))} busy={busy} />}

      {!final && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="mr-auto">
              <span className="block text-sm text-muted">{t('shopLabel')}</span>
              <span className="font-semibold">{order.shopName}</span>
            </span>
            <ContactButtons phone={order.shopPhone} label={order.shopName} />
          </div>
          {order.rider && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              {order.rider.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={order.rider.photoUrl} alt="" className="size-14 rounded-full object-cover" />
              )}
              <span className="mr-auto">
                <span className="block text-sm text-muted">{t('riderLabel')}</span>
                <span className="block font-semibold">{order.rider.name}</span>
                <span className="block text-sm">{`${order.rider.plateNo} · ${order.rider.vehicleDesc}`}</span>
              </span>
              <ContactButtons phone={order.rider.phone} label={order.rider.name} />
            </div>
          )}
          <div className="border-t border-line pt-3">
            <span className="block text-sm text-muted">{t('deliverTo')}</span>
            <span>{[order.dropoff.landmark, order.dropoff.street, `Brgy. ${order.dropoff.barangayName}`].filter(Boolean).join(', ')}</span>
          </div>
        </section>
      )}

      {!['CANCELLED', 'SHOP_DECLINED', 'EXPIRED'].includes(s) && (
        <section className="card space-y-2" aria-labelledby="pay-title">
          <h2 id="pay-title" className="text-lg font-bold">
            {t('payTitle')}
          </h2>
          {order.paymentMethod === 'cash' ? (
            <p>{t('payShopCash', { amount: formatPHP(order.itemsTotal) })}</p>
          ) : qrUrl ? (
            <>
              <p>{t('payShopQr', { amount: formatPHP(order.itemsTotal), shop: order.shopName, method: tp(order.paymentMethod) })}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt={`${tp(order.paymentMethod)} QR`}
                className="mx-auto w-56 rounded-xl border border-line"
              />
            </>
          ) : (
            <p>{t('payShopNoQr', { amount: formatPHP(order.itemsTotal), shop: order.shopName, method: tp(order.paymentMethod), phone: formatPhMobile(order.shopPhone) })}</p>
          )}
          {order.selfDelivery ? (
            <p>{t('payShopDelivery', { amount: formatPHP(order.deliveryFee ?? 0) })}</p>
          ) : order.rider ? (
            <p>{t('payRider', { amount: formatPHP(order.deliveryFee ?? 0), phone: formatPhMobile(order.rider.phone) })}</p>
          ) : (
            <p className="text-muted">{t('payRiderLater')}</p>
          )}
          {order.shopPaid && <p className="text-sm font-semibold text-ok">{`✓ ${t('shopPaid')}`}</p>}
          {order.riderPaid && <p className="text-sm font-semibold text-ok">{`✓ ${t('riderPaid')}`}</p>}
          <p className="text-sm text-muted">{t('noHatodMoney')}</p>
        </section>
      )}

      <section className="card">
        <ItemsTable order={order} />
      </section>

      {error && <FieldError id="order-error">{error}</FieldError>}

      {s === 'DELIVERED' && (
        <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={() => run(() => advanceOrder({ orderId, to: 'COMPLETED' }))}>
          {t('received')}
        </button>
      )}

      {canCancel &&
        (cancelling ? (
          <section className="card space-y-3 border-2 border-danger">
            {needReason && (
              <label className="block">
                <span className="label">{t('cancelWhy')}</span>
                <select className="input" value={reason} onChange={(e) => setReason(e.target.value as CancelReason)}>
                  <option value="" />
                  {CANCEL_REASONS.filter((r) => !['customer_unreachable', 'sold_out', 'closing'].includes(r)).map((r) => (
                    <option key={r} value={r}>
                      {t(`cancelReasons.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary bg-danger"
                disabled={busy || (needReason && !reason)}
                onClick={() => run(() => cancelOrder({ orderId, reason: reason || null })).then(() => setCancelling(false))}
              >
                {t('confirmCancel')}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setCancelling(false)}>
                {t('keepOrder')}
              </button>
            </div>
          </section>
        ) : (
          <div className="space-y-1">
            {!needReason && <p className="text-sm text-muted">{t('cancelFree')}</p>}
            <button type="button" className="btn-ghost w-full text-danger" onClick={() => setCancelling(true)}>
              {t('cancel')}
            </button>
          </div>
        ))}

      {final && (
        <button type="button" className="btn-secondary w-full" onClick={reorder}>
          {t('reorder')}
        </button>
      )}
    </div>
  );
}

function Final({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border-2 border-line bg-surface p-4" role="status">
      {text}
    </p>
  );
}

function ChooseAnotherRider({ order, onChoose, busy }: { order: Order; onChoose: (riderId: string) => void; busy: boolean }) {
  const t = useTranslations('orders');
  const tc = useTranslations('checkout');
  const [riders, setRiders] = useState<Rider[] | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  useEffect(() => {
    fetchOnlineRiders(order.townId).then(setRiders);
    fetchShop(order.shopId).then(setShop);
  }, [order.townId, order.shopId]);
  const options = useMemo(() => {
    if (!riders || !shop) return null;
    const declined = new Set(order.declinedRiderIds ?? []);
    return riderOptions(
      riders.filter((r) => !declined.has(r.id)),
      {
        shopGeo: shop.geo,
        shopBarangayId: shop.barangayId,
        dropoffGeo: order.dropoff.geo,
        dropoffBarangayId: order.dropoff.barangayId,
        distanceKm: order.distanceKm,
        estimate: order.distanceEstimate,
        at: new Date(),
      },
      () => 'trial',
      'price',
    );
  }, [riders, shop, order]);

  return (
    <section className="card space-y-3 border-2 border-warn" aria-labelledby="another-title">
      <h2 id="another-title" className="font-bold">
        {t('chooseAnother')}
      </h2>
      {!options ? (
        <Spinner label="" />
      ) : options.length === 0 ? (
        <p>{tc('noRiders')}</p>
      ) : (
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.rider.id} className="flex items-center gap-3 rounded-xl border-2 border-line p-3">
              <span className="mr-auto">
                <span className="block font-semibold">{o.rider.name}</span>
                <span className="block text-sm text-muted">
                  {o.rider.ratingCount > 0 ? tc('riderRating', { rating: o.rider.ratingAvg.toFixed(1), count: o.rider.ratingCount }) : tc('riderNew')}
                </span>
              </span>
              <span className="text-lg font-bold">{formatPHP(o.quote.fee)}</span>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => onChoose(o.rider.id)}>
                {tc('choose')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
