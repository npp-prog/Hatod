import { Timestamp } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_CARD } from '@hatod/shared';
import { sweep } from '../functions/src/jobs/sweep';
import { adminAuth, adminDb, callable, signInAsPhoneUser } from './helpers';

/**
 * End-to-end order flow against the emulators: customer, shop owner and two
 * riders, each a real signed-in client calling the real functions.
 */
const T = 'ordertown--test';
const B = (n: string) => `${T}__${n}`;
const ALWAYS = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [{ open: '00:00', close: '24:00' }]]));
let seq = 0;

type Person = Awaited<ReturnType<typeof signInAsPhoneUser>>;
let customer: Person;
let owner: Person;
let selfOwner: Person;
let rider1: Person;
let rider2: Person;
let stranger: Person;

async function person(phone: string, roles: string[], extra: Record<string, unknown> = {}, shops: string[] = []) {
  const p = await signInAsPhoneUser(phone);
  await adminDb.doc(`users/${p.uid}`).set({ uid: p.uid, name: `User ${phone.slice(-4)}`, phone, roles, status: 'active', shopIds: shops, ...extra });
  await adminAuth.setCustomUserClaims(p.uid, { roles, shops });
  await p.user.getIdToken(true);
  return p;
}

const shopDoc = (ownerId: string, over: Record<string, unknown> = {}) => ({
  ownerId,
  townId: T,
  name: 'Test Carinderia',
  category: 'meals',
  contactPhone: '+639175550001',
  barangayId: B('poblacion'),
  barangayName: 'Poblacion',
  landmark: 'By the market',
  geo: { lat: 11.1, lng: 122.64 },
  hours: ALWAYS,
  closedOn: null,
  paymentMethods: ['cash', 'gcash'],
  hasOwnRider: false,
  selfDeliveryFee: 0,
  verified: true,
  status: 'active',
  ...over,
});

const riderDoc = (uid: string, over: Record<string, unknown> = {}) => ({
  userId: uid,
  townId: T,
  name: `Rider ${uid.slice(-3)}`,
  plateNo: '123 ABC',
  vehicleDesc: 'Honda',
  photoUrl: null,
  verified: true,
  status: 'active',
  online: true,
  rainOn: false,
  servedBarangayIds: [B('poblacion'), B('mabini')],
  maxKm: 10,
  rateCard: DEFAULT_RATE_CARD,
  completedCount: 0,
  lastActiveAt: Timestamp.now(),
  ...over,
});

beforeAll(async () => {
  await adminDb.doc(`towns/${T}`).set({ name: 'Ordertown', isLive: true });
  await adminDb.doc(`barangays/${B('poblacion')}`).set({ townId: T, name: 'Poblacion', centroid: { lat: 11.1, lng: 122.64 } });
  await adminDb.doc(`barangays/${B('mabini')}`).set({ townId: T, name: 'Mabini', centroid: { lat: 11.12, lng: 122.64 } });

  owner = await person('+639175550001', ['customer', 'shop'], {}, ['shop-a']);
  selfOwner = await person('+639175550002', ['customer', 'shop'], {}, ['shop-self']);
  customer = await person('+639175550003', ['customer'], { completedOrders: 5 });
  rider1 = await person('+639175550004', ['customer', 'rider']);
  rider2 = await person('+639175550005', ['customer', 'rider']);
  stranger = await person('+639175550006', ['customer']);

  await adminDb.doc('shops/shop-a').set(shopDoc(owner.uid));
  await adminDb.doc('shops/shop-self').set(shopDoc(selfOwner.uid, { name: 'Self Delivery Lechon', hasOwnRider: true, selfDeliveryFee: 40 }));
  await adminDb.doc('shops/shop-closed').set(shopDoc(owner.uid, { name: 'Closed Shop', closedOn: null, hours: {} }));
  for (const shop of ['shop-a', 'shop-self', 'shop-closed']) {
    const items = adminDb.collection(`shops/${shop}/menuItems`);
    await items.doc('silog').set({ name: 'Tapsilog', price: 80, variants: [{ name: 'Regular', price: 80 }, { name: 'Large', price: 100 }], addOns: [{ name: 'Egg', price: 12 }], available: true });
    await items.doc('adobo').set({ name: 'Adobo', price: 85, variants: [], addOns: [], available: true });
    await items.doc('flan').set({ name: 'Leche flan', price: 40, variants: [], addOns: [], available: false });
    await items.doc('lechon').set({ name: 'Lechon whole', price: 900, variants: [], addOns: [], available: true });
  }
  await adminDb.doc(`riders/${rider1.uid}`).set(riderDoc(rider1.uid));
  await adminDb.doc(`riders/${rider1.uid}/private/info`).set({ phone: '+639175550004' });
  await adminDb.doc(`riders/${rider2.uid}`).set(riderDoc(rider2.uid, { rateCard: { ...DEFAULT_RATE_CARD, base: 20 } }));
  await adminDb.doc(`riders/${rider2.uid}/private/info`).set({ phone: '+639175550005' });
  await adminDb.doc('addresses/addr-c').set({
    userId: customer.uid,
    townId: T,
    label: 'Home',
    barangayId: B('mabini'),
    barangayName: 'Mabini',
    street: '',
    landmark: 'Blue gate',
    geo: { lat: 11.12, lng: 122.64 },
    isDefault: true,
  });
});

