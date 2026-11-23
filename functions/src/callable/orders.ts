import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  ACTIVE_STATUSES,
  advanceOrderInput,
  cancelNeedsReason,
  cancelOrderInput,
  chooseRiderInput,
  computeDeliveryFee,
  formatPHP,
  itemUnitPrice,
  markPaidInput,
  MAX_OPEN_ORDERS,
  newCustomerCapExceeded,
  openStatus,
  ORDER_TIMING,
  orderIdInput,
  placeOrderInput,
  riderEligibility,
  riderRespondInput,
  shopRespondInput,
  type LatLng,
  type OrderDoc,
  type OrderItem,
  type RateCard,
} from '@hatod/shared';
import { db } from '../lib/admin';
import { parseInput, requireAuth } from '../lib/guards';
import { ORS_API_KEY, SEMAPHORE_API_KEY } from '../lib/params';
import { roadDistanceKm } from '../lib/providers/routing';
import { addStrike } from '../lib/strikes';
import {
  actorFor,
  applyTimeouts,
  createOffer,
  flush,
  getOrderIn,
  ms,
  offersCol,
  orderCode,
  ordersCol,
  transition,
  type Outbox,
} from '../orders/core';

const withSecrets = { secrets: [SEMAPHORE_API_KEY, ORS_API_KEY] };
const fail = (code: 'failed-precondition' | 'permission-denied' | 'not-found' | 'invalid-argument', message: string, details?: unknown) => {
  throw new HttpsError(code, message, details);
};

// TODO(M9): read each rider's subscription; during the free trial everyone counts as subscribed.
const subscriptionOf = (_riderId: string) => 'trial' as const;

/** Quote for one rider on this trip, or null if they cannot take it now. */
function quoteRider(rider: FirebaseFirestore.DocumentSnapshot, trip: { fromBarangayId: string; toBarangayId: string; distanceKm: number; estimate: boolean }) {
  if (!rider.exists) return null;
  const r = rider.data()!;
  const quote = computeDeliveryFee({
    card: r.rateCard as RateCard,
    distanceKm: trip.distanceKm,
    fromBarangayId: trip.fromBarangayId,
    toBarangayId: trip.toBarangayId,
    at: new Date(),
    rainOn: r.rainOn === true,
    estimate: trip.estimate,
  });
  const ok = riderEligibility(
    { verified: r.verified === true, status: r.status, online: r.online === true, servedBarangayIds: r.servedBarangayIds ?? [], maxKm: r.maxKm ?? 0 },
    subscriptionOf(rider.id),
    { dropoffBarangayId: trip.toBarangayId, billedKm: quote.billedKm },
  );
  return ok.eligible ? quote : null;
}

/**
 * Customer places an order. Everything that matters is recomputed here from
 * stored data: prices from the menu, the address from the customer's saved
 * addresses, the rider's fee from their rate card. The order id is derived
 * from the client's requestId, so a retry after lost signal returns the same
 * order instead of creating a second one.
 */
