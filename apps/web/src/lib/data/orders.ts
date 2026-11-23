'use client';

import { ACTIVE_STATUSES, type OrderDoc, type PlaceOrderInput, type RiderOfferDoc } from '@hatod/shared';
import { collection, doc, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '@/lib/firebase/client';

export type Order = OrderDoc & { id: string };
export type Offer = RiderOfferDoc & { id: string };

const fn = <I, O = { ok: boolean }>(name: string) => (data: I) => httpsCallable<I, O>(firebase().functions, name)(data).then((r) => r.data);

export const placeOrder = fn<PlaceOrderInput, { orderId: string; duplicate: boolean }>('placeOrder');
export const shopRespondOrder = fn<{ orderId: string; accept: true; readyInMinutes: number } | { orderId: string; accept: false; reason: string }>('shopRespondOrder');
export const riderRespondOffer = fn<{ offerId: string; accept: boolean }>('riderRespondOffer');
export const chooseRider = fn<{ orderId: string; riderId: string }>('chooseRider');
export const advanceOrder = fn<{ orderId: string; to: 'PICKED_UP' | 'DELIVERED' | 'COMPLETED' }>('advanceOrder');
export const cancelOrder = fn<{ orderId: string; reason: string | null }>('cancelOrder');
export const markPaid = fn<{ orderId: string; party: 'shop' | 'rider' }>('markPaid');
export const markReady = fn<{ orderId: string }>('markReady');
export const nudgeOrder = (orderId: string) => fn<{ orderId: string }>('nudgeOrder')({ orderId }).catch(() => undefined);

const toOrder = (d: { id: string; data: (o?: { serverTimestamps: 'estimate' }) => unknown }) =>
  ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as OrderDoc) }) as Order;

export function watchOrder(id: string, cb: (o: Order | null) => void): Unsubscribe {
  return onSnapshot(
    doc(firebase().db, 'orders', id),
    (s) => cb(s.exists() ? toOrder(s) : null),
    () => cb(null),
  );
}

export function watchCustomerOrders(uid: string, cb: (o: Order[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(firebase().db, 'orders'), where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(30)),
    (s) => cb(s.docs.map(toOrder)),
    () => cb([]),
  );
}

/** A shop's active orders (oldest first) and recent finished ones. */
export function watchShopOrders(shopId: string, cb: (active: Order[], recent: Order[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(firebase().db, 'orders'), where('shopId', '==', shopId), orderBy('createdAt', 'desc'), limit(60)),
    (s) => {
      const all = s.docs.map(toOrder);
      cb(
        all.filter((o) => ACTIVE_STATUSES.includes(o.status)).reverse(),
        all.filter((o) => !ACTIVE_STATUSES.includes(o.status)).slice(0, 20),
      );
    },
    () => cb([], []),
  );
}

export function watchRiderOffers(uid: string, cb: (o: Offer[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(firebase().db, 'riderOffers'), where('riderId', '==', uid), where('status', '==', 'pending')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as RiderOfferDoc) }))),
    () => cb([]),
  );
}

/** Rider's orders: active jobs and history (for the earnings log). */
export function watchRiderOrders(uid: string, cb: (active: Order[], done: Order[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(firebase().db, 'orders'), where('riderId', '==', uid), orderBy('createdAt', 'desc'), limit(100)),
    (s) => {
      const all = s.docs.map(toOrder);
      cb(
        all.filter((o) => ACTIVE_STATUSES.includes(o.status)),
        all.filter((o) => o.status === 'COMPLETED' || o.status === 'DELIVERED'),
      );
    },
    () => cb([], []),
  );
}

export function tsMillis(t: unknown): number {
  if (t instanceof Date) return t.getTime();
  if (t && typeof t === 'object' && 'toMillis' in t) return (t as { toMillis(): number }).toMillis();
  return 0;
}

export function orderCode(o: { requestId: string }): string {
  return o.requestId.slice(-5).toUpperCase();
}

/** Opens directions in Google Maps (Waze users get the same link handled by their app chooser). */
export function directionsUrl(geo: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${geo.lat},${geo.lng}&travelmode=driving`;
}
export function wazeUrl(geo: { lat: number; lng: number }): string {
  return `https://waze.com/ul?ll=${geo.lat},${geo.lng}&navigate=yes`;
}
