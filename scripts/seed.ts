/**
 * Seeds the local emulators with demo accounts (one per role).
 * Run with the emulators up:  npm run seed
 * Refuses to run against anything but the emulators.
 *
 * Sign in on the web app with any of the numbers below; the 6-digit code
 * appears in the emulator terminal and in the Emulator UI (Auth tab).
 * Also creates a live demo town with 10 barangays (seed/demo-barangays.csv), a
 * second town that is not live yet, and two saved addresses for the demo customer.
 * Later milestones extend this with shops, riders and plans.
 */
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'demo-hatod';

const PROJECT_ID = process.env.GCLOUD_PROJECT;
if (!PROJECT_ID.startsWith('demo-')) {
  console.error(`Refusing to seed project "${PROJECT_ID}": only demo-* emulator projects can be seeded.`);
  process.exit(1);
}

type Role = 'customer' | 'shop' | 'rider' | 'coordinator' | 'admin';

// Fictional towns placed on real terrain so the map has roads to pin on.
export const DEMO_TOWN_ID = 'san-roque--demo-province';
const DEMO_TOWN = {
  name: 'San Roque',
  province: 'Demo Province',
  tier: 'C',
  isLive: true,
  center: { lat: 11.1052, lng: 122.643 },
  radiusKm: 12,
};
const NEW_TOWN_ID = 'santa-monica--demo-province';
const NEW_TOWN = {
  name: 'Santa Monica',
  province: 'Demo Province',
  tier: 'C',
  isLive: false,
  center: { lat: 11.0201, lng: 122.5405 },
  radiusKm: 10,
};

