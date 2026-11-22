import { Timestamp } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_CARD, PRIVACY_VERSION, TERMS_VERSION } from '@hatod/shared';
import { adminDb, callable, signInAsPhoneUser } from './helpers';

const TOWN = 'ridertown--test';
beforeAll(async () => {
  await adminDb.doc(`towns/${TOWN}`).set({ name: 'Ridertown', province: 'Test', isLive: true, coordinatorIds: [] });
  for (const b of ['poblacion', 'mabini', 'rizal']) {
    await adminDb.doc(`barangays/${TOWN}__${b}`).set({ townId: TOWN, name: b, centroid: { lat: 11.1, lng: 122.6 }, active: true });
  }
  await adminDb.doc('barangays/other__x').set({ townId: 'other', name: 'X', centroid: { lat: 11.1, lng: 122.6 } });
});

const signup = {
  townId: TOWN,
  vehicleType: 'motorcycle',
  vehicleDesc: 'Honda XRM, red',
  plateNo: '123 abc',
  emergencyContact: { name: 'Maria Rider', phone: '+639174440099', relation: 'Wife' },
};

async function riderUser(phone: string) {
  const s = await signInAsPhoneUser(phone);
  await callable(s.app, 'completeProfile')({ name: 'Ramon Rider', acceptTerms: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
  await callable(s.app, 'registerRider')(signup);
  await s.user.getIdToken(true);
  return s;
}

describe('registerRider', () => {
  it('creates a pending rider with defaults, private info and the rider role', async () => {
    const s = await riderUser('+639174440001');
    const r = (await adminDb.doc(`riders/${s.uid}`).get()).data()!;
    expect(r).toMatchObject({ userId: s.uid, townId: TOWN, name: 'Ramon Rider', plateNo: '123 ABC', verified: false, online: false, maxKm: 8, rateCard: DEFAULT_RATE_CARD });
    expect(r.servedBarangayIds.sort()).toEqual([`${TOWN}__mabini`, `${TOWN}__poblacion`, `${TOWN}__rizal`]);
    const p = (await adminDb.doc(`riders/${s.uid}/private/info`).get()).data()!;
    expect(p).toMatchObject({ legalName: 'Ramon Rider', phone: '+639174440001', docs: { governmentId: null, license: null, orcr: null, clearance: null } });
    expect((await s.user.getIdTokenResult()).claims.roles).toEqual(['customer', 'rider']);
  });
  it('once per person', async () => {
    const s = await riderUser('+639174440002');
    await expect(callable(s.app, 'registerRider')(signup)).rejects.toMatchObject({ code: 'functions/already-exists' });
  });
});

describe('updateRateCard', () => {
  const card = (over = {}) => ({ ...DEFAULT_RATE_CARD, base: 35, ...over });

  it('a pending rider can change rates as often as they like', async () => {
    const s = await riderUser('+639174440003');
    const call = callable(s.app, 'updateRateCard');
    await call({ rateCard: card() });
    await call({ rateCard: card({ base: 40 }) });
    const r = (await adminDb.doc(`riders/${s.uid}`).get()).data()!;
    expect(r.rateCard.base).toBe(40);
    expect(r.rateUpdatedAt).toBeNull();
  });

  it('a verified rider can change rates once per 24 hours', async () => {
    const s = await riderUser('+639174440004');
    await adminDb.doc(`riders/${s.uid}`).update({ verified: true });
    const call = callable(s.app, 'updateRateCard');
    await call({ rateCard: card() });
    const err = await call({ rateCard: card({ base: 50 }) }).catch((e) => e);
    expect(err.code).toBe('functions/failed-precondition');
    expect(String(err.message)).toContain('rate_change_too_soon');
    expect(typeof err.details?.nextAllowedAt).toBe('number');
    // a day later it works again
    await adminDb.doc(`riders/${s.uid}`).update({ rateUpdatedAt: Timestamp.fromMillis(Date.now() - 24 * 3600_000 - 1000) });
    await call({ rateCard: card({ base: 50 }) });
    expect((await adminDb.doc(`riders/${s.uid}`).get()).get('rateCard.base')).toBe(50);
  });

  it('fixed fares must use barangays in the rider\'s town', async () => {
    const s = await riderUser('+639174440005');
    const call = callable(s.app, 'updateRateCard');
    await call({ rateCard: card({ fixedFares: [{ fromBarangayId: `${TOWN}__poblacion`, toBarangayId: `${TOWN}__mabini`, fee: 60 }] }) });
    await expect(
      call({ rateCard: card({ fixedFares: [{ fromBarangayId: `${TOWN}__poblacion`, toBarangayId: 'other__x', fee: 60 }] }) }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('rejects invalid cards and non-riders', async () => {
    const s = await riderUser('+639174440006');
    await expect(callable(s.app, 'updateRateCard')({ rateCard: card({ perKm: 9.5 }) })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    const c = await signInAsPhoneUser('+639174440007');
    await expect(callable(c.app, 'updateRateCard')({ rateCard: card() })).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('updateServiceArea', () => {
  it('sets barangays and max distance within the rider\'s town', async () => {
    const s = await riderUser('+639174440008');
    const call = callable(s.app, 'updateServiceArea');
    await call({ servedBarangayIds: [`${TOWN}__poblacion`, `${TOWN}__poblacion`, `${TOWN}__rizal`], maxKm: 5 });
    const r = (await adminDb.doc(`riders/${s.uid}`).get()).data()!;
    expect(r.servedBarangayIds).toEqual([`${TOWN}__poblacion`, `${TOWN}__rizal`]);
    expect(r.maxKm).toBe(5);
    await expect(call({ servedBarangayIds: ['other__x'], maxKm: 5 })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });
});
