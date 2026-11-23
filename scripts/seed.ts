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
  // pre-launch: coordinators can send sign-up links to shops and riders
  acceptingSignups: true,
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
  { uid: 'demo-rider-2', name: 'Jojo Habal-Habal', phone: '+639170000021', roles: ['customer', 'rider'] },
  { uid: 'demo-rider-3', name: 'Bea Bisikleta', phone: '+639170000022', roles: ['customer', 'rider'] },
  { uid: 'demo-rider-4', name: 'Nonoy Newbie', phone: '+639170000023', roles: ['customer', 'rider'] },
];

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { FieldValue, getFirestore } = await import('firebase-admin/firestore');
  const { barangayId, coarseLatLng, endOfManilaDay, menuSummary, parseBarangayCsv, PRIVACY_VERSION, TERMS_VERSION } = await import('@hatod/shared');
  const { readFileSync } = await import('node:fs');
  const { Timestamp } = await import('firebase-admin/firestore');

  initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();

  // Towns and barangays first: coordinators and addresses point at them.
  const trialEndsAt = Timestamp.fromDate(endOfManilaDay('2027-03-31'));
  const coordinatorIds = PEOPLE.filter((p) => p.coordTowns?.includes(DEMO_TOWN_ID)).map((p) => p.uid);
  // The rules only accept image URLs from this bucket.
  await db.doc('config/app').set({ storageBucket: process.env.STORAGE_BUCKET ?? `${process.env.GCLOUD_PROJECT ?? 'demo-hatod'}.appspot.com` });
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
    await db.doc(`shops/${sh.id}`).update({
      menuSummary: menuSummary(
        sh.items.map((it) => ({ name: it.name, category: it.category, price: it.price, available: it.available ?? true, variants: it.variants ?? [] })),
      ),
    });
  }
  // Subscriptions: everyone on the town's free trial; Rosa's sari-sari store chose free Basic.
  const trialMs = trialEndsAt.toMillis();
  const nowMs = Date.now();
  const writeSub = async (type: 'shop' | 'rider', id: string, ownerUid: string, planCode: string, balance = 0) => {
    const status = planCode === 'shop_basic' ? 'active' : 'trial';
    await db.doc(`subscriptions/${type}_${id}`).set({
      subscriberType: type, subscriberId: id, ownerUid, townId: DEMO_TOWN_ID, planCode, status,
      trialEndsAt: trialMs, currentPeriodEnd: null, balance, lastChargedDate: null,
      nextChangeAt: planCode === 'shop_basic' ? null : trialMs, createdAt: nowMs, updatedAt: nowMs,
    });
    await db.doc(`${type === 'shop' ? 'shops' : 'riders'}/${id}`).update({ planCode, subscriptionStatus: status });
  };
  for (const sh of SEED_SHOPS) await writeSub('shop', sh.id, sh.ownerUid, sh.id === 'demo-shop-rosa' ? 'shop_basic' : sh.id === 'demo-shop-susan' ? 'shop_plus' : 'shop_standard');
  console.log(`  Shops: ${SEED_SHOPS.filter((s) => s.verified).length} listed, ${SEED_SHOPS.filter((s) => !s.verified).length} waiting for verification`);

  // Riders.
  const { SEED_RIDERS } = await import('./seed-riders');
  const allBarangays = [...barangayNames.values()];
  for (const r of SEED_RIDERS) {
    const now = FieldValue.serverTimestamp();
    const id = (name: string) => barangayNames.get(name)!;
    await db.doc(`riders/${r.uid}`).set({
      userId: r.uid,
      townId: DEMO_TOWN_ID,
      name: r.name,
      photoUrl: null,
      vehicleType: r.vehicleType,
      vehicleDesc: r.vehicleDesc,
      plateNo: r.plateNo,
      verified: r.verified,
      verificationStatus: r.verified ? 'approved' : 'pending',
      status: 'active',
      online: r.online,
      rainOn: false,
      lastActiveAt: r.online ? now : null,
      // online riders share a rough location (about 1 km) for "nearest" sorting
      approxLocation: r.online && r.near ? coarseLatLng(r.near) : null,
      servedBarangayIds: r.serves.length ? r.serves.map(id) : allBarangays,
      maxKm: r.maxKm,
      rateCard: { ...r.rateCard, fixedFares: r.rateCard.fixedFares.map((f) => ({ fromBarangayId: id(f.from), toBarangayId: id(f.to), fee: f.fee })) },
      rateUpdatedAt: null,
      planId: null,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      completedCount: r.completedCount,
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`riders/${r.uid}/private/info`).set({
      legalName: r.name,
      phone: r.phone,
      emergencyContact: { name: 'Demo Contact', phone: '+639179999999', relation: 'Sibling' },
      docs: { governmentId: null, license: null, orcr: null, clearance: null },
      updatedAt: now,
    });
  }
  for (const r of SEED_RIDERS) await writeSub('rider', r.uid, r.uid, r.uid === 'demo-rider-3' ? 'rider_daily' : 'rider_monthly', r.uid === 'demo-rider-3' ? 30 : 0);
  console.log(`  Riders: ${SEED_RIDERS.filter((r) => r.verified).length} verified (${SEED_RIDERS.filter((r) => r.online).length} online), ${SEED_RIDERS.filter((r) => !r.verified).length} waiting for verification`);

  // Two weeks of past orders so the dashboard has something to show.
  const { Timestamp: Ts } = await import('firebase-admin/firestore');
  const old = await db.collection('orders').where('requestId', '>=', 'seed').where('requestId', '<', 'seee').get();
  for (const d of old.docs) await d.ref.delete();
  const customers = ['demo-customer', 'demo-owner-1', 'demo-owner-2', 'demo-owner-3', 'demo-owner-4', 'demo-rider-4'];
  const riderIds = ['demo-rider', 'demo-rider-2', 'demo-shop-rider'];
  const listedShops = SEED_SHOPS.filter((s) => s.verified);
  let k = 0;
  for (let day = 13; day >= 0; day--) {
    const perDay = 2 + ((day * 7) % 5);
    for (let i = 0; i < perDay; i++, k++) {
      const shop = listedShops[k % listedShops.length]!;
      const placedAt = Date.now() - day * 86_400_000 - (i + 1) * 3_600_000;
      const status = k % 11 === 3 ? 'CANCELLED' : k % 13 === 5 ? 'EXPIRED' : 'COMPLETED';
      const riderId = status === 'COMPLETED' && !shop.hasOwnRider ? riderIds[k % riderIds.length]! : null;
      const item = shop.items[0]!;
      const price = item.variants?.[0]?.price ?? item.price;
      await db.doc(`orders/seed_${String(k).padStart(4, '0')}`).set({
        requestId: `seed${String(k).padStart(8, '0')}`,
        townId: DEMO_TOWN_ID,
        customerId: customers[k % customers.length],
        customerName: 'Demo customer',
        customerPhone: '+639170000005',
        shopId: shop.id,
        shopOwnerId: shop.ownerUid,
        shopName: shop.name,
        shopPhone: shop.ownerPhone,
        items: [{ itemId: 'x', name: item.name, variant: item.variants?.[0]?.name ?? null, addOns: [], qty: 1, note: '', unitPrice: price }],
        itemsTotal: price,
        pickup: { geo: shop.geo, landmark: shop.landmark, barangayName: shop.barangay },
        dropoff: { label: 'Home', barangayId: barangayNames.get('Poblacion')!, barangayName: 'Poblacion', street: '', landmark: 'Near the plaza', geo: { lat: 11.1052, lng: 122.6441 } },
        paymentMethod: 'cash',
        chosenRiderId: riderId,
        rider: null,
        declinedRiderIds: [],
        offerId: null,
        distanceKm: 1.5,
        distanceEstimate: true,
        deliveryFee: 40,
        feeBreakdown: null,
        feeLocked: status === 'COMPLETED',
        declineReason: null,
        cancelReason: status === 'CANCELLED' ? 'changed_mind' : null,
        cancelledBy: status === 'CANCELLED' ? 'customer' : null,
        readyAt: null,
        ready: status === 'COMPLETED',
        shopPaid: status === 'COMPLETED',
        riderPaid: status === 'COMPLETED',
        expiresAt: null,
        deliveredAt: status === 'COMPLETED' ? Ts.fromMillis(placedAt + 35 * 60_000) : null,
        status,
        riderId,
        selfDelivery: shop.hasOwnRider,
        participants: [customers[k % customers.length], shop.ownerUid, ...(riderId ? [riderId] : [])],
        statusHistory: [
          { status: 'PLACED', at: Ts.fromMillis(placedAt), by: 'customer' },
          ...(status === 'COMPLETED'
            ? [
                { status: 'RIDER_ASSIGNED', at: Ts.fromMillis(placedAt + (2 + (k % 6)) * 60_000), by: riderId ? 'rider' : 'shop' },
                { status: 'COMPLETED', at: Ts.fromMillis(placedAt + 40 * 60_000), by: 'customer' },
              ]
            : [{ status, at: Ts.fromMillis(placedAt + 10 * 60_000), by: 'system' }]),
        ],
        createdAt: Ts.fromMillis(placedAt),
        updatedAt: Ts.fromMillis(placedAt),
      });
    }
  }
  console.log(`  Orders: ${k} sample orders over the last 14 days (for the dashboard)`);

  console.log('\nSeeded demo accounts. Sign in with any number above; the code shows in the emulator log.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
