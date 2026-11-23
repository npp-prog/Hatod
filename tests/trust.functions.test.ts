import { Timestamp } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { sweep } from '../functions/src/jobs/sweep';
import { adminAuth, adminDb, callable, signInAsPhoneUser } from './helpers';

const T = 'trusttown--test';
type Person = Awaited<ReturnType<typeof signInAsPhoneUser>>;
let cust: Person, owner: Person, rider: Person, coord: Person, otherCoord: Person, stranger: Person;
let n = 0;

async function person(phone: string, roles: string[], claims: Record<string, unknown> = {}) {
  const p = await signInAsPhoneUser(phone);
  await adminDb.doc(`users/${p.uid}`).set({ uid: p.uid, name: `P${phone.slice(-3)}`, phone, roles, status: 'active', ratingAvg: 0, ratingCount: 0 });
  await adminAuth.setCustomUserClaims(p.uid, { roles, ...claims });
  await p.user.getIdToken(true);
  return p;
}

/** Strikes are kept in their own collection that no client can read. */
const strikesOf = async (type: string, id: string) => ((await adminDb.doc(`strikes/${type}_${id}`).get()).get('list') ?? []) as { source: string }[];
const clearStrikes = (type: string, id: string) => adminDb.doc(`strikes/${type}_${id}`).delete();

const call = (p: Person, name: string, data: unknown) => callable(p.app, name)(data).then((r) => r.data);
async function failsWith(promise: Promise<unknown>, message: string) {
  const err = (await promise.then(() => null, (e) => e)) as { message?: string } | null;
  expect(err, `expected ${message}`).not.toBeNull();
  expect(String(err!.message).replace(/\s*\[\d{3}\]$/, '')).toBe(message);
}

/** An order created directly in a given state (the order flow itself is tested in orders.functions.test.ts). */
async function makeOrder(status: string, over: Record<string, unknown> = {}) {
  const id = `trust_order_${Date.now()}_${n++}`;
  const now = Timestamp.now();
  const history = ['PLACED', 'SHOP_ACCEPTED', 'RIDER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED'];
  const upto = history.indexOf(status);
  await adminDb.doc(`orders/${id}`).set({
    requestId: `req${id}`,
    townId: T,
    customerId: cust.uid,
    customerName: 'Carla',
    shopId: 'trust-shop',
    shopOwnerId: owner.uid,
    shopName: 'Trust Shop',
    riderId: upto >= 2 ? rider.uid : null,
    rider: upto >= 2 ? { name: 'Rico' } : null,
    selfDelivery: false,
    status,
    statusHistory: (upto >= 0 ? history.slice(0, upto + 1) : ['PLACED']).map((s) => ({ status: s, at: now, by: 'system' })),
    participants: [cust.uid, owner.uid, ...(upto >= 2 ? [rider.uid] : [])],
    offerId: null,
    ...over,
  });
  return id;
}

beforeAll(async () => {
  cust = await person('+639176660001', ['customer']);
  owner = await person('+639176660002', ['customer', 'shop'], { shops: ['trust-shop'] });
  rider = await person('+639176660003', ['customer', 'rider']);
  coord = await person('+639176660004', ['customer', 'coordinator'], { coordTowns: [T] });
  otherCoord = await person('+639176660005', ['customer', 'coordinator'], { coordTowns: ['elsewhere'] });
  stranger = await person('+639176660006', ['customer']);
  await adminDb.doc(`towns/${T}`).set({ name: 'Trusttown', isLive: true, coordinatorIds: [coord.uid] });
  await adminDb.doc('shops/trust-shop').set({ ownerId: owner.uid, townId: T, name: 'Trust Shop', status: 'active', verified: true, ratingAvg: 0, ratingCount: 0 });
  await adminDb.doc(`riders/${rider.uid}`).set({ userId: rider.uid, townId: T, name: 'Rico', status: 'active', verified: true, online: true, ratingAvg: 4, ratingCount: 1 });
});

