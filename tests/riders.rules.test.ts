import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const PROJECT = 'demo-hatod';
const PHOTO = (uid: string) => `http://127.0.0.1:9199/v0/b/${PROJECT}.appspot.com/o/riders%2F${uid}%2Fpublic%2Fp.webp?alt=media`;

beforeAll(async () => {
  const [fh, fp] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  const [sh, sp] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: fh!, port: Number(fp) },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: sh!, port: Number(sp) },
  });
});
afterAll(async () => env.cleanup());

const rider = (over: Record<string, unknown> = {}) => ({
  userId: 'r1',
  townId: 't1',
  name: 'Ramon',
  photoUrl: null,
  vehicleType: 'motorcycle',
  vehicleDesc: 'Honda XRM, red',
  plateNo: '123 ABC',
  verified: false,
  verificationStatus: 'pending',
  status: 'active',
  online: false,
  rainOn: false,
  lastActiveAt: null,
  servedBarangayIds: ['b1'],
  maxKm: 8,
  rateCard: { base: 30, perKm: 10, minimum: 40, fixedFares: [], surcharges: { night: null, rain: 0, extraStop: 0 } },
  rateUpdatedAt: null,
  planId: null,
  ratingAvg: 0,
  ratingCount: 0,
  completedCount: 0,
  ...over,
});
const docs = { governmentId: null, license: null, orcr: null, clearance: null };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'riders/r1'), rider());
    await setDoc(doc(db, 'riders/r2'), rider({ userId: 'r2', verified: true, verificationStatus: 'approved' }));
    await setDoc(doc(db, 'riders/r3'), rider({ userId: 'r3', verified: true, status: 'suspended' }));
    await setDoc(doc(db, 'riders/r1/private/info'), {
      legalName: 'Ramon R.',
      phone: '+639170000004',
      emergencyContact: { name: 'Maria', phone: '+639171111111', relation: 'Wife' },
      docs,
    });
  });
});

const as = (uid: string, roles = ['customer'], coordTowns: string[] = []) => env.authenticatedContext(uid, { roles, coordTowns });
const r1 = () => as('r1', ['customer', 'rider']).firestore();
const r2 = () => as('r2', ['customer', 'rider']).firestore();
const upd = (db: ReturnType<typeof r1>, id: string, data: Record<string, unknown>) =>
  updateDoc(doc(db, 'riders', id), { ...data, updatedAt: serverTimestamp() });

describe('rider visibility', () => {
  it('verified, active riders are public; pending and suspended are not', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'riders/r2')));
    await assertFails(getDoc(doc(as('c').firestore(), 'riders/r1')));
    await assertFails(getDoc(doc(as('c').firestore(), 'riders/r3')));
  });
  it('the rider, the town coordinator and admins see a pending rider', async () => {
    await assertSucceeds(getDoc(doc(r1(), 'riders/r1')));
    await assertSucceeds(getDoc(doc(as('k', ['customer', 'coordinator'], ['t1']).firestore(), 'riders/r1')));
    await assertFails(getDoc(doc(as('k', ['customer', 'coordinator'], ['t2']).firestore(), 'riders/r1')));
    await assertSucceeds(getDoc(doc(as('a', ['customer', 'admin']).firestore(), 'riders/r1')));
  });
  it('private info stays private even when the rider is listed', async () => {
    await assertSucceeds(getDoc(doc(r1(), 'riders/r1/private/info')));
    await assertSucceeds(getDoc(doc(as('k', ['customer', 'coordinator'], ['t1']).firestore(), 'riders/r1/private/info')));
    await assertFails(getDoc(doc(as('c').firestore(), 'riders/r1/private/info')));
    await assertFails(getDoc(doc(r2(), 'riders/r1/private/info')));
  });
});

