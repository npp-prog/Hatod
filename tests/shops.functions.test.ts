import { beforeAll, describe, expect, it } from 'vitest';
import { PRIVACY_VERSION, TERMS_VERSION } from '@hatod/shared';
import { adminDb, callable, signInAsPhoneUser } from './helpers';

const TOWN = 'shoptown--test';
beforeAll(async () => {
  await adminDb.doc(`towns/${TOWN}`).set({ name: 'Shoptown', province: 'Test', isLive: true, coordinatorIds: [] });
  await adminDb.doc(`barangays/${TOWN}__poblacion`).set({ townId: TOWN, name: 'Poblacion', centroid: { lat: 11.1, lng: 122.6 } });
  await adminDb.doc('barangays/elsewhere__x').set({ townId: 'elsewhere', name: 'X', centroid: { lat: 11.1, lng: 122.6 } });
});

const shop = (over: Record<string, unknown> = {}) => ({
  townId: TOWN,
  name: "Aling Nena's",
  category: 'meals',
  contactPhone: '+639173330001',
  barangayId: `${TOWN}__poblacion`,
  landmark: 'Beside the public market',
  geo: { lat: 11.1, lng: 122.6 },
  paymentMethods: ['cash', 'gcash'],
  ...over,
});

async function customer(phone: string) {
  const s = await signInAsPhoneUser(phone);
  await callable(s.app, 'completeProfile')({
    name: 'Nena Santos',
    acceptTerms: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  });
  await s.user.getIdToken(true);
  return s;
}

describe('registerShop', () => {
  it('creates a pending shop with private info and grants the shop role', async () => {
    const s = await customer('+639173330001');
    const res = await callable<unknown, { shopId: string }>(s.app, 'registerShop')(shop());
    const d = (await adminDb.doc(`shops/${res.data.shopId}`).get()).data()!;
    expect(d).toMatchObject({
      ownerId: s.uid,
      townId: TOWN,
      barangayName: 'Poblacion',
      verified: false,
      verificationStatus: 'pending',
      status: 'active',
      busyMinutes: 0,
      closedOn: null,
      menuCategories: [],
    });
    expect(Object.keys(d.hours)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    const priv = (await adminDb.doc(`shops/${res.data.shopId}/private/info`).get()).data()!;
    expect(priv).toMatchObject({ ownerName: 'Nena Santos', ownerPhone: '+639173330001', permitPath: null });
    const claims = (await s.user.getIdTokenResult(true)).claims;
    expect(claims.roles).toEqual(['customer', 'shop']);
    expect(claims.shops).toEqual([res.data.shopId]);
  });

  it('keeps the shop claim when an admin later changes roles', async () => {
    const s = await customer('+639173330006');
    const res = await callable<unknown, { shopId: string }>(s.app, 'registerShop')(shop());
    const admin = await signInAsPhoneUser('+639173330099');
    await adminDb.doc(`users/${admin.uid}`).set({ roles: ['customer', 'admin'] });
    const { adminAuth } = await import('./helpers');
    await adminAuth.setCustomUserClaims(admin.uid, { roles: ['customer', 'admin'] });
    await admin.user.getIdToken(true);
    await callable(admin.app, 'setUserRoles')({ uid: s.uid, roles: ['customer', 'shop', 'rider'] });
    const claims = (await s.user.getIdTokenResult(true)).claims;
    expect(claims.roles).toEqual(['customer', 'shop', 'rider']);
    expect(claims.shops).toEqual([res.data.shopId]);
  });

  it('allows one shop per person', async () => {
    const s = await customer('+639173330002');
    await callable(s.app, 'registerShop')(shop());
    await expect(callable(s.app, 'registerShop')(shop({ name: 'Second' }))).rejects.toMatchObject({
      code: 'functions/already-exists',
    });
  });

  it('checks the barangay is in the town', async () => {
    const s = await customer('+639173330003');
    await expect(callable(s.app, 'registerShop')(shop({ barangayId: 'elsewhere__x' }))).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });

  it('needs a completed profile', async () => {
    const s = await signInAsPhoneUser('+639173330004');
    await expect(callable(s.app, 'registerShop')(shop())).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    });
  });

  it('ignores the self-delivery fee when the shop has no rider', async () => {
    const s = await customer('+639173330005');
    const res = await callable<unknown, { shopId: string }>(s.app, 'registerShop')(shop({ selfDeliveryFee: 50 }));
    expect((await adminDb.doc(`shops/${res.data.shopId}`).get()).get('selfDeliveryFee')).toBe(0);
  });
});