describe('ratings', () => {
  it('both sides rate each other once after completion and averages update', async () => {
    const id = await makeOrder('COMPLETED');
    await call(cust, 'submitRating', { orderId: id, toType: 'shop', stars: 5, tags: ['tasty', 'made_up_tag'], comment: 'Masarap!' });
    await call(cust, 'submitRating', { orderId: id, toType: 'rider', stars: 2, tags: ['late'] });
    await call(owner, 'submitRating', { orderId: id, toType: 'customer', stars: 4 });
    await call(rider, 'submitRating', { orderId: id, toType: 'customer', stars: 5 });
    expect((await adminDb.doc('shops/trust-shop').get()).data()).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    expect((await adminDb.doc(`riders/${rider.uid}`).get()).data()).toMatchObject({ ratingAvg: 3, ratingCount: 2 });
    expect((await adminDb.doc(`users/${cust.uid}`).get()).data()).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
    const r = (await adminDb.doc(`ratings/${id}_${cust.uid}_shop`).get()).data()!;
    expect(r).toMatchObject({ stars: 5, tags: ['tasty'], comment: 'Masarap!', fromRole: 'customer', toId: 'trust-shop' });
    expect((await adminDb.doc(`orders/${id}`).get()).get('ratings')).toEqual({ customer_shop: true, customer_rider: true, shop_customer: true, rider_customer: true });
    // Only flags on the order: nobody reads the stars they were given there.
    await failsWith(call(cust, 'submitRating', { orderId: id, toType: 'shop', stars: 1 }), 'already_rated');
  });
  it('only parties rate, only the other side, only after completion', async () => {
    const done = await makeOrder('COMPLETED');
    await failsWith(call(stranger, 'submitRating', { orderId: done, toType: 'shop', stars: 1 }), 'not_on_order');
    await failsWith(call(owner, 'submitRating', { orderId: done, toType: 'rider', stars: 1 }), 'cannot_rate_target');
    await failsWith(call(rider, 'submitRating', { orderId: done, toType: 'shop', stars: 5 }), 'cannot_rate_target');
    const open = await makeOrder('PICKED_UP');
    await failsWith(call(cust, 'submitRating', { orderId: open, toType: 'shop', stars: 5 }), 'not_completed');
    const old = await makeOrder('COMPLETED');
    await adminDb.doc(`orders/${old}`).update({ statusHistory: [{ status: 'COMPLETED', at: Timestamp.fromMillis(Date.now() - 8 * 24 * 3600_000), by: 'system' }] });
    await failsWith(call(cust, 'submitRating', { orderId: old, toType: 'shop', stars: 5 }), 'rating_window_closed');
  });
});