describe('rider edits', () => {
  it('a pending rider can fix vehicle details and set a photo', async () => {
    await assertSucceeds(upd(r1(), 'r1', { vehicleDesc: 'Honda XRM 125, red', plateNo: '456 DEF', photoUrl: PHOTO('r1') }));
  });
  it('a pending rider cannot go online', async () => {
    await assertFails(upd(r1(), 'r1', { online: true, lastActiveAt: serverTimestamp() }));
  });
  it('a verified rider goes online and offline and toggles rain', async () => {
    await assertSucceeds(upd(r2(), 'r2', { online: true, lastActiveAt: serverTimestamp() }));
    await assertSucceeds(upd(r2(), 'r2', { rainOn: true }));
    await assertSucceeds(upd(r2(), 'r2', { online: false, lastActiveAt: serverTimestamp() }));
  });
  it('an online rider may share a rough location, never a precise one, and not while offline', async () => {
    await assertSucceeds(upd(r2(), 'r2', { online: true, lastActiveAt: serverTimestamp(), approxLocation: { lat: 11.11, lng: 122.64 } }));
    await assertFails(upd(r2(), 'r2', { approxLocation: { lat: 11.10567, lng: 122.64321 } }));
    await assertSucceeds(upd(r2(), 'r2', { online: false, lastActiveAt: serverTimestamp(), approxLocation: null }));
    await assertFails(upd(r2(), 'r2', { approxLocation: { lat: 11.11, lng: 122.64 } }));
  });
  it('going online must stamp the activity time', async () => {
    await assertFails(upd(r2(), 'r2', { online: true }));
  });
  it('a verified rider cannot change vehicle or plate', async () => {
    await assertFails(upd(r2(), 'r2', { plateNo: '999 ZZZ' }));
    await assertFails(upd(r2(), 'r2', { vehicleType: 'bicycle' }));
  });
  it('a suspended rider cannot go online', async () => {
    await assertFails(upd(as('r3', ['customer', 'rider']).firestore(), 'r3', { online: true, lastActiveAt: serverTimestamp() }));
  });
  it('rates, area, verification, rating and status are off limits', async () => {
    await assertFails(upd(r1(), 'r1', { rateCard: { base: 1 } }));
    await assertFails(upd(r1(), 'r1', { servedBarangayIds: ['x'] }));
    await assertFails(upd(r1(), 'r1', { maxKm: 30 }));
    await assertFails(upd(r1(), 'r1', { verified: true }));
    await assertFails(upd(r1(), 'r1', { ratingAvg: 5 }));
    await assertFails(upd(r1(), 'r1', { completedCount: 99 }));
    await assertFails(upd(r1(), 'r1', { status: 'suspended' }));
  });
  it('photos must come from the rider\'s own folder', async () => {
    await assertFails(upd(r1(), 'r1', { photoUrl: 'https://evil.example/me.jpg' }));
    await assertFails(upd(r1(), 'r1', { photoUrl: PHOTO('r2') }));
  });
  it('nobody else can edit a rider', async () => {
    await assertFails(upd(r2(), 'r1', { rainOn: true }));
  });
  it('nobody creates rider records from the client', async () => {
    await assertFails(setDoc(doc(as('x', ['customer', 'rider']).firestore(), 'riders/x'), rider({ userId: 'x' })));
  });
});

describe('rider private info', () => {
  const p = () => doc(r1(), 'riders/r1/private/info');
  const ec = { name: 'Maria', phone: '+639171111111', relation: 'Wife' };
  it('the rider records document paths in their own folder', async () => {
    await assertSucceeds(updateDoc(p(), { docs: { ...docs, license: 'private/towns/t1/riders/r1/license.webp' }, emergencyContact: ec, updatedAt: serverTimestamp() }));
  });
  it('refuses paths elsewhere, unknown document keys and other fields', async () => {
    await assertFails(updateDoc(p(), { docs: { ...docs, license: 'private/towns/t1/riders/r2/license.webp' }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(p(), { docs: { ...docs, license: 'private/towns/t9/riders/r1/license.webp' }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(p(), { docs: { ...docs, selfie: null }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(p(), { legalName: 'Someone Else', updatedAt: serverTimestamp() }));
  });
  it('validates the emergency contact', async () => {
    await assertSucceeds(updateDoc(p(), { emergencyContact: { ...ec, name: 'Lito R.' }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(p(), { emergencyContact: { ...ec, phone: '0917' }, updatedAt: serverTimestamp() }));
  });
});

describe('rider storage', () => {
  const img = new Uint8Array([1, 2, 3]);
  const DOC = 'private/towns/t1/riders/r1/license.webp';
  it('the rider uploads a public photo and private documents', async () => {
    const s = as('r1', ['customer', 'rider']).storage();
    await assertSucceeds(uploadBytes(ref(s, 'riders/r1/public/p.webp'), img, { contentType: 'image/webp' }));
    await assertSucceeds(uploadBytes(ref(s, DOC), img, { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), 'riders/r1/public/p.webp')));
  });
  it('documents are readable by the rider, the town coordinator and admins only', async () => {
    await uploadBytes(ref(as('r1', ['customer', 'rider']).storage(), DOC), img, { contentType: 'image/webp' });
    await assertSucceeds(getBytes(ref(as('k', ['customer', 'coordinator'], ['t1']).storage(), DOC)));
    await assertSucceeds(getBytes(ref(as('a', ['customer', 'admin']).storage(), DOC)));
    await assertFails(getBytes(ref(as('k', ['customer', 'coordinator'], ['t2']).storage(), DOC)));
    await assertFails(getBytes(ref(as('r2', ['customer', 'rider']).storage(), DOC)));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), DOC)));
  });
  it('nobody uploads into another rider\'s folders', async () => {
    const s = as('r2', ['customer', 'rider']).storage();
    await assertFails(uploadBytes(ref(s, 'riders/r1/public/p.webp'), img, { contentType: 'image/webp' }));
    await assertFails(uploadBytes(ref(s, DOC), img, { contentType: 'image/webp' }));
    // the rider role is required too
    await assertFails(uploadBytes(ref(as('r1', ['customer']).storage(), 'riders/r1/public/p.webp'), img, { contentType: 'image/webp' }));
  });
});