const PEOPLE: { uid: string; name: string; phone: string; roles: Role[]; coordTowns?: string[] }[] = [
  { uid: 'demo-admin', name: 'Ana Admin', phone: '+639170000001', roles: ['customer', 'admin'] },
  {
    uid: 'demo-coordinator',
    name: 'Carlo Coordinator',
    phone: '+639170000002',
    roles: ['customer', 'coordinator'],
    coordTowns: [DEMO_TOWN_ID],
  },
  { uid: 'demo-shop', name: 'Susan Shop', phone: '+639170000003', roles: ['customer', 'shop'] },
  { uid: 'demo-rider', name: 'Ramon Rider', phone: '+639170000004', roles: ['customer', 'rider'] },
  { uid: 'demo-customer', name: 'Carmen Customer', phone: '+639170000005', roles: ['customer'] },
  { uid: 'demo-shop-rider', name: 'Sonny Shop-Rider', phone: '+639170000006', roles: ['customer', 'shop', 'rider'] },
  { uid: 'demo-owner-1', name: 'Pedro Panadero', phone: '+639170000011', roles: ['customer', 'shop'] },
  { uid: 'demo-owner-2', name: 'Benjie Lechonero', phone: '+639170000012', roles: ['customer', 'shop'] },
  { uid: 'demo-owner-3', name: 'Tomas Ihawan', phone: '+639170000013', roles: ['customer', 'shop'] },
  { uid: 'demo-owner-4', name: 'Rosa Tindera', phone: '+639170000014', roles: ['customer', 'shop'] },
];

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { FieldValue, getFirestore } = await import('firebase-admin/firestore');
  const { barangayId, endOfManilaDay, parseBarangayCsv, PRIVACY_VERSION, TERMS_VERSION } = await import('@hatod/shared');
  const { readFileSync } = await import('node:fs');
  const { Timestamp } = await import('firebase-admin/firestore');

  initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();

  // Towns and barangays first: coordinators and addresses point at them.
  const trialEndsAt = Timestamp.fromDate(endOfManilaDay('2027-03-31'));
  const coordinatorIds = PEOPLE.filter((p) => p.coordTowns?.includes(DEMO_TOWN_ID)).map((p) => p.uid);
  await db.doc(`towns/${DEMO_TOWN_ID}`).set({
    ...DEMO_TOWN,
    trialEndsAt,
    coordinatorIds,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`towns/${NEW_TOWN_ID}`).set({
    ...NEW_TOWN,
    trialEndsAt: null,
    coordinatorIds: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const { rows } = parseBarangayCsv(readFileSync(new URL('../seed/demo-barangays.csv', import.meta.url), 'utf8'));
  const barangayNames = new Map<string, string>();
  for (const r of rows) {
    const id = barangayId(DEMO_TOWN_ID, r.name);
    barangayNames.set(r.name, id);
    await db.doc(`barangays/${id}`).set({
      townId: DEMO_TOWN_ID,
      name: r.name,
      centroid: { lat: r.lat, lng: r.lng },
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`  Town: ${DEMO_TOWN.name} (live, ${rows.length} barangays) and ${NEW_TOWN.name} (not live)\n`);

  const { SEED_SHOPS } = await import('./seed-shops');
  const shopsByOwner = new Map(SEED_SHOPS.map((s) => [s.ownerUid, s.id]));

  for (const p of PEOPLE) {
    try {
      await auth.getUser(p.uid);
      await auth.updateUser(p.uid, { phoneNumber: p.phone, displayName: p.name });
    } catch {
      await auth.createUser({ uid: p.uid, phoneNumber: p.phone, displayName: p.name });
    }
    const coordTowns = p.coordTowns ?? [];
    const shopIds = shopsByOwner.has(p.uid) ? [shopsByOwner.get(p.uid)!] : [];
    await auth.setCustomUserClaims(p.uid, { roles: p.roles, coordTowns, shops: shopIds });
    const now = FieldValue.serverTimestamp();
    await db.doc(`users/${p.uid}`).set({
      uid: p.uid,
      name: p.name,
      phone: p.phone,
      roles: p.roles,
      coordTowns,
      shopIds,
      defaultTownId: DEMO_TOWN_ID,
      status: 'active',
      strikes: [],
      locale: 'en',
      consent: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now },
      claimsUpdatedAt: Date.now(),
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  ${p.phone.replace('+63', '0')}  ${p.name.padEnd(18)} ${p.roles.join(', ')}`);
  }
  // Two saved addresses for the demo customer.
  const addr = (label: string, brgy: string, landmark: string, street: string, geo: { lat: number; lng: number }, isDefault: boolean) => ({
    userId: 'demo-customer',
    townId: DEMO_TOWN_ID,
    label,
    barangayId: barangayNames.get(brgy)!,
    barangayName: brgy,
    street,
    landmark,
    geo,
    isDefault,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc('addresses/demo-customer-home').set(
    addr('Home', 'Mabini', 'Blue gate beside the chapel', 'Purok 3', { lat: 11.0999, lng: 122.6492 }, true),
  );
  await db.doc('addresses/demo-customer-work').set(
    addr('Work', 'Poblacion', 'Municipal hall, 2nd floor treasury office', 'Rizal St.', { lat: 11.1053, lng: 122.6432 }, false),
  );

  // Shops and menus.
  for (const sh of SEED_SHOPS) {
    const now = FieldValue.serverTimestamp();
    await db.doc(`shops/${sh.id}`).set({
      ownerId: sh.ownerUid,
      townId: DEMO_TOWN_ID,
      name: sh.name,
      category: sh.category,
      description: sh.description,
      contactPhone: sh.ownerPhone,
      photos: [],
      barangayId: barangayNames.get(sh.barangay)!,
      barangayName: sh.barangay,
      street: sh.street,
      landmark: sh.landmark,
      geo: sh.geo,
      hours: sh.hours,
      closedOn: null,
      prepMinutes: sh.prepMinutes,
      busyMinutes: 0,
      paymentMethods: sh.paymentMethods,
      gcashQrUrl: null,
      mayaQrUrl: null,
      hasOwnRider: sh.hasOwnRider,
      selfDeliveryFee: sh.selfDeliveryFee,
      menuCategories: sh.menuCategories,
      verified: sh.verified,
      verificationStatus: sh.verified ? 'approved' : 'pending',
      status: 'active',
      planId: null,
      ratingAvg: 0,
      ratingCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`shops/${sh.id}/private/info`).set({ ownerName: sh.ownerName, ownerPhone: sh.ownerPhone, permitPath: null, updatedAt: now });
    const old = await db.collection(`shops/${sh.id}/menuItems`).get();
    for (const d of old.docs) await d.ref.delete();
    let order = 1;
    for (const it of sh.items) {
      const variants = it.variants ?? [];
      await db.collection(`shops/${sh.id}/menuItems`).add({
        name: it.name,
        description: it.description ?? '',
        category: it.category,
        price: variants.length ? Math.min(...variants.map((v) => v.price)) : it.price,
        photoUrl: null,
        variants,
        addOns: it.addOns ?? [],
        available: it.available ?? true,
        sortOrder: order++,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  console.log(`  Shops: ${SEED_SHOPS.filter((s) => s.verified).length} listed, ${SEED_SHOPS.filter((s) => !s.verified).length} waiting for verification`);

  console.log('\nSeeded demo accounts. Sign in with any number above; the code shows in the emulator log.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
