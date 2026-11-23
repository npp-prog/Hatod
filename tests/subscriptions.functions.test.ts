import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { DAY_MS, PRIVACY_VERSION, TERMS_VERSION } from '@hatod/shared';
import { sweepSubscriptions } from '../functions/src/callable/subscriptions';
import { adminAuth, adminDb, callable, signInAsPhoneUser } from './helpers';

const T = 'subtown--test';
type Person = Awaited<ReturnType<typeof signInAsPhoneUser>>;
const call = <O = Record<string, unknown>>(p: Person, name: string, data: unknown) => callable<unknown, O>(p.app, name)(data).then((r) => r.data);
async function failsWith(promise: Promise<unknown>, message: string) {
  const err = (await promise.then(() => null, (e) => e)) as { message?: string } | null;
  expect(err, `expected ${message}`).not.toBeNull();
  expect(String(err!.message).replace(/\s*\[\d{3}\]$/, '')).toBe(message);
}
async function signedUp(phone: string) {
  const p = await signInAsPhoneUser(phone);
  await call(p, 'completeProfile', { name: `Person ${phone.slice(-3)}`, acceptTerms: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
  return p;
}
const sub = async (id: string) => (await adminDb.doc(`subscriptions/${id}`).get()).data()!;

let owner: Person, rider: Person, coord: Person, otherCoord: Person, admin: Person;
let shopId = '';

beforeAll(async () => {
  await adminDb.doc(`towns/${T}`).set({ name: 'Subtown', isLive: true, tier: 'C', coordinatorIds: [], trialEndsAt: null });
  await adminDb.doc(`barangays/${T}__pob`).set({ townId: T, name: 'Poblacion', centroid: { lat: 11.1, lng: 122.6 }, active: true });
  owner = await signedUp('+639178880001');
  const res = await call<{ shopId: string }>(owner, 'registerShop', {
    townId: T, name: 'Sub Shop', category: 'meals', contactPhone: '+639178880001', barangayId: `${T}__pob`, landmark: 'Near the plaza', geo: { lat: 11.1, lng: 122.6 }, paymentMethods: ['cash'],
  });
  shopId = res.shopId;
  await owner.user.getIdToken(true);
  rider = await signedUp('+639178880002');
  await call(rider, 'registerRider', { townId: T, vehicleType: 'motorcycle', vehicleDesc: 'Honda XRM', plateNo: '111 AAA', emergencyContact: { name: 'Mom Rider', phone: '+639178889999', relation: 'Mother' } });
  await rider.user.getIdToken(true);
  await adminDb.doc(`riders/${rider.uid}`).update({ verified: true, verificationStatus: 'approved' });
  for (const [phone, roles, claims] of [
    ['+639178880003', ['customer', 'coordinator'], { coordTowns: [T] }],
    ['+639178880004', ['customer', 'coordinator'], { coordTowns: ['elsewhere'] }],
    ['+639178880005', ['customer', 'admin'], {}],
  ] as const) {
    const p = await signInAsPhoneUser(phone);
    await adminAuth.setCustomUserClaims(p.uid, { roles, ...claims });
    await p.user.getIdToken(true);
    if (phone.endsWith('3')) coord = p;
    else if (phone.endsWith('4')) otherCoord = p;
    else admin = p;
  }
});

describe('a new shop and rider', () => {
  it('start on a 60-day trial, mirrored on their records', async () => {
    const s = await sub(`shop_${shopId}`);
    expect(s).toMatchObject({ planCode: 'shop_standard', status: 'trial', ownerUid: owner.uid, currentPeriodEnd: null });
    expect((s.trialEndsAt - Date.now()) / DAY_MS).toBeGreaterThan(59.9);
    expect((await adminDb.doc(`shops/${shopId}`).get()).data()).toMatchObject({ planCode: 'shop_standard', subscriptionStatus: 'trial' });
    expect((await sub(`rider_${rider.uid}`)).planCode).toBe('rider_monthly');
  });
});

describe('lapses', () => {
  it('unpaid after the trial: grace for 3 days, then lapsed (Basic for shops)', async () => {
    const trialEnd = (await sub(`shop_${shopId}`)).trialEndsAt;
    await sweepSubscriptions(trialEnd + 1000);
    expect((await sub(`shop_${shopId}`)).status).toBe('grace');
    await sweepSubscriptions(trialEnd + 3 * DAY_MS + 1000);
    expect((await sub(`shop_${shopId}`)).status).toBe('lapsed');
    // Make it real: the trial ended 4 days ago (the payment tests below run in real time).
    await adminDb.doc(`subscriptions/shop_${shopId}`).update({ trialEndsAt: Date.now() - 4 * DAY_MS });
    await sweepSubscriptions(Date.now());
    expect((await adminDb.doc(`shops/${shopId}`).get()).get('subscriptionStatus')).toBe('lapsed');
    const sms = await adminDb.collection('smsOutbox').where('to', '==', '+639178880001').get();
    expect(sms.docs.some((d) => String(d.get('message')).includes('now on Basic'))).toBe(true);
  });
});

describe('paying online (mock provider)', () => {
  it('a checkout payment restores the plan; replays do not count twice', async () => {
    const r = await call<{ url: string; checkoutId: string }>(owner, 'startCheckout', { subscriberType: 'shop', periods: 2, method: 'gcash' });
    expect(r.url).toContain('/pay/mock?checkout=');
    const checkout = (await adminDb.doc(`checkouts/${r.checkoutId}`).get()).data()!;
    expect(checkout).toMatchObject({ amount: 398, periods: 2, kind: 'period', status: 'open' });
    await failsWith(call(rider, 'mockCompleteCheckout', { checkoutId: r.checkoutId }), 'checkout_not_found');
    const first = await call<{ duplicate: boolean; status: string }>(owner, 'mockCompleteCheckout', { checkoutId: r.checkoutId });
    expect(first).toEqual({ duplicate: false, status: 'active' });
    const again = await call<{ duplicate: boolean }>(owner, 'mockCompleteCheckout', { checkoutId: r.checkoutId });
    expect(again.duplicate).toBe(true);
    const s = await sub(`shop_${shopId}`);
    expect(s.status).toBe('active');
    expect((s.currentPeriodEnd - Date.now()) / DAY_MS).toBeGreaterThan(59.9);
    expect((await adminDb.collection(`subscriptions/shop_${shopId}/payments`).get()).size).toBe(1);
    expect((await adminDb.doc(`shops/${shopId}`).get()).get('subscriptionStatus')).toBe('active');
  });
  it('free Basic cannot be paid for', async () => {
    await call(owner, 'choosePlan', { subscriberType: 'shop', planCode: 'shop_basic' });
    expect((await adminDb.doc(`shops/${shopId}`).get()).data()).toMatchObject({ planCode: 'shop_basic', subscriptionStatus: 'active' });
    await failsWith(call(owner, 'startCheckout', { subscriberType: 'shop', periods: 1 }), 'free_plan');
    await failsWith(call(owner, 'choosePlan', { subscriberType: 'shop', planCode: 'rider_daily' }), 'plan_not_for_you');
    await call(owner, 'choosePlan', { subscriberType: 'shop', planCode: 'shop_plus' });
    expect((await sub(`shop_${shopId}`)).status).toBe('active'); // paid time carries over
  });
});

describe('cash payments', () => {
  it('the town coordinator records cash with a receipt number, once', async () => {
    const before = (await sub(`shop_${shopId}`)).currentPeriodEnd;
    await failsWith(call(otherCoord, 'recordCashPayment', { subscriptionId: `shop_${shopId}`, receiptNo: 'OR-1001' }), 'not_your_town');
    const r = await call<{ amount: number }>(coord, 'recordCashPayment', { subscriptionId: `shop_${shopId}`, receiptNo: 'or-1001', periods: 1 });
    expect(r.amount).toBe(399); // Shop Plus
    expect((await sub(`shop_${shopId}`)).currentPeriodEnd - before).toBe(30 * DAY_MS);
    await failsWith(call(coord, 'recordCashPayment', { subscriptionId: `shop_${shopId}`, receiptNo: 'OR-1001', periods: 1 }), 'receipt_already_used');
    const pay = (await adminDb.doc(`subscriptions/shop_${shopId}/payments/cash_${T}_OR-1001`).get()).data()!;
    expect(pay).toMatchObject({ method: 'cash', receiptNo: 'OR-1001', recordedBy: coord.uid, amount: 399 });
  });
});

describe('admin prices', () => {
  it('only admins change prices; new checkouts use them', async () => {
    await failsWith(call(coord, 'adminSetPlanPrices', { code: 'shop_plus', prices: { A: 1, B: 1, C: 1 }, active: true }), 'admin_only');
    await call(admin, 'adminSetPlanPrices', { code: 'shop_plus', prices: { A: 499, B: 449, C: 349 }, active: true });
    const r = await call<{ checkoutId: string }>(owner, 'startCheckout', { subscriberType: 'shop', periods: 1 });
    expect((await adminDb.doc(`checkouts/${r.checkoutId}`).get()).get('amount')).toBe(349);
  });
});

describe('Rider Daily', () => {
  it('charges ₱5 once per day online, from a prepaid balance', async () => {
    await call(rider, 'choosePlan', { subscriberType: 'rider', planCode: 'rider_daily' });
    // end the trial
    await adminDb.doc(`subscriptions/rider_${rider.uid}`).update({ trialEndsAt: Date.now() - 1000 });
    await failsWith(call(rider, 'goOnline', {}), 'insufficient_balance');
    await call(coord, 'recordCashPayment', { subscriptionId: `rider_${rider.uid}`, receiptNo: 'OR-2001', topUp: 50 });
    expect((await sub(`rider_${rider.uid}`)).balance).toBe(50);
    expect(await call(rider, 'goOnline', { approxLocation: { lat: 11.1234, lng: 122.6789 } })).toEqual({ ok: true, charged: 5 });
    expect(await call(rider, 'goOnline', {})).toEqual({ ok: true, charged: 0 });
    const s = await sub(`rider_${rider.uid}`);
    expect(s).toMatchObject({ balance: 45, status: 'active' });
    const rd = (await adminDb.doc(`riders/${rider.uid}`).get()).data()!;
    expect(rd).toMatchObject({ online: true, approxLocation: { lat: 11.12, lng: 122.68 } });
    // still online tomorrow: charged again by the daily sweep
    await sweepSubscriptions(Date.now() + DAY_MS);
    expect((await sub(`rider_${rider.uid}`)).balance).toBe(40);
  });
  it('a top-up online works the same way', async () => {
    const r = await call<{ checkoutId: string }>(rider, 'startCheckout', { subscriberType: 'rider', topUp: 100 });
    await call(rider, 'mockCompleteCheckout', { checkoutId: r.checkoutId });
    expect((await sub(`rider_${rider.uid}`)).balance).toBe(140);
  });
  it('a monthly rider after the grace period lapses: taken offline and cannot go online', async () => {
    await adminDb.doc(`subscriptions/rider_${rider.uid}`).update({ trialEndsAt: Date.now() - 4 * DAY_MS });
    await call(rider, 'choosePlan', { subscriberType: 'rider', planCode: 'rider_monthly' });
    expect((await sub(`rider_${rider.uid}`)).status).toBe('lapsed');
    expect((await adminDb.doc(`riders/${rider.uid}`).get()).data()).toMatchObject({ online: false, subscriptionStatus: 'lapsed' });
    await failsWith(call(rider, 'goOnline', {}), 'subscription_lapsed');
  });
});

describe('PayMongo webhook signature', () => {
  it('accepts a correctly signed recent event and refuses everything else', async () => {
    process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_test_secret';
    const { verifyPaymongoSignature } = await import('../functions/src/lib/providers/payments');
    const body = Buffer.from(JSON.stringify({ data: { attributes: { type: 'checkout_session.payment.paid' } } }));
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', 'whsk_test_secret').update(`${t}.${body.toString()}`).digest('hex');
    expect(verifyPaymongoSignature(`t=${t},te=${sig},li=`, body)).toBe(true);
    expect(verifyPaymongoSignature(`t=${t},te=${sig.replace(/.$/, '0')},li=`, body)).toBe(false);
    expect(verifyPaymongoSignature(`t=${t - 3600},te=${sig},li=`, body)).toBe(false);
    expect(verifyPaymongoSignature(undefined, body)).toBe(false);
  });
});
