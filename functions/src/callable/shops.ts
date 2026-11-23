import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { normalizeRoles, registerShopInput, roundLatLng, type Role, type WeeklyHours } from '@hatod/shared';
import { db } from '../lib/admin';
import { syncClaims } from '../lib/claims';
import { createSubscription } from '../lib/subscriptions';
import { parseInput, requireAuth } from '../lib/guards';

/** Starting hours a new shop can edit: 7 AM to 7 PM, Monday to Saturday. */
const DEFAULT_HOURS: WeeklyHours = Object.fromEntries(
  (['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const).map((d) => [d, [{ open: '07:00', close: '19:00' }]]),
);

/**
 * A signed-in person registers their shop. It is created unverified and hidden
 * from customers until the town coordinator checks it (M8). The person gains
 * the shop role so they can set up their menu and hours meanwhile.
 * One shop per person in the MVP.
 */
export const registerShop = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(registerShopInput, req.data);

  const userRef = db.collection('users').doc(caller.uid);
  const townRef = db.collection('towns').doc(input.townId);
  const barangayRef = db.collection('barangays').doc(input.barangayId);
  const shopRef = db.collection('shops').doc();

  await db.runTransaction(async (tx) => {
    const [user, town, barangay, owned] = await Promise.all([
      tx.get(userRef),
      tx.get(townRef),
      tx.get(barangayRef),
      tx.get(db.collection('shops').where('ownerId', '==', caller.uid).limit(1)),
    ]);
    if (!user.exists) throw new HttpsError('failed-precondition', 'profile_required');
    if (user.get('status') !== 'active') throw new HttpsError('permission-denied', 'account_not_active');
    if (!owned.empty) throw new HttpsError('already-exists', 'shop_exists');
    if (!town.exists) throw new HttpsError('not-found', 'town_not_found');
    if (!barangay.exists || barangay.get('townId') !== input.townId) {
      throw new HttpsError('invalid-argument', 'barangay_not_in_town');
    }

    const now = FieldValue.serverTimestamp();
    tx.create(shopRef, {
      ownerId: caller.uid,
      townId: input.townId,
      name: input.name,
      category: input.category,
      description: input.description,
      contactPhone: input.contactPhone,
      photos: [],
      barangayId: input.barangayId,
      barangayName: barangay.get('name'),
      street: input.street,
      landmark: input.landmark,
      geo: roundLatLng(input.geo),
      hours: DEFAULT_HOURS,
      closedOn: null,
      prepMinutes: input.prepMinutes,
      busyMinutes: 0,
      paymentMethods: input.paymentMethods,
      gcashQrUrl: null,
      mayaQrUrl: null,
      hasOwnRider: input.hasOwnRider,
      selfDeliveryFee: input.hasOwnRider ? input.selfDeliveryFee : 0,
      menuCategories: [],
      verified: false,
      verificationStatus: 'pending',
      status: 'active',
      planId: null,
      ratingAvg: 0,
      ratingCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const plan = createSubscription(tx, {
      type: 'shop',
      id: shopRef.id,
      ownerUid: caller.uid,
      townId: input.townId,
      townTrialEndsAt: (town.get('trialEndsAt') as { toMillis(): number } | null)?.toMillis() ?? null,
      targetRef: shopRef,
    });
    tx.update(shopRef, plan);
    tx.create(shopRef.collection('private').doc('info'), {
      ownerName: user.get('name'),
      ownerPhone: user.get('phone'),
      permitPath: null,
      updatedAt: now,
    });

    const next = normalizeRoles([...(user.get('roles') ?? []), 'shop']) as Role[];
    tx.update(userRef, { roles: next, shopIds: FieldValue.arrayUnion(shopRef.id), updatedAt: now });
  });

  await syncClaims(caller.uid);
  return { shopId: shopRef.id };
});
