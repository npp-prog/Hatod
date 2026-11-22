import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
// Same project as the emulators: Storage rules read Firestore (firestore.get) in this project.
const PROJECT = 'demo-hatod';
const IMG = (id: string, f = 'a.webp') =>
  `http://127.0.0.1:9199/v0/b/${PROJECT}.appspot.com/o/shops%2F${id}%2Fpublic%2F${f}?alt=media`;

beforeAll(async () => {
  const [fh, fp] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  const [sh, sp] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: fh!, port: Number(fp) },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: sh!, port: Number(sp) },
  });
});

const baseShop = (over: Record<string, unknown> = {}) => ({
  ownerId: 'owner',
  townId: 't1',
  name: "Nena's Carinderia",
  category: 'meals',
  description: '',
  contactPhone: '+639171234567',
  photos: [],
  barangayId: 't1__mabini',
  barangayName: 'Mabini',
  street: '',
  landmark: 'Beside the market',
  geo: { lat: 11.1, lng: 122.64 },
  hours: { mon: [{ open: '07:00', close: '19:00' }] },
  closedOn: null,
  prepMinutes: 20,
  busyMinutes: 0,
  paymentMethods: ['cash'],
  gcashQrUrl: null,
  mayaQrUrl: null,
  hasOwnRider: false,
  selfDeliveryFee: 0,
  menuCategories: [],
  verified: false,
  verificationStatus: 'pending',
  status: 'active',
  planId: null,
  ratingAvg: 0,
  ratingCount: 0,
  ...over,
});

const item = (over: Record<string, unknown> = {}) => ({
  name: 'Tapsilog',
  description: '',
  category: 'Silog',
  price: 85,
  photoUrl: null,
  variants: [],
  addOns: [{ name: 'Egg', price: 12 }],
  available: true,
  sortOrder: 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'barangays/t1__mabini'), { townId: 't1', name: 'Mabini' });
    await setDoc(doc(db, 'barangays/t1__rizal'), { townId: 't1', name: 'Rizal' });
    await setDoc(doc(db, 'barangays/t2__x'), { townId: 't2', name: 'X' });
    await setDoc(doc(db, 'shops/pending'), baseShop());
    await setDoc(doc(db, 'shops/listed'), baseShop({ ownerId: 'owner2', verified: true, verificationStatus: 'approved' }));
    await setDoc(doc(db, 'shops/suspended'), baseShop({ ownerId: 'owner3', verified: true, status: 'suspended' }));
    await setDoc(doc(db, 'shops/pending/private/info'), { ownerName: 'Nena', ownerPhone: '+639171234567', permitPath: null });
    await setDoc(doc(db, 'shops/pending/menuItems/i1'), { ...item(), createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, 'shops/listed/menuItems/i1'), { ...item(), createdAt: new Date(), updatedAt: new Date() });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string, roles: string[] = ['customer'], coordTowns: string[] = [], shops: string[] = []) =>
  env.authenticatedContext(uid, { roles, coordTowns, shops });
const ownerCtx = () => as('owner', ['customer', 'shop'], [], ['pending']);
const owner = () => ownerCtx().firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('shop visibility', () => {
  it('listed shops and their menus are public', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'shops/listed')));
    await assertSucceeds(getDoc(doc(anon(), 'shops/listed/menuItems/i1')));
  });
  it('pending and suspended shops are hidden from customers', async () => {
    await assertFails(getDoc(doc(anon(), 'shops/pending')));
    await assertFails(getDoc(doc(as('c').firestore(), 'shops/pending/menuItems/i1')));
    await assertFails(getDoc(doc(as('c').firestore(), 'shops/suspended')));
  });
  it('the owner, the town coordinator and admins see a pending shop', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'shops/pending')));
    await assertSucceeds(getDoc(doc(owner(), 'shops/pending/menuItems/i1')));
    await assertSucceeds(getDoc(doc(as('k', ['customer', 'coordinator'], ['t1']).firestore(), 'shops/pending')));
    await assertFails(getDoc(doc(as('k2', ['customer', 'coordinator'], ['t2']).firestore(), 'shops/pending')));
    await assertSucceeds(getDoc(doc(as('a', ['customer', 'admin']).firestore(), 'shops/pending')));
  });
  it('private info is never public, even for a listed shop', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'shops/pending/private/info')));
    await assertSucceeds(getDoc(doc(as('k', ['customer', 'coordinator'], ['t1']).firestore(), 'shops/pending/private/info')));
    await assertFails(getDoc(doc(as('c').firestore(), 'shops/pending/private/info')));
  });
});