// Each test starts with no open orders, so the 5-open-orders limit only bites where tested.
beforeEach(async () => {
  if (!customer) return;
  const open = await adminDb.collection('orders').where('customerId', '==', customer.uid).get();
  await Promise.all(open.docs.filter((d) => !['COMPLETED', 'CANCELLED', 'EXPIRED', 'SHOP_DECLINED'].includes(d.get('status'))).map((d) => d.ref.update({ status: 'CANCELLED' })));
});

const call = <O = { ok: boolean }>(p: Person, name: string, data: unknown) => callable<unknown, O>(p.app, name)(data).then((r) => r.data);
const order = async (id: string) => (await adminDb.doc(`orders/${id}`).get()).data()!;
const place = (over: Record<string, unknown> = {}) =>
  call<{ orderId: string; duplicate: boolean }>(customer, 'placeOrder', {
    requestId: `req_${Date.now()}_${seq++}`,
    shopId: 'shop-a',
    lines: [
      { itemId: 'silog', variant: 'Large', addOns: ['Egg'], qty: 2, note: 'spicy' },
      { itemId: 'adobo', variant: null, addOns: [], qty: 1 },
    ],
    addressId: 'addr-c',
    paymentMethod: 'gcash',
    riderId: rider1.uid,
    ...over,
  });
/** Expects a callable to fail with this message code (e.g. 'shop_closed'). */
async function failsWith(promise: Promise<unknown>, message: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message?: string },
  );
  expect(err, `expected failure ${message}`).not.toBeNull();
  // Newer clients append the HTTP status: "shop_closed [400]".
  expect(String(err!.message).replace(/\s*\[\d{3}\]$/, '')).toBe(message);
}

const pendingOffer = async (orderId: string) => {
  const o = await order(orderId);
  return o.offerId as string;
};