export const placeOrder = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(placeOrderInput, req.data);
  const orderRef = ordersCol().doc(`${caller.uid}_${input.requestId}`);

  const existing = await orderRef.get();
  if (existing.exists) {
    if (existing.get('customerId') !== caller.uid) fail('permission-denied', 'not_your_order');
    return { orderId: orderRef.id, duplicate: true };
  }

  const [user, shopSnap, addressSnap, openOrders] = await Promise.all([
    db.collection('users').doc(caller.uid).get(),
    db.collection('shops').doc(input.shopId).get(),
    db.collection('addresses').doc(input.addressId).get(),
    ordersCol().where('customerId', '==', caller.uid).where('status', 'in', ACTIVE_STATUSES).limit(MAX_OPEN_ORDERS + 1).get(),
  ]);
  if (!user.exists) fail('failed-precondition', 'profile_required');
  if (user.get('status') !== 'active') fail('permission-denied', 'account_not_active');
  if (openOrders.size >= MAX_OPEN_ORDERS) fail('failed-precondition', 'too_many_open_orders');

  const shop = shopSnap.data();
  if (!shop || shop.verified !== true || shop.status !== 'active') fail('failed-precondition', 'shop_unavailable');
  if (!openStatus({ hours: shop!.hours, closedOn: shop!.closedOn }, new Date()).open) fail('failed-precondition', 'shop_closed');
  if (!(shop!.paymentMethods as string[]).includes(input.paymentMethod)) fail('invalid-argument', 'payment_not_accepted');

  const address = addressSnap.data();
  if (!address || address.userId !== caller.uid) fail('not-found', 'address_not_found');
  if (address!.townId !== shop!.townId) fail('failed-precondition', 'address_other_town');

  // Prices come from the menu, never from the client.
  const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
  const itemSnaps = await db.getAll(...itemIds.map((id) => shopSnap.ref.collection('menuItems').doc(id)));
  const menu = new Map(itemSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));
  const items: OrderItem[] = input.lines.map((l) => {
    const m = menu.get(l.itemId);
    if (!m || m.available !== true) fail('failed-precondition', 'item_unavailable', { itemId: l.itemId });
    const unitPrice = itemUnitPrice({ price: m!.price, variants: m!.variants ?? [], addOns: m!.addOns ?? [] }, l.variant, l.addOns);
    if (unitPrice === null) fail('failed-precondition', 'item_changed', { itemId: l.itemId });
    return { itemId: l.itemId, name: m!.name, variant: l.variant, addOns: l.addOns, qty: l.qty, note: (l.note ?? '').trim(), unitPrice: unitPrice! };
  });
  const itemsTotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  if (newCustomerCapExceeded(Number(user.get('completedOrders') ?? 0), itemsTotal)) fail('failed-precondition', 'new_customer_cap');

  const selfDelivery = shop!.hasOwnRider === true;
  const { km, estimate } = await roadDistanceKm(shop!.geo as LatLng, address!.geo as LatLng);
  let deliveryFee: number | null = null;
  let feeBreakdown: OrderDoc['feeBreakdown'] = null;
  if (selfDelivery) {
    deliveryFee = shop!.selfDeliveryFee ?? 0;
  } else {
    if (!input.riderId) fail('invalid-argument', 'rider_required');
    const rider = await db.collection('riders').doc(input.riderId!).get();
    if (rider.get('townId') !== shop!.townId) fail('failed-precondition', 'rider_unavailable');
    const quote = quoteRider(rider, { fromBarangayId: shop!.barangayId, toBarangayId: address!.barangayId, distanceKm: km, estimate });
    if (!quote) fail('failed-precondition', 'rider_unavailable');
    deliveryFee = quote!.fee;
    feeBreakdown = quote!.breakdown;
  }

  const now = Timestamp.now();
  const order: OrderDoc = {
    requestId: input.requestId,
    townId: shop!.townId,
    customerId: caller.uid,
    customerName: user.get('name'),
    customerPhone: user.get('phone'),
    shopId: shopSnap.id,
    shopOwnerId: shop!.ownerId,
    shopName: shop!.name,
    shopPhone: shop!.contactPhone,
    pickup: { geo: shop!.geo, landmark: shop!.landmark, barangayName: shop!.barangayName },
    dropoff: {
      label: address!.label,
      barangayId: address!.barangayId,
      barangayName: address!.barangayName,
      street: address!.street ?? '',
      landmark: address!.landmark,
      geo: address!.geo,
    },
    items,
    itemsTotal,
    paymentMethod: input.paymentMethod,
    selfDelivery,
    chosenRiderId: selfDelivery ? null : input.riderId,
    riderId: null,
    rider: null,
    declinedRiderIds: [],
    offerId: null,
    distanceKm: Math.round(km * 100) / 100,
    distanceEstimate: estimate,
    deliveryFee,
    feeBreakdown,
    feeLocked: selfDelivery,
    status: 'PLACED',
    statusHistory: [{ status: 'PLACED', at: now, by: 'customer' }],
    declineReason: null,
    cancelReason: null,
    cancelledBy: null,
    readyAt: null,
    ready: false,
    shopPaid: false,
    riderPaid: false,
    participants: [caller.uid, shop!.ownerId],
    expiresAt: Timestamp.fromMillis(now.toMillis() + ORDER_TIMING.shopResponseMs),
    deliveredAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await orderRef.create(order);
  } catch {
    // Same requestId raced in from a retry: the first one won; return it.
    return { orderId: orderRef.id, duplicate: true };
  }
  await flush([
    {
      uid: shop!.ownerId,
      notice: {
        title: 'New order',
        body: `New order ${orderCode(order)}: ${items.reduce((n, i) => n + i.qty, 0)} items, ${formatPHP(itemsTotal)}. Accept within 10 minutes.`,
        link: '/shop/orders',
        sms: true,
      },
    },
  ]);
  return { orderId: orderRef.id, duplicate: false };
});