describe('reports and strikes', () => {
  it('a report goes to the town queue; confirmed reports are strikes; 3 in 30 days suspend for 7 days', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await makeOrder('COMPLETED');
      await call(cust, 'submitReport', { orderId: id, targetType: 'rider', category: 'late', details: `Rider was over an hour late (${i}).` });
      ids.push(`${id}_${cust.uid}_rider`);
    }
    const report = (await adminDb.doc(`reports/${ids[0]}`).get()).data()!;
    expect(report).toMatchObject({ townId: T, targetType: 'rider', targetId: rider.uid, targetName: 'Rico', status: 'open', urgent: false });
    await failsWith(call(otherCoord, 'resolveReport', { reportId: ids[0], resolution: 'confirmed', note: 'checked' }), 'not_your_town');
    await call(coord, 'resolveReport', { reportId: ids[0], resolution: 'confirmed', note: 'Confirmed with the shop.' });
    await call(coord, 'resolveReport', { reportId: ids[1], resolution: 'dismissed', note: 'Customer gave the wrong address.' });
    await call(coord, 'resolveReport', { reportId: ids[2], resolution: 'confirmed', note: 'Confirmed.' });
    let r = (await adminDb.doc(`riders/${rider.uid}`).get()).data()!;
    expect(await strikesOf('rider', rider.uid)).toHaveLength(2);
    expect(r.strikes).toBeUndefined();
    expect(r.status).toBe('active');
    // a third confirmed report from another order
    const id = await makeOrder('COMPLETED');
    await call(owner, 'submitReport', { orderId: id, targetType: 'rider', category: 'rude', details: 'Shouted at the staff at pickup.' });
    await call(coord, 'resolveReport', { reportId: `${id}_${owner.uid}_rider`, resolution: 'confirmed', note: 'Staff and CCTV confirm.' });
    r = (await adminDb.doc(`riders/${rider.uid}`).get()).data()!;
    expect(r).toMatchObject({ status: 'suspended', suspendedReason: 'strikes', online: false });
    const days = (r.suspendedUntil.toMillis() - Date.now()) / (24 * 3600_000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    await failsWith(call(coord, 'resolveReport', { reportId: ids[0], resolution: 'dismissed', note: 'again' }), 'already_resolved');

    // the suspension ends by itself after 7 days
    await sweep(Date.now() + 7 * 24 * 3600_000 + 60_000);
    r = (await adminDb.doc(`riders/${rider.uid}`).get()).data()!;
    expect(r).toMatchObject({ status: 'active', suspendedReason: null, suspendedUntil: null });
    await clearStrikes('rider', rider.uid);
  });

  it('a safety report suspends at once once people have met, until reviewed', async () => {
    const id = await makeOrder('DELIVERED');
    await call(rider, 'submitReport', { orderId: id, targetType: 'customer', category: 'safety', details: 'Customer threatened me with a knife.' });
    expect((await adminDb.doc(`users/${cust.uid}`).get()).data()).toMatchObject({ status: 'suspended', suspendedReason: 'safety_review' });
    const sms = await adminDb.collection('smsOutbox').where('to', '==', '+639176660004').get();
    expect(sms.docs.some((d) => String(d.get('message')).includes('Safety report'))).toBe(true);
    // dismissed -> lifted
    await call(coord, 'resolveReport', { reportId: `${id}_${rider.uid}_customer`, resolution: 'dismissed', note: 'Misunderstanding, both parties called.' });
    expect((await adminDb.doc(`users/${cust.uid}`).get()).data()).toMatchObject({ status: 'active', suspendedReason: null });
  });

  it('a confirmed safety report keeps the person suspended until an admin lifts it', async () => {
    const id = await makeOrder('PICKED_UP');
    await call(cust, 'submitReport', { orderId: id, targetType: 'rider', category: 'safety', details: 'Rider was drunk and drove dangerously.' });
    await call(coord, 'resolveReport', { reportId: `${id}_${cust.uid}_rider`, resolution: 'confirmed', note: 'Witnesses confirm.' });
    const r = (await adminDb.doc(`riders/${rider.uid}`).get()).data()!;
    expect(r).toMatchObject({ status: 'suspended', suspendedReason: 'safety', suspendedUntil: null });
    await sweep(Date.now() + 30 * 24 * 3600_000);
    expect((await adminDb.doc(`riders/${rider.uid}`).get()).get('status')).toBe('suspended');
    await adminDb.doc(`riders/${rider.uid}`).update({ status: 'active', suspendedReason: null });
    await clearStrikes('rider', rider.uid);
  });

  it('a safety report before anyone met does not suspend', async () => {
    const id = await makeOrder('PLACED');
    await call(owner, 'submitReport', { orderId: id, targetType: 'customer', category: 'safety', details: 'Threatening messages to the shop.' });
    expect((await adminDb.doc(`users/${cust.uid}`).get()).get('status')).toBe('active');
  });

  it('one report per person per order; categories must fit; strangers cannot report', async () => {
    const id = await makeOrder('COMPLETED');
    await call(cust, 'submitReport', { orderId: id, targetType: 'shop', category: 'wrong_order', details: 'Got pancit instead of adobo.' });
    await failsWith(call(cust, 'submitReport', { orderId: id, targetType: 'shop', category: 'rude', details: 'And they were rude too.' }), 'already_reported');
    await failsWith(call(stranger, 'submitReport', { orderId: id, targetType: 'shop', category: 'rude', details: 'I was not even there.' }), 'not_on_order');
    await expect(call(cust, 'submitReport', { orderId: id, targetType: 'rider', category: 'wrong_order', details: 'Rider gave wrong order.' })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });
});

