import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-hatod-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: host!, port: Number(port) },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), { name: 'Alice', roles: ['customer'] });
    await setDoc(doc(ctx.firestore(), 'users/bob'), { name: 'Bob', roles: ['customer', 'rider'] });
    const db = ctx.firestore();
    await setDoc(doc(db, 'towns/live-town'), { name: 'Live', isLive: true });
    await setDoc(doc(db, 'towns/new-town'), { name: 'New', isLive: false });
    await setDoc(doc(db, 'barangays/live-town__mabini'), { townId: 'live-town', name: 'Mabini' });
    await setDoc(doc(db, 'barangays/new-town__rizal'), { townId: 'new-town', name: 'Rizal' });
    await setDoc(doc(db, 'addresses/alice-home'), { ...address('alice'), createdAt: new Date(), updatedAt: new Date() });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string, roles: string[]) => env.authenticatedContext(uid, { roles }).firestore();

describe('users', () => {
  it('a user reads their own profile', async () => {
    await assertSucceeds(getDoc(doc(as('alice', ['customer']), 'users/alice')));
  });
  it('a user cannot read someone else', async () => {
    await assertFails(getDoc(doc(as('alice', ['customer']), 'users/bob')));
  });
  it('signed-out visitors cannot read users', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice')));
  });
  it('admins read any profile', async () => {
    await assertSucceeds(getDoc(doc(as('root', ['customer', 'admin']), 'users/bob')));
  });
  it('nobody writes users from the client, not even to grant themselves admin', async () => {
    await assertFails(updateDoc(doc(as('alice', ['customer']), 'users/alice'), { roles: ['admin'] }));
    await assertFails(setDoc(doc(as('carol', ['customer']), 'users/carol'), { roles: ['customer'] }));
    await assertFails(updateDoc(doc(as('root', ['admin']), 'users/bob'), { roles: ['customer'] }));
  });
  it('a forged roles claim that is not a list grants nothing', async () => {
    const ctx = env.authenticatedContext('mallory', { roles: 'admin' }).firestore();
    await assertFails(getDoc(doc(ctx, 'users/alice')));
  });
});

