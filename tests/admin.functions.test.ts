import { Timestamp } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminAuth, adminDb, callable, signInAsPhoneUser } from './helpers';

const T = 'admintown--test';
type Person = Awaited<ReturnType<typeof signInAsPhoneUser>>;
let admin: Person, coord: Person, otherCoord: Person, owner: Person, riderP: Person;

async function person(phone: string, roles: string[], claims: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const p = await signInAsPhoneUser(phone);
  await adminDb.doc(`users/${p.uid}`).set({ uid: p.uid, name: `P${phone.slice(-3)}`, phone, roles, status: 'active', ...extra });
  await adminAuth.setCustomUserClaims(p.uid, { roles, ...claims });
  await p.user.getIdToken(true);
  return p;
}
const call = <O = { ok: boolean }>(p: Person, name: string, data: unknown) => callable<unknown, O>(p.app, name)(data).then((r) => r.data);
async function failsWith(promise: Promise<unknown>, message: string) {
  const err = (await promise.then(() => null, (e) => e)) as { message?: string } | null;
  expect(err, `expected ${message}`).not.toBeNull();
  expect(String(err!.message).replace(/\s*\[\d{3}\]$/, '')).toBe(message);
}

beforeAll(async () => {
  admin = await person('+639177770001', ['customer', 'admin']);
  coord = await person('+639177770002', ['customer', 'coordinator'], { coordTowns: [T] });
  otherCoord = await person('+639177770003', ['customer', 'coordinator'], { coordTowns: ['elsewhere'] });
  owner = await person('+639177770004', ['customer', 'shop'], { shops: ['adm-shop'] }, { defaultTownId: T });
  riderP = await person('+639177770005', ['customer', 'rider'], {}, { defaultTownId: T });
  await adminDb.doc('shops/adm-shop').set({ ownerId: owner.uid, townId: T, name: 'Pending Bakery', verified: false, verificationStatus: 'pending', status: 'active' });
  await adminDb.doc(`riders/${riderP.uid}`).set({ userId: riderP.uid, townId: T, name: 'New Rider', verified: false, verificationStatus: 'pending', status: 'active', online: false });
});