describe('limits on instant safety suspensions', () => {
  it('not for shops, not for old orders, and at most 2 per reporter in 30 days', async () => {
    const shopCase = await makeOrder('DELIVERED');
    await call(cust, 'submitReport', { orderId: shopCase, targetType: 'shop', category: 'safety', details: 'Food made my whole family sick.' });
    expect((await adminDb.doc('shops/trust-shop').get()).get('status')).toBe('active');

    const old = await makeOrder('COMPLETED');
    const long = Timestamp.fromMillis(Date.now() - 3 * 24 * 3600_000);
    await adminDb.doc(`orders/${old}`).update({ statusHistory: [{ status: 'RIDER_ASSIGNED', at: long, by: 'rider' }, { status: 'COMPLETED', at: long, by: 'system' }] });
    await call(owner, 'submitReport', { orderId: old, targetType: 'customer', category: 'safety', details: 'Something from three days ago.' });
    expect((await adminDb.doc(`users/${cust.uid}`).get()).get('status')).toBe('active');

    // stranger plays a reporter who files safety reports again and again
    const reporter = await person('+639176660007', ['customer']);
    const statuses: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await makeOrder('PICKED_UP', { customerId: reporter.uid, participants: [reporter.uid, owner.uid, rider.uid] });
      await call(reporter, 'submitReport', { orderId: id, targetType: 'rider', category: 'safety', details: `Unsafe driving, report ${i}.` });
      statuses.push((await adminDb.doc(`riders/${rider.uid}`).get()).get('status'));
      await call(coord, 'resolveReport', { reportId: `${id}_${reporter.uid}_rider`, resolution: 'dismissed', note: 'Not supported.' });
    }
    expect(statuses).toEqual(['suspended', 'suspended', 'active']);
  });
});

describe('a ban is final', () => {
  it('reports, strikes, the sweep and coordinators cannot turn a ban into something that lifts', async () => {
    const admin = await person('+639176660008', ['customer', 'admin']);
    await call(admin, 'setAccountStatus', { type: 'rider', id: rider.uid, action: 'ban', note: 'Theft confirmed by police.' });
    const banned = async () => expect((await adminDb.doc(`riders/${rider.uid}`).get()).get('status')).toBe('banned');

    // a friend files a safety report, the coordinator dismisses it
    const id = await makeOrder('PICKED_UP');
    await call(cust, 'submitReport', { orderId: id, targetType: 'rider', category: 'safety', details: 'Planted report to reset the ban.' });
    await banned();
    await call(coord, 'resolveReport', { reportId: `${id}_${cust.uid}_rider`, resolution: 'dismissed', note: 'Dismissed.' });
    await banned();

    // three confirmed strikes, then 7 days pass
    for (let i = 0; i < 3; i++) {
      const o = await makeOrder('COMPLETED');
      await call(owner, 'submitReport', { orderId: o, targetType: 'rider', category: 'rude', details: `Rude again, number ${i}.` });
      await call(coord, 'resolveReport', { reportId: `${o}_${owner.uid}_rider`, resolution: 'confirmed', note: 'Confirmed.' });
    }
    await banned();
    await sweep(Date.now() + 8 * 24 * 3600_000);
    await banned();

    await failsWith(call(coord, 'setAccountStatus', { type: 'rider', id: rider.uid, action: 'suspend', note: 'Overwrite the ban.' }), 'already_banned');
    await failsWith(call(coord, 'setAccountStatus', { type: 'rider', id: rider.uid, action: 'reinstate', note: 'Let him back.' }), 'admin_only');
    await call(admin, 'setAccountStatus', { type: 'rider', id: rider.uid, action: 'reinstate', note: 'Cleared on appeal.' });
    expect((await adminDb.doc(`riders/${rider.uid}`).get()).get('status')).toBe('active');
    expect(await strikesOf('rider', rider.uid)).toEqual([]);
  });
});

describe('late cancellations', () => {
  it('count as strikes: the third in 30 days suspends the customer', async () => {
    await clearStrikes('customer', cust.uid);
    await adminDb.doc(`users/${cust.uid}`).update({ status: 'active' });
    for (let i = 0; i < 3; i++) {
      const id = await makeOrder('SHOP_ACCEPTED', { riderId: null, rider: null });
      await call(cust, 'cancelOrder', { orderId: id, reason: 'changed_mind' });
    }
    const u = (await adminDb.doc(`users/${cust.uid}`).get()).data()!;
    expect((await strikesOf('customer', cust.uid)).map((x) => x.source)).toEqual(['late_cancel', 'late_cancel', 'late_cancel']);
    expect(u).toMatchObject({ status: 'suspended', suspendedReason: 'strikes' });
    // and a suspended customer cannot order
    await adminDb.doc(`users/${cust.uid}`).update({ status: 'active', suspendedReason: null, suspendedUntil: null });
    await clearStrikes('customer', cust.uid);
  });
  it('a free cancel (before the shop accepts) is not a strike', async () => {
    const id = await makeOrder('PLACED', { riderId: null, rider: null, participants: [] });
    await call(cust, 'cancelOrder', { orderId: id, reason: null });
    expect(await strikesOf('customer', cust.uid)).toEqual([]);
  });
});