describe('placing an order', () => {
  it('prices everything on the server, quotes the chosen rider and tells the shop', async () => {
    const { orderId } = await place();
    const o = await order(orderId);
    expect(o.status).toBe('PLACED');
    expect(o.items.map((i: { unitPrice: number }) => i.unitPrice)).toEqual([112, 85]);
    expect(o.itemsTotal).toBe(2 * 112 + 85);
    // 11.10 -> 11.12 is about 2.22 km straight, × 1.3 = 2.9 km -> billed 3.0 km: 30 + 30 = ₱60
    expect(o).toMatchObject({ distanceEstimate: true, deliveryFee: 60, feeLocked: false, chosenRiderId: rider1.uid, participants: [customer.uid, owner.uid] });
    expect(o.dropoff).toMatchObject({ barangayName: 'Mabini', landmark: 'Blue gate' });
    const sms = await adminDb.collection('smsOutbox').where('to', '==', '+639175550001').get();
    expect(sms.docs.some((d) => String(d.get('message')).includes('New order'))).toBe(true);
  });

  it('is idempotent: retrying the same request returns the same order', async () => {
    const requestId = `req_retry_${Date.now()}`;
    const a = await place({ requestId });
    const b = await place({ requestId });
    expect(b).toEqual({ orderId: a.orderId, duplicate: true });
  });

  it.each([
    [{ lines: [{ itemId: 'flan', variant: null, addOns: [], qty: 1 }] }, 'item_unavailable'],
    [{ lines: [{ itemId: 'silog', variant: 'Jumbo', addOns: [], qty: 1 }] }, 'item_changed'],
    [{ lines: [{ itemId: 'adobo', variant: null, addOns: ['Free lechon'], qty: 1 }] }, 'item_changed'],
    [{ paymentMethod: 'maya' }, 'payment_not_accepted'],
    [{ shopId: 'shop-closed' }, 'shop_closed'],
    [{ riderId: null }, 'rider_required'],
  ])('refuses %o (%s)', async (over, message) => {
    await failsWith(place(over), message);
  });

  it('caps a new customer\'s first orders at ₱1,000 of food', async () => {
    await adminDb.doc(`users/${customer.uid}`).update({ completedOrders: 0 });
    await failsWith(place({ lines: [{ itemId: 'lechon', variant: null, addOns: [], qty: 2 }] }), 'new_customer_cap');
    await adminDb.doc(`users/${customer.uid}`).update({ completedOrders: 5 });
  });

  it('refuses an offline rider and someone else\'s address', async () => {
    await adminDb.doc(`riders/${rider2.uid}`).update({ online: false });
    await failsWith(place({ riderId: rider2.uid }), 'rider_unavailable');
    await adminDb.doc(`riders/${rider2.uid}`).update({ online: true });
    await failsWith(call(stranger, 'placeOrder', { requestId: `req_s_${Date.now()}`, shopId: 'shop-a', lines: [{ itemId: 'adobo', variant: null, addOns: [], qty: 1 }], addressId: 'addr-c', paymentMethod: 'cash', riderId: rider1.uid }), 'address_not_found');
  });
});