describe('verifyListing', () => {
  it('the town coordinator approves a shop; it becomes visible', async () => {
    await failsWith(call(otherCoord, 'verifyListing', { kind: 'shop', id: 'adm-shop', decision: 'approve' }), 'not_your_town');
    await call(coord, 'verifyListing', { kind: 'shop', id: 'adm-shop', decision: 'approve' });
    expect((await adminDb.doc('shops/adm-shop').get()).data()).toMatchObject({ verified: true, verificationStatus: 'approved', verifiedBy: coord.uid });
    const sms = await adminDb.collection('smsOutbox').where('to', '==', '+639177770004').get();
    expect(sms.docs.some((d) => String(d.get('message')).includes('visible to customers'))).toBe(true);
  });
  it('a rejection needs a note and takes the rider offline', async () => {
    await expect(call(coord, 'verifyListing', { kind: 'rider', id: riderP.uid, decision: 'reject' })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await adminDb.doc(`riders/${riderP.uid}`).update({ online: true });
    await call(coord, 'verifyListing', { kind: 'rider', id: riderP.uid, decision: 'reject', note: 'License expired. Bring the renewed one.' });
    expect((await adminDb.doc(`riders/${riderP.uid}`).get()).data()).toMatchObject({ verified: false, verificationStatus: 'rejected', online: false, verificationNote: 'License expired. Bring the renewed one.' });
  });
  it('plain users cannot verify', async () => {
    await failsWith(call(owner, 'verifyListing', { kind: 'shop', id: 'adm-shop', decision: 'approve' }), 'not_your_town');
  });
});

describe('setAccountStatus', () => {
  it('a coordinator suspends in their town; only admins ban and reinstate', async () => {
    await call(coord, 'setAccountStatus', { type: 'shop', id: 'adm-shop', action: 'suspend', note: 'Health office closure notice.' });
    expect((await adminDb.doc('shops/adm-shop').get()).data()).toMatchObject({ status: 'suspended', suspendedReason: 'coordinator' });
    await failsWith(call(coord, 'setAccountStatus', { type: 'shop', id: 'adm-shop', action: 'reinstate', note: 'ok now' }), 'admin_only');
    await failsWith(call(otherCoord, 'setAccountStatus', { type: 'shop', id: 'adm-shop', action: 'suspend', note: 'not mine' }), 'not_your_town');
    await call(admin, 'setAccountStatus', { type: 'shop', id: 'adm-shop', action: 'reinstate', note: 'Permit renewed.' });
    expect((await adminDb.doc('shops/adm-shop').get()).data()).toMatchObject({ status: 'active', suspendedReason: null });
    await call(admin, 'setAccountStatus', { type: 'customer', id: riderP.uid, action: 'ban', note: 'Repeated fake orders.' });
    expect((await adminDb.doc(`users/${riderP.uid}`).get()).get('status')).toBe('banned');
    const log = await adminDb.collection('adminLog').where('targetId', '==', 'adm-shop').get();
    expect(log.docs.map((d) => d.get('action')).sort()).toEqual(['reinstate_shop', 'suspend_shop', 'verify_shop']);
  });
  it('coordinators act on customers who order in their town (not on defaultTownId), and never on staff', async () => {
    const roamer = await person('+639177770006', ['customer'], {}, { defaultTownId: 'elsewhere' });
    const local = await person('+639177770007', ['customer'], {}, { defaultTownId: T });
    await adminDb.doc('orders/adm-roamer-1').set({ townId: T, customerId: roamer.uid, status: 'COMPLETED', createdAt: Timestamp.now() });
    await call(coord, 'setAccountStatus', { type: 'customer', id: roamer.uid, action: 'suspend', note: 'Fake orders in our town.' });
    expect((await adminDb.doc(`users/${roamer.uid}`).get()).get('status')).toBe('suspended');
    await failsWith(call(coord, 'setAccountStatus', { type: 'customer', id: local.uid, action: 'suspend', note: 'Never ordered here.' }), 'not_your_town');
    await adminDb.doc('orders/adm-othercoord-1').set({ townId: T, customerId: otherCoord.uid, status: 'COMPLETED', createdAt: Timestamp.now() });
    await failsWith(call(coord, 'setAccountStatus', { type: 'customer', id: otherCoord.uid, action: 'suspend', note: 'Staff account.' }), 'admin_only');
    await failsWith(call(coord, 'setAccountStatus', { type: 'customer', id: admin.uid, action: 'suspend', note: 'Staff account.' }), 'admin_only');
    // keep the town's metrics below clean
    await adminDb.doc('orders/adm-roamer-1').delete();
    await adminDb.doc('orders/adm-othercoord-1').delete();
  });
  it('a coordinator cannot verify their own listing', async () => {
    await adminDb.doc('shops/coord-shop').set({ ownerId: coord.uid, townId: T, name: 'Coordinator Snacks', verified: false, verificationStatus: 'pending', status: 'active' });
    await failsWith(call(coord, 'verifyListing', { kind: 'shop', id: 'coord-shop', decision: 'approve' }), 'not_your_own');
    await call(admin, 'verifyListing', { kind: 'shop', id: 'coord-shop', decision: 'approve' });
  });
  it('an admin cannot suspend themselves by mistake', async () => {
    await failsWith(call(admin, 'setAccountStatus', { type: 'customer', id: admin.uid, action: 'suspend', note: 'oops' }), 'not_yourself');
  });
});

describe('adminMetrics', () => {
  it('summarizes a town for its coordinator; all towns for admins only', async () => {
    const now = Date.now();
    const mk = async (id: string, status: string, customerId: string, minsToAssign: number | null, daysAgo = 0) => {
      const created = Timestamp.fromMillis(now - daysAgo * 86_400_000 - 3600_000);
      await adminDb.doc(`orders/${id}`).set({
        townId: T,
        status,
        customerId,
        shopId: 'adm-shop',
        riderId: minsToAssign === null ? null : riderP.uid,
        createdAt: created,
        statusHistory: minsToAssign === null ? [] : [{ status: 'RIDER_ASSIGNED', at: Timestamp.fromMillis(created.toMillis() + minsToAssign * 60_000) }],
      });
    };
    await mk('m1', 'COMPLETED', 'a', 3);
    await mk('m2', 'COMPLETED', 'a', 5, 1);
    await mk('m3', 'COMPLETED', 'b', 9, 2);
    await mk('m4', 'CANCELLED', 'c', null, 2);
    const m = await call<Record<string, unknown>>(coord, 'adminMetrics', { townId: T, days: 14 });
    expect(m).toMatchObject({ placed: 4, completed: 3, cancelled: 1, completionRate: 0.75, medianAssignMinutes: 5, activeShops: 1, activeRiders: 1, customers: 2, repeatRate: 0.5 });
    await failsWith(call(otherCoord, 'adminMetrics', { townId: T, days: 14 }), 'not_your_town');
    await failsWith(call(coord, 'adminMetrics', { townId: null, days: 14 }), 'not_your_town');
    const all = await call<{ placed: number }>(admin, 'adminMetrics', { townId: null, days: 14 });
    expect(all.placed).toBeGreaterThanOrEqual(4);
  });
});