function address(userId: string, over: Record<string, unknown> = {}) {
  return {
    userId,
    townId: 'live-town',
    label: 'Home',
    barangayId: 'live-town__mabini',
    barangayName: 'Mabini',
    street: 'Purok 3',
    landmark: 'Blue gate near the chapel',
    geo: { lat: 11.1, lng: 122.64 },
    isDefault: true,
    ...over,
  };
}
const stamped = (d: Record<string, unknown>) => ({ ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

describe('users self-service fields', () => {
  it('a user may set their own town and language', async () => {
    await assertSucceeds(
      updateDoc(doc(as('alice', ['customer']), 'users/alice'), {
        defaultTownId: 'live-town',
        locale: 'fil',
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it('but not to a town that does not exist', async () => {
    await assertFails(
      updateDoc(doc(as('alice', ['customer']), 'users/alice'), {
        defaultTownId: 'atlantis',
        locale: 'en',
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it('and not together with other fields', async () => {
    await assertFails(
      updateDoc(doc(as('alice', ['customer']), 'users/alice'), {
        defaultTownId: 'live-town',
        locale: 'en',
        status: 'active',
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('towns and barangays', () => {
  it('anyone sees live towns', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'towns/live-town')));
    await assertSucceeds(
      getDocs(query(collection(env.unauthenticatedContext().firestore(), 'towns'), where('isLive', '==', true))),
    );
  });
  it('towns that are not live are hidden from the public', async () => {
    await assertFails(getDoc(doc(as('alice', ['customer']), 'towns/new-town')));
    await assertFails(getDocs(collection(as('alice', ['customer']), 'towns')));
  });
  it('admins and that town\'s coordinator see towns that are not live', async () => {
    await assertSucceeds(getDocs(collection(as('root', ['customer', 'admin']), 'towns')));
    const coord = env.authenticatedContext('c1', { roles: ['customer', 'coordinator'], coordTowns: ['new-town'] });
    await assertSucceeds(getDoc(doc(coord.firestore(), 'towns/new-town')));
    const other = env.authenticatedContext('c2', { roles: ['customer', 'coordinator'], coordTowns: ['live-town'] });
    await assertFails(getDoc(doc(other.firestore(), 'towns/new-town')));
  });
  it('coordTowns without the coordinator role grants nothing', async () => {
    const ctx = env.authenticatedContext('x', { roles: ['customer'], coordTowns: ['new-town'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'towns/new-town')));
  });
  it('barangays are public and read-only', async () => {
    await assertSucceeds(getDocs(collection(env.unauthenticatedContext().firestore(), 'barangays')));
    await assertFails(setDoc(doc(as('root', ['admin']), 'barangays/x'), { townId: 'live-town', name: 'X' }));
    await assertFails(setDoc(doc(as('root', ['admin']), 'towns/x'), { name: 'X', isLive: true }));
  });
});

describe('addresses', () => {
  const alice = () => as('alice', ['customer']);

  it('a customer saves a valid address', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'addresses/a2'), stamped(address('alice', { isDefault: false }))));
  });
  it('reads and lists only their own', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'addresses/alice-home')));
    await assertSucceeds(getDocs(query(collection(alice(), 'addresses'), where('userId', '==', 'alice'))));
    await assertFails(getDoc(doc(as('bob', ['customer']), 'addresses/alice-home')));
    await assertFails(getDocs(collection(alice(), 'addresses')));
  });
  it('cannot save an address for someone else', async () => {
    await assertFails(setDoc(doc(alice(), 'addresses/b1'), stamped(address('bob'))));
  });
  it('the barangay must belong to the address town', async () => {
    await assertFails(
      setDoc(doc(alice(), 'addresses/a3'), stamped(address('alice', { barangayId: 'new-town__rizal' }))),
    );
    await assertFails(setDoc(doc(alice(), 'addresses/a3'), stamped(address('alice', { barangayId: 'nope' }))));
  });
  it('the barangay name must match the barangay', async () => {
    await assertFails(setDoc(doc(alice(), 'addresses/a6'), stamped(address('alice', { barangayName: 'Fake' }))));
  });
  it('requires a landmark and a pin in the Philippines', async () => {
    await assertFails(setDoc(doc(alice(), 'addresses/a4'), stamped(address('alice', { landmark: '  ' }))));
    await assertFails(setDoc(doc(alice(), 'addresses/a4'), stamped(address('alice', { geo: { lat: 35, lng: 139 } }))));
    await assertFails(
      setDoc(doc(alice(), 'addresses/a4'), stamped(address('alice', { geo: { lat: 11, lng: 122, alt: 3 } }))),
    );
  });
  it('rejects extra fields and client-chosen timestamps', async () => {
    await assertFails(setDoc(doc(alice(), 'addresses/a5'), stamped(address('alice', { verified: true }))));
    await assertFails(
      setDoc(doc(alice(), 'addresses/a5'), { ...address('alice'), createdAt: new Date(0), updatedAt: new Date(0) }),
    );
  });
  it('updates keep owner and creation time', async () => {
    const ref = doc(alice(), 'addresses/alice-home');
    await assertSucceeds(updateDoc(ref, { landmark: 'Green gate', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { userId: 'bob', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
  it('only the owner deletes', async () => {
    await assertFails(deleteDoc(doc(as('bob', ['customer']), 'addresses/alice-home')));
    await assertSucceeds(deleteDoc(doc(alice(), 'addresses/alice-home')));
  });
});

describe('default deny', () => {
  it('blocks unknown collections', async () => {
    await assertFails(getDoc(doc(as('alice', ['customer', 'admin']), 'anything/x')));
    await assertFails(setDoc(doc(as('alice', ['customer', 'admin']), 'orders/x'), { a: 1 }));
  });
});
