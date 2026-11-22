import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
beforeAll(async () => {
  const [h, p] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-hatod-orders', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: h!, port: Number(p) } });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orders/o1'), { customerId: 'cust', shopId: 's1', shopOwnerId: 'own', riderId: 'rid', townId: 't1', participants: ['cust', 'own', 'rid'], status: 'RIDER_ASSIGNED', customerPhone: '+639171111111' });
    await setDoc(doc(db, 'orders/o2'), { customerId: 'other', shopId: 's2', shopOwnerId: 'own2', riderId: null, townId: 't1', participants: ['other', 'own2'], status: 'PLACED' });
    await setDoc(doc(db, 'riderOffers/f1'), { riderId: 'rid', orderId: 'o2', status: 'pending' });
  });
});
const as = (uid: string, claims: Record<string, unknown> = { roles: ['customer'] }) => env.authenticatedContext(uid, claims).firestore();

describe('orders', () => {
  it('the customer, shop and assigned rider read the order', async () => {
    await assertSucceeds(getDoc(doc(as('cust'), 'orders/o1')));
    await assertSucceeds(getDoc(doc(as('own', { roles: ['customer', 'shop'], shops: ['s1'] }), 'orders/o1')));
    await assertSucceeds(getDoc(doc(as('rid', { roles: ['customer', 'rider'] }), 'orders/o1')));
  });
  it('customers and riders can list their own orders (the queries the apps make)', async () => {
    await assertSucceeds(getDocs(query(collection(as('cust'), 'orders'), where('customerId', '==', 'cust'))));
    await assertSucceeds(getDocs(query(collection(as('rid', { roles: ['customer', 'rider'] }), 'orders'), where('riderId', '==', 'rid'))));
    await assertFails(getDocs(query(collection(as('cust'), 'orders'), where('customerId', '==', 'other'))));
    await assertFails(getDocs(query(collection(as('rid', { roles: ['rider'] }), 'orders'), where('riderId', '==', 'someone'))));
  });
  it('customers and riders can list their own orders (the queries the apps make)', async () => {
    await assertSucceeds(getDocs(query(collection(as('cust'), 'orders'), where('customerId', '==', 'cust'))));
    await assertSucceeds(getDocs(query(collection(as('rid', { roles: ['customer', 'rider'] }), 'orders'), where('riderId', '==', 'rid'))));
    await assertFails(getDocs(query(collection(as('cust'), 'orders'), where('customerId', '==', 'other'))));
    await assertFails(getDocs(query(collection(as('rid', { roles: ['rider'] }), 'orders'), where('riderId', '==', 'someone'))));
  });
  it('a shop owner lists their shop\'s orders, even ones they are not a participant of yet', async () => {
    await assertSucceeds(getDocs(query(collection(as('staff', { roles: ['customer', 'shop'], shops: ['s2'] }), 'orders'), where('shopId', '==', 's2'))));
  });
  it('strangers, other shops and riders not on the order cannot read it', async () => {
    await assertFails(getDoc(doc(as('x'), 'orders/o1')));
    await assertFails(getDoc(doc(as('own2', { roles: ['customer', 'shop'], shops: ['s2'] }), 'orders/o1')));
    await assertFails(getDoc(doc(as('rid', { roles: ['customer', 'rider'] }), 'orders/o2')));
    await assertFails(getDocs(collection(as('x'), 'orders')));
  });
  it('the town coordinator and admins read orders', async () => {
    await assertSucceeds(getDoc(doc(as('k', { roles: ['customer', 'coordinator'], coordTowns: ['t1'] }), 'orders/o1')));
    await assertFails(getDoc(doc(as('k', { roles: ['customer', 'coordinator'], coordTowns: ['t2'] }), 'orders/o1')));
    await assertSucceeds(getDoc(doc(as('a', { roles: ['customer', 'admin'] }), 'orders/o1')));
  });
  it('nobody writes orders from the app, not even to mark themselves paid or done', async () => {
    await assertFails(updateDoc(doc(as('cust'), 'orders/o1'), { status: 'COMPLETED' }));
    await assertFails(updateDoc(doc(as('rid', { roles: ['rider'] }), 'orders/o1'), { riderPaid: true }));
    await assertFails(setDoc(doc(as('cust'), 'orders/new'), { customerId: 'cust', participants: ['cust'] }));
  });
});

describe('rider offers', () => {
  it('only the rider the offer is for can see it', async () => {
    await assertSucceeds(getDoc(doc(as('rid', { roles: ['rider'] }), 'riderOffers/f1')));
    await assertSucceeds(getDocs(query(collection(as('rid', { roles: ['rider'] }), 'riderOffers'), where('riderId', '==', 'rid'), where('status', '==', 'pending'))));
    await assertFails(getDoc(doc(as('other', { roles: ['rider'] }), 'riderOffers/f1')));
    await assertFails(updateDoc(doc(as('rid', { roles: ['rider'] }), 'riderOffers/f1'), { status: 'accepted' }));
  });
});

describe('push devices', () => {
  it('a person registers and removes their own device tokens only', async () => {
    const mine = doc(as('cust'), 'users/cust/devices/tok123');
    await assertSucceeds(setDoc(mine, { token: 'tok123', platform: 'web', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(mine));
    await assertFails(setDoc(doc(as('cust'), 'users/cust/devices/tokA'), { token: 'tokB', platform: 'web', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as('x'), 'users/cust/devices/tok9'), { token: 'tok9', platform: 'web', updatedAt: serverTimestamp() }));
  });
});