/** Shop accepts (with a ready time) or declines (with a reason). */
export const shopRespondOrder = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(shopRespondInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, input.orderId);
    if (actorFor(caller, order) !== 'shop') fail('permission-denied', 'not_your_order');
    if (order.status === 'PLACED' && order.expiresAt && ms(order.expiresAt) <= Date.now()) fail('failed-precondition', 'order_expired');
    const out: Outbox = [];
    if (!input.accept) {
      transition(tx, ref, order, 'SHOP_DECLINED', 'shop', { declineReason: input.reason, expiresAt: null });
      out.push({ uid: order.customerId, notice: { title: order.shopName, body: `${order.shopName} could not take order ${orderCode(order)}. Please try another shop.`, link: `/orders/${order.id}` } });
      return out;
    }
    const readyAt = Timestamp.fromMillis(Date.now() + input.readyInMinutes * 60_000);
    // Read everything first: Firestore transactions need all reads before writes.
    const riderSnap = !order.selfDelivery && order.chosenRiderId ? await tx.get(db.collection('riders').doc(order.chosenRiderId)) : null;
    let history = transition(tx, ref, order, 'SHOP_ACCEPTED', 'shop', { readyAt, expiresAt: null });
    const accepted = { ...order, status: 'SHOP_ACCEPTED' as const, statusHistory: history };
    out.push({ uid: order.customerId, notice: { title: order.shopName, body: `${order.shopName} accepted order ${orderCode(order)}. Ready in about ${input.readyInMinutes} minutes.`, link: `/orders/${order.id}` } });
    if (order.selfDelivery) {
      transition(tx, ref, accepted, 'RIDER_ASSIGNED', 'shop', {}, history);
      return out;
    }
    const quote = riderSnap
      ? quoteRider(riderSnap, { fromBarangayId: '', toBarangayId: order.dropoff.barangayId, distanceKm: order.distanceKm, estimate: order.distanceEstimate })
      : null;
    if (riderSnap && quote && order.deliveryFee !== null && order.feeBreakdown) {
      // The customer agreed to the fee quoted at checkout; offer the rider that same fee.
      const { history: h } = createOffer(tx, ref, accepted, { id: riderSnap.id }, { fee: order.deliveryFee, breakdown: order.feeBreakdown }, 'system', history);
      history = h;
      out.push({
        uid: riderSnap.id,
        notice: { title: 'New job', body: `Job from ${order.shopName} to ${order.dropoff.barangayName}, ${formatPHP(order.deliveryFee)}. Answer within 60 seconds.`, link: '/rider/jobs', sms: true },
      });
    } else {
      // The chosen rider went offline meanwhile: the customer picks another.
      tx.update(ref, { chosenRiderId: null, deliveryFee: null, feeBreakdown: null });
      out.push({ uid: order.customerId, notice: { title: 'Choose a rider', body: `Your rider is no longer available. Please choose another rider for order ${orderCode(order)}.`, link: `/orders/${order.id}` } });
    }
    return out;
  });
  await flush(outbox);
  return { ok: true };
});

/**
 * Rider accepts or declines a job offer. Acceptance runs in a transaction that
 * checks the offer is still the order's current one and still pending, so two
 * riders can never both win an order, and the fee is locked here.
 */
