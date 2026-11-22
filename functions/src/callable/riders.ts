import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  canChangeRates,
  DEFAULT_RATE_CARD,
  nextRateChangeAt,
  normalizeRoles,
  RIDER_LIMITS,
  registerRiderInput,
  updateRateCardInput,
  updateServiceAreaInput,
  type Role,
} from '@hatod/shared';
import { db } from '../lib/admin';
import { syncClaims } from '../lib/claims';
import { parseInput, requireAuth, requireRole } from '../lib/guards';

/**
 * A signed-in person signs up as a rider. The rider record is created
 * unverified; the town coordinator checks documents in person (M8). They start
 * with a sample rate card and every barangay in town, and can change both.
 */
export const registerRider = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(registerRiderInput, req.data);
  const userRef = db.collection('users').doc(caller.uid);
  const riderRef = db.collection('riders').doc(caller.uid);
  const townRef = db.collection('towns').doc(input.townId);

  await db.runTransaction(async (tx) => {
    const [user, rider, town, barangays] = await Promise.all([
      tx.get(userRef),
      tx.get(riderRef),
      tx.get(townRef),
      tx.get(db.collection('barangays').where('townId', '==', input.townId)),
    ]);
    if (!user.exists) throw new HttpsError('failed-precondition', 'profile_required');
    if (user.get('status') !== 'active') throw new HttpsError('permission-denied', 'account_not_active');
    if (rider.exists) throw new HttpsError('already-exists', 'rider_exists');
    if (!town.exists) throw new HttpsError('not-found', 'town_not_found');

    const now = FieldValue.serverTimestamp();
    tx.create(riderRef, {
      userId: caller.uid,
      townId: input.townId,
      name: user.get('name'),
      photoUrl: null,
      vehicleType: input.vehicleType,
      vehicleDesc: input.vehicleDesc,
      plateNo: input.plateNo,
      verified: false,
      verificationStatus: 'pending',
      status: 'active',
      online: false,
      rainOn: false,
      lastActiveAt: null,
      servedBarangayIds: barangays.docs.filter((b) => b.get('active') !== false).map((b) => b.id),
      maxKm: RIDER_LIMITS.maxKmDefault,
      rateCard: DEFAULT_RATE_CARD,
      rateUpdatedAt: null,
      planId: null,
      ratingAvg: 0,
      ratingCount: 0,
      completedCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    tx.create(riderRef.collection('private').doc('info'), {
      legalName: user.get('name'),
      phone: user.get('phone'),
      emergencyContact: input.emergencyContact,
      docs: { governmentId: null, license: null, orcr: null, clearance: null },
      updatedAt: now,
    });
    const roles = normalizeRoles([...(user.get('roles') ?? []), 'rider']) as Role[];
    tx.update(userRef, { roles, updatedAt: now });
  });

  await syncClaims(caller.uid);
  return { riderId: caller.uid };
});

/**
 * The rider changes their prices. Before verification: any time (setting up).
 * After: at most once per 24 hours, so customers see stable prices.
 * Fees already agreed on orders are locked separately (M6) and never change.
 */
export const updateRateCard = onCall(async (req) => {
  const caller = requireRole(req, 'rider');
  const { rateCard } = parseInput(updateRateCardInput, req.data);
  const ref = db.collection('riders').doc(caller.uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'rider_not_found');
    const verified = snap.get('verified') === true;
    const last = (snap.get('rateUpdatedAt') as Timestamp | null)?.toMillis() ?? null;
    if (!canChangeRates(last, verified, Date.now())) {
      throw new HttpsError('failed-precondition', 'rate_change_too_soon', { nextAllowedAt: nextRateChangeAt(last, verified) });
    }
    // Fixed fares may only name barangays of the rider's own town.
    const ids = [...new Set(rateCard.fixedFares.flatMap((f) => [f.fromBarangayId, f.toBarangayId]))];
    if (ids.length) {
      const snaps = await tx.getAll(...ids.map((id) => db.collection('barangays').doc(id)));
      if (snaps.some((b) => !b.exists || b.get('townId') !== snap.get('townId'))) {
        throw new HttpsError('invalid-argument', 'barangay_not_in_town');
      }
    }
    // Before verification, changes do not start the 24-hour clock.
    tx.update(ref, { rateCard, rateUpdatedAt: verified ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() });
    return { nextAllowedAt: verified ? Date.now() + 24 * 3600_000 : null };
  });
});

/** The rider chooses which barangays they deliver to and how far they will go. */
export const updateServiceArea = onCall(async (req) => {
  const caller = requireRole(req, 'rider');
  const input = parseInput(updateServiceAreaInput, req.data);
  const ref = db.collection('riders').doc(caller.uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'rider_not_found');

  const ids = [...new Set(input.servedBarangayIds)];
  const barangays = await db.getAll(...ids.map((id) => db.collection('barangays').doc(id)));
  if (barangays.some((b) => !b.exists || b.get('townId') !== snap.get('townId'))) {
    throw new HttpsError('invalid-argument', 'barangay_not_in_town');
  }
  await ref.update({ servedBarangayIds: ids, maxKm: input.maxKm, updatedAt: FieldValue.serverTimestamp() });
  return { servedBarangayIds: ids, maxKm: input.maxKm };
});