describe('owner edits', () => {
  const upd = (data: Record<string, unknown>) => updateDoc(doc(owner(), 'shops/pending'), { ...data, updatedAt: serverTimestamp() });

  it('can edit listing fields, hours and switches', async () => {
    await assertSucceeds(
      upd({
        name: "Nena's Eatery",
        hours: { mon: [{ open: '06:00', close: '14:00' }], sun: [] },
        closedOn: '2026-11-23',
        busyMinutes: 30,
        paymentMethods: ['cash', 'gcash'],
        gcashQrUrl: IMG('pending', 'gcash.webp'),
        photos: [IMG('pending'), IMG('pending', 'b.webp')],
        menuCategories: ['Silog', 'Drinks'],
      }),
    );
  });
  it('can move to another barangay in the same town, with the right name', async () => {
    await assertSucceeds(upd({ barangayId: 't1__rizal', barangayName: 'Rizal' }));
    await assertFails(upd({ barangayId: 't1__rizal', barangayName: 'Mabini' }));
    await assertFails(upd({ barangayId: 't2__x', barangayName: 'X' }));
  });
  it('cannot verify itself, change plan, ratings, owner or town', async () => {
    await assertFails(upd({ verified: true }));
    await assertFails(upd({ verificationStatus: 'approved' }));
    await assertFails(upd({ ratingAvg: 5 }));
    await assertFails(upd({ planId: 'shop-plus' }));
    await assertFails(upd({ ownerId: 'someone' }));
    await assertFails(upd({ townId: 't2' }));
    await assertFails(upd({ status: 'suspended' }));
  });
  it('rejects images hosted elsewhere or in another shop\'s folder', async () => {
    await assertFails(upd({ photos: ['https://evil.example/x.jpg'] }));
    await assertFails(upd({ photos: [IMG('listed')] }));
    await assertFails(upd({ gcashQrUrl: 'https://evil.example/qr.png' }));
  });
  it('rejects bad values', async () => {
    await assertFails(upd({ paymentMethods: [] }));
    await assertFails(upd({ paymentMethods: ['cash', 'bitcoin'] }));
    await assertFails(upd({ busyMinutes: 500 }));
    await assertFails(upd({ prepMinutes: 1.5 }));
    await assertFails(upd({ contactPhone: '0917' }));
    await assertFails(upd({ closedOn: 'today' }));
    await assertFails(upd({ hours: { funday: [] } }));
  });
  it('other people cannot edit the shop', async () => {
    await assertFails(updateDoc(doc(as('x', ['customer', 'shop']).firestore(), 'shops/pending'), { name: 'Mine', updatedAt: serverTimestamp() }));
  });
  it('nobody creates or deletes shops from the client', async () => {
    await assertFails(setDoc(doc(owner(), 'shops/new'), baseShop()));
    await assertFails(deleteDoc(doc(owner(), 'shops/pending')));
  });
  it('the owner may set only the permit path on private info', async () => {
    const p = doc(owner(), 'shops/pending/private/info');
    await assertSucceeds(updateDoc(p, { permitPath: 'private/towns/t1/shops/pending/permit.pdf', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(p, { permitPath: 'private/towns/t1/shops/listed/permit.pdf', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(p, { permitPath: 'private/towns/t2/shops/pending/permit.pdf', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(p, { ownerName: 'Someone', updatedAt: serverTimestamp() }));
  });
});

describe('menu items', () => {
  it('the owner adds, edits and deletes items', async () => {
    const r = doc(owner(), 'shops/pending/menuItems/new');
    await assertSucceeds(setDoc(r, item({ photoUrl: IMG('pending', 'tapsi.webp') })));
    await assertSucceeds(updateDoc(r, { available: false, updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(r));
  });
  it('validates items', async () => {
    const r = doc(owner(), 'shops/pending/menuItems/bad');
    await assertFails(setDoc(r, item({ price: 12.5 })));
    await assertFails(setDoc(r, item({ price: -1 })));
    await assertFails(setDoc(r, item({ name: ' ' })));
    await assertFails(setDoc(r, item({ photoUrl: 'https://evil.example/x.jpg' })));
    await assertFails(setDoc(r, item({ secret: true })));
  });
  it('nobody else can touch the menu', async () => {
    await assertFails(setDoc(doc(as('x', ['customer', 'shop']).firestore(), 'shops/pending/menuItems/x'), item()));
    await assertFails(updateDoc(doc(as('owner2').firestore(), 'shops/pending/menuItems/i1'), { price: 1, updatedAt: serverTimestamp() }));
  });
});

describe('storage', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const big = new Uint8Array(400 * 1024);
  const PERMIT = 'private/towns/t1/shops/pending/permit.pdf';

  it('the owner uploads small images to the public folder; anyone reads them', async () => {
    const s = ownerCtx().storage();
    await assertSucceeds(uploadBytes(ref(s, 'shops/pending/public/a.webp'), png, { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), 'shops/pending/public/a.webp')));
    await assertSucceeds(deleteObject(ref(s, 'shops/pending/public/a.webp')));
  });
  it('refuses large files, non-images and people who do not own the shop', async () => {
    const s = ownerCtx().storage();
    await assertFails(uploadBytes(ref(s, 'shops/pending/public/big.webp'), big, { contentType: 'image/webp' }));
    await assertFails(uploadBytes(ref(s, 'shops/pending/public/x.html'), png, { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(s, 'shops/listed/public/a.webp'), png, { contentType: 'image/webp' }));
    await assertFails(uploadBytes(ref(as('x').storage(), 'shops/pending/public/a.webp'), png, { contentType: 'image/webp' }));
    // a shops claim without the shop role is not enough
    await assertFails(
      uploadBytes(ref(as('y', ['customer'], [], ['pending']).storage(), 'shops/pending/public/a.webp'), png, {
        contentType: 'image/webp',
      }),
    );
  });
  it('permits are private to owner, that town\'s coordinator and admins', async () => {
    const s = ownerCtx().storage();
    await assertSucceeds(uploadBytes(ref(s, PERMIT), png, { contentType: 'application/pdf' }));
    await assertSucceeds(getBytes(ref(s, PERMIT)));
    await assertSucceeds(getBytes(ref(as('k', ['customer', 'coordinator'], ['t1']).storage(), PERMIT)));
    await assertSucceeds(getBytes(ref(as('a', ['customer', 'admin']).storage(), PERMIT)));
    await assertFails(getBytes(ref(as('k2', ['customer', 'coordinator'], ['t2']).storage(), PERMIT)));
    await assertFails(getBytes(ref(as('c').storage(), PERMIT)));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), PERMIT)));
  });
});