export const riderRespondOffer = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(riderRespondInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const offerRef = offersCol().doc(input.offerId);
    const offerSnap = await tx.get(offerRef);
    if (!offerSnap.exists || offerSnap.get('riderId') !== caller.uid) fail('not-found', 'offer_not_found');
    const offer = offerSnap.data()!;
    const { ref, order } = await getOrderIn(tx, offer.orderId);
    const riderRef = db.collection('riders').doc(caller.uid);
    const [riderSnap, riderPriv] = await Promise.all([tx.get(riderRef), tx.get(riderRef.collection('private').doc('info'))]);
    if (offer.status !== 'pending' || order.offerId !== offerRef.id || order.status !== 'RIDER_OFFERED') fail('failed-precondition', 'offer_closed');
    if (ms(offer.expiresAt) <= Date.now()) fail('failed-precondition', 'offer_expired');

    const out: Outbox = [];
    if (!input.accept) {
      tx.update(offerRef, { status: 'declined', respondedAt: FieldValue.serverTimestamp() });
      transition(tx, ref, order, 'SHOP_ACCEPTED', 'rider', {
        offerId: null,
        chosenRiderId: null,
        deliveryFee: null,
        feeBreakdown: null,
        declinedRiderIds: FieldValue.arrayUnion(caller.uid),
      });
      out.push({ uid: order.customerId, notice: { title: 'Choose another rider', body: `The rider cannot take order ${orderCode(order)}. Please choose another rider.`, link: `/orders/${order.id}` } });
      return out;
    }
    const r = riderSnap.data();
    if (!r || r.verified !== true || r.status !== 'active') fail('permission-denied', 'rider_not_active');
    tx.update(offerRef, { status: 'accepted', respondedAt: FieldValue.serverTimestamp() });
    tx.update(riderRef, { lastActiveAt: FieldValue.serverTimestamp() });
    transition(tx, ref, order, 'RIDER_ASSIGNED', 'rider', {
      riderId: caller.uid,
      rider: { name: r!.name, phone: riderPriv.get('phone') ?? '', plateNo: r!.plateNo ?? '', vehicleDesc: r!.vehicleDesc ?? '', photoUrl: r!.photoUrl ?? null },
      deliveryFee: offer.fee,
      feeBreakdown: offer.feeBreakdown,
      feeLocked: true,
      offerId: null,
      participants: FieldValue.arrayUnion(caller.uid),
    });
    const fee = formatPHP(offer.fee);
    out.push({ uid: order.customerId, notice: { title: 'Rider assigned', body: `${r!.name} will deliver order ${orderCode(order)} for ${fee}.`, link: `/orders/${order.id}` } });
    out.push({ uid: order.shopOwnerId, notice: { title: 'Rider assigned', body: `${r!.name} (${r!.plateNo}) will pick up order ${orderCode(order)}.`, link: '/shop/orders' } });
    return out;
  });
  await flush(outbox);
  return { ok: true };
});

/** After a decline or an expired offer, the customer picks another rider. */
export const chooseRider = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(chooseRiderInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, input.orderId);
    if (actorFor(caller, order) !== 'customer') fail('permission-denied', 'not_your_order');
    if (order.status !== 'SHOP_ACCEPTED' || order.selfDelivery || order.riderId || order.offerId) fail('failed-precondition', 'not_choosing_rider');
    if ((order.declinedRiderIds ?? []).includes(input.riderId)) fail('failed-precondition', 'rider_declined');
    const riderSnap = await tx.get(db.collection('riders').doc(input.riderId));
    if (riderSnap.get('townId') !== order.townId) fail('failed-precondition', 'rider_unavailable');
    const shop = await tx.get(db.collection('shops').doc(order.shopId));
    const quote = quoteRider(riderSnap, {
      fromBarangayId: shop.get('barangayId'),
      toBarangayId: order.dropoff.barangayId,
      distanceKm: order.distanceKm,
      estimate: order.distanceEstimate,
    });
    if (!quote) fail('failed-precondition', 'rider_unavailable');
    createOffer(tx, ref, order, { id: riderSnap.id }, quote!, 'customer');
    return [
      {
        uid: riderSnap.id,
        notice: { title: 'New job', body: `Job from ${order.shopName} to ${order.dropoff.barangayName}, ${formatPHP(quote!.fee)}. Answer within 60 seconds.`, link: '/rider/jobs', sms: true },
      },
    ] as Outbox;
  });
  await flush(outbox);
  return { ok: true };
});

/** Picked up / delivered (rider, or the shop when it delivers) and received (customer). */
export const advanceOrder = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(advanceOrderInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, input.orderId);
    const actor = actorFor(caller, order);
    if (!actor) fail('permission-denied', 'not_your_order');
    if (input.to !== 'COMPLETED' && actor !== (order.selfDelivery ? 'shop' : 'rider')) fail('permission-denied', 'not_the_deliverer');
    if (input.to === 'COMPLETED' && actor !== 'customer' && actor !== 'admin') fail('permission-denied', 'customer_confirms');
    const out: Outbox = [];
    const extra: Record<string, unknown> = {};
    if (input.to === 'DELIVERED') extra.deliveredAt = FieldValue.serverTimestamp();
    if (input.to === 'COMPLETED') {
      tx.update(db.collection('users').doc(order.customerId), { completedOrders: FieldValue.increment(1) });
      if (order.riderId) tx.update(db.collection('riders').doc(order.riderId), { completedCount: FieldValue.increment(1) });
    }
    if (input.to !== 'COMPLETED' && order.riderId) tx.update(db.collection('riders').doc(order.riderId), { lastActiveAt: FieldValue.serverTimestamp() });
    transition(tx, ref, order, input.to, actor!, extra);
    if (input.to === 'PICKED_UP') out.push({ uid: order.customerId, notice: { title: 'On the way', body: `Order ${orderCode(order)} is on the way.`, link: `/orders/${order.id}` } });
    if (input.to === 'DELIVERED') out.push({ uid: order.customerId, notice: { title: 'Delivered', body: `Order ${orderCode(order)} was delivered. Enjoy!`, link: `/orders/${order.id}` } });
    return out;
  });
  await flush(outbox);
  return { ok: true };
});

