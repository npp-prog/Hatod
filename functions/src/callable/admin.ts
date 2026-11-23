import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  computeMetrics,
  hasRole,
  metricsInput,
  setAccountStatusInput,
  verifyListingInput,
  type MetricOrder,
  type OrderDoc,
} from '@hatod/shared';
import { db } from '../lib/admin';
import { logAdminAction } from '../lib/audit';
import { parseInput, requireAuth, type Caller } from '../lib/guards';
import { notify } from '../lib/notify';
import { ORS_API_KEY, SEMAPHORE_API_KEY } from '../lib/params';
import { isBanned, liftFields, strikesRef, suspensionFields, targetRef } from '../lib/strikes';
import { ms } from '../orders/core';

const fail = (code: 'permission-denied' | 'not-found' | 'failed-precondition', message: string): never => {
  throw new HttpsError(code, message);
};

/** Admins act everywhere; coordinators only in towns they manage. */
function canManageTown(caller: Caller, townId: string | null | undefined): boolean {
  if (hasRole(caller.claims.roles, 'admin')) return true;
  return !!townId && hasRole(caller.claims.roles, 'coordinator') && !!caller.claims.coordTowns?.includes(townId);
}

/** Coordinator approves (after meeting them and checking documents) or rejects a shop or rider. */
export const verifyListing = onCall({ secrets: [SEMAPHORE_API_KEY, ORS_API_KEY] }, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(verifyListingInput, req.data);
  const ref = db.collection(input.kind === 'shop' ? 'shops' : 'riders').doc(input.id);
  const ownerUid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'not_found');
    if (!canManageTown(caller, snap.get('townId'))) fail('permission-denied', 'not_your_town');
    // Nobody but an admin verifies their own listing.
    const owner = input.kind === 'shop' ? snap.get('ownerId') : input.id;
    if (owner === caller.uid && !hasRole(caller.claims.roles, 'admin')) fail('permission-denied', 'not_your_own');
    const approve = input.decision === 'approve';
    tx.update(ref, {
      verified: approve,
      verificationStatus: approve ? 'approved' : 'rejected',
      verificationNote: input.note,
      verifiedBy: caller.uid,
      verifiedAt: FieldValue.serverTimestamp(),
      // A rejected rider cannot stay online.
      ...(input.kind === 'rider' && !approve ? { online: false, approxLocation: null } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    logAdminAction(tx, { action: `verify_${input.kind}`, actorId: caller.uid, targetId: input.id, after: { decision: input.decision }, note: input.note });
    return input.kind === 'shop' ? (snap.get('ownerId') as string) : input.id;
  });
  await notify(ownerUid, {
    title: input.decision === 'approve' ? 'You are verified' : 'Verification needs attention',
    body:
      input.decision === 'approve'
        ? input.kind === 'shop'
          ? 'Your shop is now visible to customers on Hatod.'
          : 'You are verified. Go online in the Hatod app to receive jobs.'
        : `Your ${input.kind} verification was not approved: ${input.note}`,
    link: input.kind === 'shop' ? '/shop' : '/rider',
    sms: true,
  });
  return { ok: true };
});

/**
 * Suspend (coordinator in their town, or admin), ban or reinstate (admin only)
 * a customer, shop or rider. Every action is logged with its note.
 */
