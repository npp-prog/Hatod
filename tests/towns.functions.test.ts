import { beforeAll, describe, expect, it } from 'vitest';
import { adminAuth, adminDb, callable, signInAsPhoneUser } from './helpers';

type Out = { townId: string; created: boolean };
type ImportOut = { created: number; updated: number; issues: { line: number; code: string }[] };

let adminApp: Awaited<ReturnType<typeof signInAsPhoneUser>>['app'];

beforeAll(async () => {
  const a = await signInAsPhoneUser('+639172220001');
  await adminDb.doc(`users/${a.uid}`).set({ roles: ['customer', 'admin'] });
  await adminAuth.setCustomUserClaims(a.uid, { roles: ['customer', 'admin'] });
  await a.user.getIdToken(true);
  adminApp = a.app;
});

const town = {
  name: 'Test Town',
  province: 'Unit Province',
  tier: 'B',
  isLive: false,
  trialEndsOn: '2027-03-31',
  center: { lat: 11.1, lng: 122.64 },
  radiusKm: 12,
};

describe('adminUpsertTown', () => {
  it('creates a town with a slug id and Manila trial end', async () => {
    const res = await callable<unknown, Out>(adminApp, 'adminUpsertTown')(town);
    expect(res.data).toEqual({ townId: 'test-town--unit-province', created: true });
    const doc = (await adminDb.doc('towns/test-town--unit-province').get()).data()!;
    expect(doc).toMatchObject({ name: 'Test Town', tier: 'B', isLive: false, radiusKm: 12, coordinatorIds: [] });
    expect(doc.trialEndsAt.toDate().toISOString()).toBe('2027-03-31T15:59:59.999Z');
  });

  it('refuses to create the same town twice', async () => {
    await expect(callable(adminApp, 'adminUpsertTown')(town)).rejects.toMatchObject({
      code: 'functions/already-exists',
    });
  });

  it('updates by id and keeps coordinators', async () => {
    await adminDb.doc('towns/test-town--unit-province').update({ coordinatorIds: ['c1'] });
    const res = await callable<unknown, Out>(adminApp, 'adminUpsertTown')({
      ...town,
      townId: 'test-town--unit-province',
      isLive: true,
      trialEndsOn: null,
    });
    expect(res.data.created).toBe(false);
    const doc = (await adminDb.doc('towns/test-town--unit-province').get()).data()!;
    expect(doc).toMatchObject({ isLive: true, trialEndsAt: null, coordinatorIds: ['c1'] });
  });

  it('treats townId: null as create (how callables encode undefined)', async () => {
    const res = await callable<unknown, Out>(adminApp, 'adminUpsertTown')({ ...town, name: 'Null Id Town', townId: null });
    expect(res.data).toEqual({ townId: 'null-id-town--unit-province', created: true });
  });

  it('is admin only', async () => {
    const someone = await signInAsPhoneUser('+639172220002');
    await expect(callable(someone.app, 'adminUpsertTown')({ ...town, name: 'Other' })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
  });
});

describe('adminImportBarangays', () => {
  const townId = 'test-town--unit-province';

  it('creates barangays and reports bad rows', async () => {
    const csv = 'name,lat,lng\nPoblacion,11.10,122.64\nMabini,11.11,122.65\nBroken,abc,122\n';
    const res = await callable<unknown, ImportOut>(adminApp, 'adminImportBarangays')({ townId, csv });
    expect(res.data).toEqual({ created: 2, updated: 0, issues: [{ line: 4, code: 'bad_coordinates' }] });
    const snap = await adminDb.collection('barangays').where('townId', '==', townId).get();
    expect(snap.docs.map((d) => d.get('name')).sort()).toEqual(['Mabini', 'Poblacion']);
  });

  it('re-import updates instead of duplicating', async () => {
    const csv = 'name,lat,lng\nPOBLACION,11.101,122.641\nRizal,11.12,122.66\n';
    const res = await callable<unknown, ImportOut>(adminApp, 'adminImportBarangays')({ townId, csv });
    expect(res.data).toMatchObject({ created: 1, updated: 1 });
    const snap = await adminDb.collection('barangays').where('townId', '==', townId).get();
    expect(snap.size).toBe(3);
    const pob = (await adminDb.doc(`barangays/${townId}__poblacion`).get()).data()!;
    expect(pob.centroid).toEqual({ lat: 11.101, lng: 122.641 });
  });

  it('needs an existing town', async () => {
    await expect(
      callable(adminApp, 'adminImportBarangays')({ townId: 'nowhere', csv: 'name,lat,lng\nA,11,122' }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
  });
});
