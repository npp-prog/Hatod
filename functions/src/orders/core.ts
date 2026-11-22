import { FieldValue, Timestamp, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  canTransition,
  hasRole,
  ORDER_TIMING,
  type FeeBreakdown,
  type OrderActor,
  type OrderDoc,
  type OrderStatus,
} from '@hatod/shared';
import { db } from '../lib/admin';
import type { Caller } from '../lib/guards';
import { notify, type Notice } from '../lib/notify';

export const ordersCol = () => db.collection('orders');
export const offersCol = () => db.collection('riderOffers');

export type Order = OrderDoc & { id: string };

/** Milliseconds from a stored timestamp. */
export function ms(t: unknown): number {
  if (t instanceof Date) return t.getTime();
  if (t && typeof t === 'object' && 'toMillis' in t) return (t as { toMillis(): number }).toMillis();
  return 0;
}

/** Short code people can read out over the phone: last 5 characters of the request id. */
export function orderCode(order: { requestId: string }): string {
  return order.requestId.slice(-5).toUpperCase();
}

/** Which role this caller plays on this order (an admin who is also the customer acts as customer). */
export function actorFor(caller: Caller, order: OrderDoc): OrderActor | null {
  if (caller.uid === order.customerId) return 'customer';
  if (caller.claims.shops?.includes(order.shopId)) return 'shop';
  if (order.riderId && caller.uid === order.riderId) return 'rider';
  if (hasRole(caller.claims.roles, 'admin')) return 'admin';
  return null;
}

export async function getOrderIn(tx: Transaction, orderId: string): Promise<{ ref: DocumentReference; order: Order }> {
  const ref = ordersCol().doc(orderId);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new HttpsError('not-found', 'order_not_found');
  return { ref, order: { id: snap.id, ...(snap.data() as OrderDoc) } };
}

/**
 * Applies a status change inside a transaction after checking it against the
 * shared state machine, and appends to statusHistory. Every status change in
 * the system goes through here.
 */
export function transition(
  tx: Transaction,
  ref: DocumentReference,
  order: OrderDoc,
  to: OrderStatus,
  actor: OrderActor,
  extra: Record<string, unknown> = {},
  history: OrderDoc['statusHistory'] = order.statusHistory,
): OrderDoc['statusHistory'] {
  if (!canTransition(order.status, to, actor)) throw new HttpsError('failed-precondition', `bad_transition:${order.status}->${to}`);
  const next = [...history, { status: to, at: Timestamp.now(), by: actor }];
  tx.update(ref, { ...extra, status: to, statusHistory: next, updatedAt: FieldValue.serverTimestamp() });
  return next;
}

/** Creates a 60-second job offer for a rider and moves the order to RIDER_OFFERED. */
export function createOffer(
  tx: Transaction,
  ref: DocumentReference,
  order: Order,
  rider: { id: string },
  quote: { fee: number; breakdown: FeeBreakdown },
  actor: OrderActor,
  history?: OrderDoc['statusHistory'],
): { offerId: string; history: OrderDoc['statusHistory'] } {
  const offerRef = offersCol().doc();
  tx.create(offerRef, {
    orderId: order.id,
    riderId: rider.id,
    townId: order.townId,
    shopName: order.shopName,
    pickup: order.pickup,
    dropoff: { barangayName: order.dropoff.barangayName, landmark: order.dropoff.landmark, geo: order.dropoff.geo },
    distanceKm: order.distanceKm,
    fee: quote.fee,
    feeBreakdown: quote.breakdown,
    itemCount: order.items.reduce((n, i) => n + i.qty, 0),
    status: 'pending',
    expiresAt: Timestamp.fromMillis(Date.now() + ORDER_TIMING.offerMs),
    createdAt: FieldValue.serverTimestamp(),
    respondedAt: null,
  });
  const next = transition(
    tx,
    ref,
    order,
    'RIDER_OFFERED',
    actor,
    { offerId: offerRef.id, chosenRiderId: rider.id, deliveryFee: quote.fee, feeBreakdown: quote.breakdown },
    history,
  );
  return { offerId: offerRef.id, history: next };
}

/** Notifications to send once a transaction has committed. */
export type Outbox = { uid: string; notice: Notice }[];
export async function flush(outbox: Outbox) {
  await Promise.all(outbox.map((m) => notify(m.uid, m.notice)));
}

/**
 * Applies any timeout that is due on one order: a shop that never answered
 * (EXPIRED) or a rider offer that ran out (back to choosing a rider).
 * Idempotent; used by the every-minute sweep and on demand by the apps.
 */
export async function applyTimeouts(orderId: string, now = Date.now()): Promise<Outbox> {
  return db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, orderId);
    const outbox: Outbox = [];
    if (order.status === 'PLACED' && order.expiresAt && ms(order.expiresAt) <= now) {
      transition(tx, ref, order, 'EXPIRED', 'system', { expiresAt: null });
      outbox.push({ uid: order.customerId, notice: { title: order.shopName, body: `${order.shopName} did not answer in time. Your order ${orderCode(order)} was not placed. You were not charged.`, link: `/orders/${order.id}` } });
    }
    if (order.status === 'RIDER_OFFERED' && order.offerId) {
      const offerRef = offersCol().doc(order.offerId);
      const offer = await tx.get(offerRef);
      if (offer.exists && offer.get('status') === 'pending' && ms(offer.get('expiresAt')) <= now) {
        tx.update(offerRef, { status: 'expired', respondedAt: FieldValue.serverTimestamp() });
        transition(tx, ref, order, 'SHOP_ACCEPTED', 'system', {
          offerId: null,
          chosenRiderId: null,
          deliveryFee: null,
          feeBreakdown: null,
          declinedRiderIds: FieldValue.arrayUnion(offer.get('riderId')),
        });
        outbox.push({ uid: order.customerId, notice: { title: 'Choose another rider', body: `The rider did not answer. Please choose another rider for order ${orderCode(order)}.`, link: `/orders/${order.id}` } });
      }
    }
    return outbox;
  });
}