export const setAccountStatus = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(setAccountStatusInput, req.data);
  const isAdmin = hasRole(caller.claims.roles, 'admin');
  if (input.action !== 'suspend' && !isAdmin) fail('permission-denied', 'admin_only');
  const ref = targetRef(input.type, input.id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'not_found');
    if (input.type === 'customer' && snap.id === caller.uid) fail('failed-precondition', 'not_yourself');
    if (!isAdmin) {
      if (input.type === 'customer') {
        // A customer belongs to the towns they order in (defaultTownId is theirs
        // to change). Coordinators and admins are only handled by admins.
        const roles = (snap.get('roles') as string[] | undefined) ?? [];
        if (roles.includes('admin') || roles.includes('coordinator')) fail('permission-denied', 'admin_only');
        const towns = caller.claims.coordTowns ?? [];
        const inTown = towns.length
          ? await tx.get(db.collection('orders').where('customerId', '==', snap.id).where('townId', 'in', towns.slice(0, 30)).limit(1))
          : null;
        if (!inTown || inTown.empty) fail('permission-denied', 'not_your_town');
      } else if (!canManageTown(caller, snap.get('townId'))) fail('permission-denied', 'not_your_town');
    }
    const before = { status: snap.get('status'), suspendedReason: snap.get('suspendedReason') ?? null };
    if (input.action === 'suspend' && isBanned(snap)) fail('failed-precondition', 'already_banned');
    if (input.action === 'reinstate') {
      tx.update(ref, liftFields);
      tx.delete(strikesRef(input.type, input.id));
    }
    else if (input.action === 'ban')
      tx.update(ref, { status: 'banned', suspendedReason: 'banned', suspendedUntil: null, ...(input.type === 'rider' ? { online: false, approxLocation: null } : {}), updatedAt: FieldValue.serverTimestamp() });
    else tx.update(ref, suspensionFields(input.type, isAdmin ? 'admin' : 'coordinator', null));
    logAdminAction(tx, { action: `${input.action}_${input.type}`, actorId: caller.uid, targetId: input.id, before, note: input.note });
  });
  return { ok: true };
});

/** Pilot dashboard numbers for one town (coordinator or admin) or all towns (admin). */
export const adminMetrics = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(metricsInput, req.data);
  if (input.townId ? !canManageTown(caller, input.townId) : !hasRole(caller.claims.roles, 'admin')) fail('permission-denied', 'not_your_town');
  const now = Date.now();
  const since = Timestamp.fromMillis(now - input.days * 24 * 3600_000);
  let q = db.collection('orders').where('createdAt', '>=', since);
  if (input.townId) q = q.where('townId', '==', input.townId);
  const snap = await q.select('status', 'customerId', 'shopId', 'riderId', 'createdAt', 'statusHistory').get();
  const orders: MetricOrder[] = snap.docs.map((d) => {
    const o = d.data() as Pick<OrderDoc, 'status' | 'customerId' | 'shopId' | 'riderId' | 'createdAt' | 'statusHistory'>;
    const placed = ms(o.createdAt);
    const assigned = o.statusHistory?.find((h) => h.status === 'RIDER_ASSIGNED');
    return { status: o.status, customerId: o.customerId, shopId: o.shopId, riderId: o.riderId, createdAt: placed, assignMs: assigned ? ms(assigned.at) - placed : null };
  });
  const metrics = computeMetrics(orders, now, input.days);

  // Listing counts for context.
  const [shops, riders, onlineRiders] = await Promise.all(
    ['shops', 'riders', 'riders'].map((c, i) => {
      let qq = db.collection(c).where('verified', '==', true).where('status', '==', 'active');
      if (i === 2) qq = qq.where('online', '==', true);
      if (input.townId) qq = qq.where('townId', '==', input.townId);
      return qq.count().get().then((r) => r.data().count);
    }),
  );
  // Trial to paid: of the paid plans (Basic is free), how many have ever paid.
  let sq = db.collection('subscriptions').where('planCode', 'in', ['shop_standard', 'shop_plus', 'rider_daily', 'rider_monthly']);
  if (input.townId) sq = sq.where('townId', '==', input.townId);
  const subs = await sq.select('currentPeriodEnd', 'balance', 'lastChargedDate').get();
  const paid = subs.docs.filter((d) => d.get('currentPeriodEnd') !== null || Number(d.get('balance') ?? 0) > 0 || d.get('lastChargedDate')).length;
  return { ...metrics, listedShops: shops, verifiedRiders: riders, onlineRiders, subscriptions: subs.size, paidSubscriptions: paid };
});