describe('the full delivery', () => {
  it('shop accepts -> offer -> rider declines -> customer picks another -> accepted -> delivered -> completed', async () => {
    const { orderId } = await place();

    // only the shop can accept
    await expect(call(customer, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 20 })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await call(owner, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 20 });
    let o = await order(orderId);
    expect(o.status).toBe('RIDER_OFFERED');
    expect(o.statusHistory.map((h: { status: string }) => h.status)).toEqual(['PLACED', 'SHOP_ACCEPTED', 'RIDER_OFFERED']);
    const offer1 = o.offerId;
    expect((await adminDb.doc(`riderOffers/${offer1}`).get()).data()).toMatchObject({ riderId: rider1.uid, fee: 60, status: 'pending' });

    // the other rider cannot answer someone else's offer
    await expect(call(rider2, 'riderRespondOffer', { offerId: offer1, accept: true })).rejects.toMatchObject({ code: 'functions/not-found' });
    await call(rider1, 'riderRespondOffer', { offerId: offer1, accept: false });
    o = await order(orderId);
    expect(o).toMatchObject({ status: 'SHOP_ACCEPTED', chosenRiderId: null, offerId: null, declinedRiderIds: [rider1.uid] });

    // the customer cannot pick the rider who declined, but can pick another
    await failsWith(call(customer, 'chooseRider', { orderId, riderId: rider1.uid }), 'rider_declined');
    await call(customer, 'chooseRider', { orderId, riderId: rider2.uid });
    o = await order(orderId);
    expect(o).toMatchObject({ status: 'RIDER_OFFERED', chosenRiderId: rider2.uid, deliveryFee: 50 });

    await call(rider2, 'riderRespondOffer', { offerId: o.offerId, accept: true });
    o = await order(orderId);
    expect(o).toMatchObject({ status: 'RIDER_ASSIGNED', riderId: rider2.uid, deliveryFee: 50, feeLocked: true });
    expect(o.rider).toMatchObject({ phone: '+639175550005', plateNo: '123 ABC' });
    expect(o.participants).toContain(rider2.uid);

    // steps in order, by the right people
    await expect(call(customer, 'advanceOrder', { orderId, to: 'PICKED_UP' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await expect(call(rider2, 'advanceOrder', { orderId, to: 'DELIVERED' })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    await call(owner, 'markReady', { orderId });
    await call(rider2, 'advanceOrder', { orderId, to: 'PICKED_UP' });
    await call(rider2, 'advanceOrder', { orderId, to: 'DELIVERED' });
    await call(owner, 'markPaid', { orderId, party: 'shop' });
    await call(rider2, 'markPaid', { orderId, party: 'rider' });
    await expect(call(rider2, 'markPaid', { orderId, party: 'shop' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await expect(call(rider2, 'advanceOrder', { orderId, to: 'COMPLETED' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    const before = Number((await adminDb.doc(`users/${customer.uid}`).get()).get('completedOrders'));
    await call(customer, 'advanceOrder', { orderId, to: 'COMPLETED' });
    o = await order(orderId);
    expect(o).toMatchObject({ status: 'COMPLETED', ready: true, shopPaid: true, riderPaid: true });
    expect((await adminDb.doc(`users/${customer.uid}`).get()).get('completedOrders')).toBe(before + 1);
    expect((await adminDb.doc(`riders/${rider2.uid}`).get()).get('completedCount')).toBe(1);
  });

  it('only one acceptance wins, even when tapped twice at once', async () => {
    const { orderId } = await place();
    await call(owner, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 15 });
    const offerId = await pendingOffer(orderId);
    const results = await Promise.allSettled([
      call(rider1, 'riderRespondOffer', { offerId, accept: true }),
      call(rider1, 'riderRespondOffer', { offerId, accept: true }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const o = await order(orderId);
    expect(o.statusHistory.filter((h: { status: string }) => h.status === 'RIDER_ASSIGNED')).toHaveLength(1);
  });

  it('a shop that delivers itself skips riders', async () => {
    const { orderId } = await place({ shopId: 'shop-self', riderId: null, lines: [{ itemId: 'adobo', variant: null, addOns: [], qty: 1 }] });
    expect(await order(orderId)).toMatchObject({ selfDelivery: true, deliveryFee: 40, feeLocked: true });
    await call(selfOwner, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 10 });
    expect((await order(orderId)).status).toBe('RIDER_ASSIGNED');
    await call(selfOwner, 'advanceOrder', { orderId, to: 'PICKED_UP' });
    await call(selfOwner, 'advanceOrder', { orderId, to: 'DELIVERED' });
    await call(selfOwner, 'markPaid', { orderId, party: 'rider' });
    expect(await order(orderId)).toMatchObject({ status: 'DELIVERED', riderPaid: true });
  });

  it('a declined order tells the customer why', async () => {
    const { orderId } = await place();
    await call(owner, 'shopRespondOrder', { orderId, accept: false, reason: 'sold_out' });
    expect(await order(orderId)).toMatchObject({ status: 'SHOP_DECLINED', declineReason: 'sold_out' });
  });
});

describe('cancelling', () => {
  it('free before the shop accepts, needs a reason after', async () => {
    const a = await place();
    await call(customer, 'cancelOrder', { orderId: a.orderId });
    expect(await order(a.orderId)).toMatchObject({ status: 'CANCELLED', cancelledBy: 'customer', cancelReason: null });

    const b = await place();
    await call(owner, 'shopRespondOrder', { orderId: b.orderId, accept: true, readyInMinutes: 20 });
    const offerId = await pendingOffer(b.orderId);
    await failsWith(call(customer, 'cancelOrder', { orderId: b.orderId }), 'reason_required');
    await call(customer, 'cancelOrder', { orderId: b.orderId, reason: 'too_long' });
    expect(await order(b.orderId)).toMatchObject({ status: 'CANCELLED', cancelReason: 'too_long' });
    expect((await adminDb.doc(`riderOffers/${offerId}`).get()).get('status')).toBe('cancelled');
  });
  it('riders and strangers cannot cancel; nobody cancels after pickup except admin', async () => {
    const { orderId } = await place();
    await expect(call(stranger, 'cancelOrder', { orderId, reason: 'other' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await call(owner, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 20 });
    await call(rider1, 'riderRespondOffer', { offerId: await pendingOffer(orderId), accept: true });
    await expect(call(rider1, 'cancelOrder', { orderId, reason: 'other' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await call(rider1, 'advanceOrder', { orderId, to: 'PICKED_UP' });
    await expect(call(customer, 'cancelOrder', { orderId, reason: 'changed_mind' })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
});

describe('timeouts (sweep)', () => {
  it('expires an order the shop did not answer within 10 minutes', async () => {
    const { orderId } = await place();
    await expect(call(owner, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 20 })).resolves.toBeTruthy();
    const late = await place();
    await sweep(Date.now() + 11 * 60_000);
    expect((await order(late.orderId)).status).toBe('EXPIRED');
    expect((await order(orderId)).status).not.toBe('EXPIRED');
  });
  it('expires a rider offer after 60 seconds and lets the customer choose again', async () => {
    const { orderId } = await place();
    await call(owner, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 20 });
    const offerId = await pendingOffer(orderId);
    await sweep(Date.now() + 61_000);
    expect(await order(orderId)).toMatchObject({ status: 'SHOP_ACCEPTED', offerId: null, declinedRiderIds: [rider1.uid] });
    expect((await adminDb.doc(`riderOffers/${offerId}`).get()).get('status')).toBe('expired');
    await expect(call(rider1, 'riderRespondOffer', { offerId, accept: true })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
  it('completes delivered orders after 2 hours and sends idle riders offline', async () => {
    const { orderId } = await place();
    await call(owner, 'shopRespondOrder', { orderId, accept: true, readyInMinutes: 20 });
    await call(rider1, 'riderRespondOffer', { offerId: await pendingOffer(orderId), accept: true });
    await call(rider1, 'advanceOrder', { orderId, to: 'PICKED_UP' });
    await call(rider1, 'advanceOrder', { orderId, to: 'DELIVERED' });
    await adminDb.doc(`riders/${rider2.uid}`).update({ lastActiveAt: Timestamp.fromMillis(Date.now() - 3 * 3600_000) });
    await sweep(Date.now() + 2 * 3600_000 + 1000);
    expect((await order(orderId)).status).toBe('COMPLETED');
    expect((await adminDb.doc(`riders/${rider2.uid}`).get()).get('online')).toBe(false);
    // The simulated clock was 2 hours ahead, so every rider counted as idle: put both back.
    for (const r of [rider1, rider2]) await adminDb.doc(`riders/${r.uid}`).update({ online: true, lastActiveAt: Timestamp.now() });
  });
  it('a participant can apply a due timeout at once (nudge)', async () => {
    const { orderId } = await place();
    await adminDb.doc(`orders/${orderId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expect(call(stranger, 'nudgeOrder', { orderId })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await call(customer, 'nudgeOrder', { orderId });
    expect((await order(orderId)).status).toBe('EXPIRED');
  });
});

describe('limits', () => {
  it('allows at most 5 open orders per customer', async () => {
    const open = await adminDb.collection('orders').where('customerId', '==', customer.uid).get();
    for (const d of open.docs) await d.ref.update({ status: 'COMPLETED' });
    for (let i = 0; i < 5; i++) await place();
    await failsWith(place(), 'too_many_open_orders');
  });
});