/** Cancels an order. Free for the customer before the shop accepts; a reason after that. */
export const cancelOrder = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(cancelOrderInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, input.orderId);
    const actor = actorFor(caller, order);
    if (!actor || actor === 'rider') fail('permission-denied', 'cannot_cancel');
    if (cancelNeedsReason(order.status, actor!) && !input.reason) fail('invalid-argument', 'reason_required');
    const offerSnap = order.offerId ? await tx.get(offersCol().doc(order.offerId)) : null;
    // A customer cancelling after the shop started is a late cancellation: it counts as a strike.
    const lateCancel = actor === 'customer' && cancelNeedsReason(order.status, 'customer');
    const customerSnap = lateCancel ? await tx.get(db.collection('users').doc(order.customerId)) : null;
    if (offerSnap?.exists && offerSnap.get('status') === 'pending') tx.update(offerSnap.ref, { status: 'cancelled', respondedAt: FieldValue.serverTimestamp() });
    if (customerSnap?.exists) addStrike(tx, 'customer', customerSnap, { source: 'late_cancel', ref: order.id, at: Date.now() });
    transition(tx, ref, order, 'CANCELLED', actor!, { cancelReason: input.reason, cancelledBy: actor, offerId: null, expiresAt: null });
    const text = `Order ${orderCode(order)} was cancelled by the ${actor}.`;
    const others = [order.customerId, order.shopOwnerId, order.riderId ?? offerSnap?.get('riderId')].filter((u): u is string => !!u && u !== caller.uid);
    return others.map((uid) => ({ uid, notice: { title: 'Order cancelled', body: text, link: uid === order.customerId ? `/orders/${order.id}` : uid === order.shopOwnerId ? '/shop/orders' : '/rider/jobs' } })) as Outbox;
  });
  await flush(outbox);
  return { ok: true };
});

/** Records that the shop (food) or the rider (delivery fee) was paid. Hatod handles no money. */
export const markPaid = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(markPaidInput, req.data);
  await db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, input.orderId);
    const actor = actorFor(caller, order);
    const allowed = input.party === 'shop' ? actor === 'shop' : order.selfDelivery ? actor === 'shop' : actor === 'rider';
    if (!allowed) fail('permission-denied', 'not_your_payment');
    if (!['RIDER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'SHOP_ACCEPTED', 'RIDER_OFFERED'].includes(order.status)) fail('failed-precondition', 'not_payable');
    tx.update(ref, { [input.party === 'shop' ? 'shopPaid' : 'riderPaid']: true, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

/** The shop marks the food ready; the rider gets told. */
export const markReady = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const { orderId } = parseInput(orderIdInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, orderId);
    if (actorFor(caller, order) !== 'shop') fail('permission-denied', 'not_your_order');
    if (!['SHOP_ACCEPTED', 'RIDER_OFFERED', 'RIDER_ASSIGNED'].includes(order.status)) fail('failed-precondition', 'not_preparing');
    tx.update(ref, { ready: true, readyAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return order.riderId
      ? ([{ uid: order.riderId, notice: { title: 'Order ready', body: `Order ${orderCode(order)} is ready at ${order.shopName}.`, link: '/rider/jobs' } }] as Outbox)
      : [];
  });
  await flush(outbox);
  return { ok: true };
});

/** Apps call this when a countdown reaches zero, so timeouts apply at once instead of at the next sweep. */
export const nudgeOrder = onCall(withSecrets, async (req) => {
  const caller = requireAuth(req);
  const { orderId } = parseInput(orderIdInput, req.data);
  const snap = await ordersCol().doc(orderId).get();
  if (!snap.exists) fail('not-found', 'order_not_found');
  const order = snap.data() as OrderDoc;
  const offerRider = order.offerId ? (await offersCol().doc(order.offerId).get()).get('riderId') : null;
  if (!actorFor(caller, order) && caller.uid !== offerRider) fail('permission-denied', 'not_your_order');
  await flush(await applyTimeouts(orderId));
  return { ok: true };
});
