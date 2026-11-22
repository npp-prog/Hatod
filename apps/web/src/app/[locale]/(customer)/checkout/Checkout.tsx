'use client';

import {
  estimateRoadKm,
  formatPHP,
  itemsTotal,
  NEW_CUSTOMER_CAP,
  NEW_CUSTOMER_ORDERS,
  newCustomerCapExceeded,
  openStatus,
  riderOptions,
  type PaymentMethod,
  type RiderOption,
  type RiderSort,
} from '@hatod/shared';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useCart } from '@/components/CartProvider';
import { useLowData } from '@/components/LowDataProvider';
import { useTown } from '@/components/TownProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { fetchOnlineRiders } from '@/lib/data/browse';
import type { Rider } from '@/lib/data/riders';
import { useAddresses } from '@/lib/data/useAddresses';
import { useCartShop } from '@/lib/data/useCartShop';
import { firebase } from '@/lib/firebase/client';
import { useNow } from '@/lib/useNow';
import { useOpenText } from '../shops/[id]/ShopPage';

export function Checkout() {
  const t = useTranslations('checkout');
  const tc = useTranslations();
  const { user } = useAuth();
  const { cart, ready } = useCart();
  const { shop, issues } = useCartShop();
  const { addresses } = useAddresses();
  const { town } = useTown();
  const now = useNow();
  const openText = useOpenText();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [riders, setRiders] = useState<Rider[] | null>(null);
  const [sort, setSort] = useState<RiderSort>('price');
  const [riderId, setRiderId] = useState<string | null>(null);
  const [completedOrders, setCompletedOrders] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const townAddresses = useMemo(() => (shop && addresses ? addresses.filter((a) => a.townId === shop.townId) : []), [shop, addresses]);
  const address = townAddresses.find((a) => a.id === addressId) ?? null;

  // Pick the default address and the only payment method automatically.
  useEffect(() => {
    if (!addressId && townAddresses.length) setAddressId((townAddresses.find((a) => a.isDefault) ?? townAddresses[0])!.id);
  }, [townAddresses, addressId]);
  useEffect(() => {
    if (shop && !payment && shop.paymentMethods.length === 1) setPayment(shop.paymentMethods[0]!);
  }, [shop, payment]);

  useEffect(() => {
    if (!shop || shop.hasOwnRider) return;
    fetchOnlineRiders(shop.townId)
      .then(setRiders)
      .catch(() => setRiders([]));
  }, [shop]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(firebase().db, 'users', user.uid))
      .then((s) => setCompletedOrders(Number(s.get('completedOrders') ?? 0)))
      .catch(() => {});
  }, [user]);

  const trip = useMemo(() => {
    if (!shop || !address) return null;
    return {
      shopGeo: shop.geo,
      shopBarangayId: shop.barangayId,
      dropoffGeo: address.geo,
      dropoffBarangayId: address.barangayId,
      // Road routing comes with order placement (server side); until then, a labelled estimate.
      distanceKm: estimateRoadKm(shop.geo, address.geo),
      estimate: true,
      at: now,
    };
  }, [shop, address, now]);

  // TODO(M9): subscription status per rider; during the free trial every rider counts as subscribed.
  const options = useMemo(() => (trip && riders ? riderOptions(riders, trip, () => 'trial', sort) : null), [trip, riders, sort]);
  const chosen = options?.find((o) => o.rider.id === riderId) ?? null;
  useEffect(() => {
    if (riderId && options && !options.some((o) => o.rider.id === riderId)) setRiderId(null);
  }, [options, riderId]);

  if (!ready || shop === undefined || addresses === null) return <Spinner label={tc('common.loading')} />;
  if (cart.lines.length === 0 || shop === null) {
    return (
      <div className="card space-y-3 text-center">
        <p>{tc('cart.empty')}</p>
        <Link href="/" className="btn-primary">
          {tc('cart.browse')}
        </Link>
      </div>
    );
  }

  const townName = town?.id === shop.townId ? town.name : '';
  const food = itemsTotal(cart.lines);
  const deliveryFee = shop.hasOwnRider ? shop.selfDeliveryFee : (chosen?.quote.fee ?? null);
  const status = openStatus(shop, now);
  const overCap = newCustomerCapExceeded(completedOrders, food);
  const cartProblems = issues.length > 0;
  const canPlace = !!address && !!payment && (shop.hasOwnRider || !!chosen) && status.open && !overCap && !cartProblems;

  return (
    <div className="space-y-6 pb-8">
      <PageTitle>{t('title')}</PageTitle>

      {cartProblems && (
        <p className="card border-2 border-danger" role="alert">
          {tc('cart.fixFirst')}{' '}
          <Link href="/cart" className="font-semibold text-brand underline">
            {tc('cart.title')}
          </Link>
        </p>
      )}

      <section className="card space-y-3" aria-labelledby="addr-title">
        <h2 id="addr-title" className="text-lg font-bold">
          {t('addressTitle')}
        </h2>
        {townAddresses.length === 0 ? (
          <p>{t('noAddress', { town: townName })}</p>
        ) : (
          <ul className="space-y-2">
            {townAddresses.map((a) => (
              <li key={a.id}>
                <label className="flex min-h-12 items-start gap-3 rounded-xl border-2 border-line p-3 has-[:checked]:border-brand">
                  <input type="radio" name="address" className="mt-1 size-6 accent-brand" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  <span>
                    <span className="block font-semibold">{a.label}</span>
                    <span className="block text-muted">{[a.landmark, a.street, `Brgy. ${a.barangayName}`].filter(Boolean).join(', ')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {addresses.length > townAddresses.length && townAddresses.length === 0 && <p className="text-muted">{t('otherTown', { town: townName })}</p>}
        <Link href="/addresses/new" className="btn-ghost px-0">
          {t('addAddress')}
        </Link>
      </section>

      <section className="card space-y-3" aria-labelledby="pay-title">
        <h2 id="pay-title" className="text-lg font-bold">
          {t('paymentTitle')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {shop.paymentMethods.map((m) => (
            <label key={m} className={`chip cursor-pointer ${payment === m ? 'chip-active' : ''}`}>
              <input type="radio" name="payment" className="sr-only" checked={payment === m} onChange={() => setPayment(m)} />
              {tc(`shop.payments.${m}`)}
            </label>
          ))}
        </div>
        <p className="text-muted">{t('paymentNote')}</p>
        {payment && payment !== 'cash' && <p className="text-muted">{t('gcashQrNote')}</p>}
      </section>

      {shop.hasOwnRider ? (
        <section className="card space-y-1" aria-labelledby="del-title">
          <h2 id="del-title" className="text-lg font-bold">
            {t('shopDeliveryTitle')}
          </h2>
          <p>{t('shopDeliveryBody', { shop: shop.name, fee: formatPHP(shop.selfDeliveryFee) })}</p>
        </section>
      ) : (
        <section className="space-y-3" aria-labelledby="del-title">
          <div className="card space-y-2">
            <h2 id="del-title" className="text-lg font-bold">
              {t('deliveryTitle')}
            </h2>
            <p className="text-muted">{t('deliveryIntro')}</p>
            {trip && <p className="text-sm text-muted">{t('estimateNote', { km: (Math.round(trip.distanceKm * 10) / 10).toFixed(1) })}</p>}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('sortBy')}>
              <span className="text-sm text-muted">{t('sortBy')}</span>
              {(['price', 'rating', 'nearest'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={sort === s} className={`chip ${sort === s ? 'chip-active' : ''}`} onClick={() => setSort(s)}>
                  {t(`sort.${s}`)}
                </button>
              ))}
            </div>
          </div>
          {!address ? null : !options ? (
            <Spinner label={tc('common.loading')} />
          ) : options.length === 0 ? (
            <p className="card">{t('noRiders')}</p>
          ) : (
            <ul className="space-y-2" aria-label={t('deliveryTitle')}>
              {options.map((o) => (
                <RiderCard key={o.rider.id} option={o as RiderOption<Rider>} selected={riderId === o.rider.id} onSelect={() => setRiderId(o.rider.id)} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card space-y-2" aria-labelledby="sum-title">
        <h2 id="sum-title" className="text-lg font-bold">
          {t('summaryTitle')}
        </h2>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt>{t('food')}</dt>
            <dd>{formatPHP(food)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{shop.hasOwnRider ? t('deliveryFeeShop') : t('deliveryFee')}</dt>
            <dd>{deliveryFee === null ? '—' : formatPHP(deliveryFee)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-xl font-bold">
            <dt>{t('total')}</dt>
            <dd>{formatPHP(food + (deliveryFee ?? 0))}</dd>
          </div>
        </dl>
        <p className="text-sm font-semibold text-brand">{t('noPlatformFee')}</p>
      </section>

      {!status.open && (
        <p className="rounded-2xl border-2 border-warn bg-warn/20 p-4" role="status">
          {tc('cart.shopClosed', { shop: shop.name, when: openText(status) })}
        </p>
      )}
      {overCap && <FieldError id="cap-error">{t('capWarning', { orders: NEW_CUSTOMER_ORDERS, cap: formatPHP(NEW_CUSTOMER_CAP) })}</FieldError>}
      {!shop.hasOwnRider && address && !chosen && options && options.length > 0 && <p className="text-muted">{t('chooseRiderFirst')}</p>}
      {notice && (
        <p role="status" className="card font-semibold">
          {notice}
        </p>
      )}

      <button type="button" className="btn-primary w-full text-lg" disabled={!canPlace} onClick={() => setNotice(t('placeOrderSoon'))}>
        {t('placeOrder')}
        {canPlace && deliveryFee !== null ? ` · ${formatPHP(food + deliveryFee)}` : ''}
      </button>
    </div>
  );
}

function RiderCard({ option, selected, onSelect }: { option: RiderOption<Rider>; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('checkout');
  const tv = useTranslations('rider.vehicles');
  const { lowData } = useLowData();
  const { rider, quote, kmFromShop } = option;
  const b = quote.breakdown;
  return (
    <li>
      <label className={`card flex cursor-pointer gap-3 p-3 ${selected ? 'border-2 border-brand' : ''}`}>
        <input type="radio" name="rider" className="mt-1 size-6 shrink-0 accent-brand" checked={selected} onChange={onSelect} />
        {!lowData && rider.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rider.photoUrl} alt="" width={48} height={48} loading="lazy" className="size-12 shrink-0 rounded-full object-cover" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="mr-auto font-bold">{rider.name}</span>
            <span className="text-xl font-bold">{formatPHP(quote.fee)}</span>
          </span>
          <span className="block text-sm text-muted">
            {rider.ratingCount > 0 ? t('riderRating', { rating: rider.ratingAvg.toFixed(1), count: rider.ratingCount }) : t('riderNew')}
            {' · '}
            {t('riderTrips', { count: rider.completedCount })}
            {' · '}
            {tv(rider.vehicleType)}
          </span>
          {kmFromShop !== null && <span className="block text-sm text-muted">{t('riderAway', { km: kmFromShop.toFixed(1) })}</span>}
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-brand">{t('showBreakdown')}</summary>
            <dl className="mt-1 space-y-0.5">
              {b.fixedFare !== null ? (
                <Row label={t('fixedFare')} value={b.fixedFare} />
              ) : (
                <>
                  <Row label={t('base')} value={b.base} />
                  <Row label={t('distance', { km: quote.billedKm.toFixed(1) })} value={b.distance} />
                  {b.minimumTopUp > 0 && <Row label={t('minimum')} value={b.minimumTopUp} />}
                </>
              )}
              {b.night > 0 && <Row label={t('night')} value={b.night} />}
              {b.rain > 0 && <Row label={t('rain')} value={b.rain} />}
            </dl>
          </details>
        </span>
      </label>
    </li>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{formatPHP(value)}</dd>
    </div>
  );
}
