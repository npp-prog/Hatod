import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  addToAverage,
  hasRole,
  RATING_TAGS,
  RATING_WINDOW_MS,
  resolveReportInput,
  submitRatingInput,
  submitReportInput,
  type OrderActor,
  type TargetType,
} from '@hatod/shared';
import { db } from '../lib/admin';
import { parseInput, requireAuth } from '../lib/guards';
import { ORS_API_KEY, SEMAPHORE_API_KEY } from '../lib/params';
import { addStrike, isBanned, liftFields, strikesRef, suspensionFields, targetRef } from '../lib/strikes';
import { actorFor, flush, getOrderIn, ms, orderCode, type Order, type Outbox } from '../orders/core';

const fail = (code: 'failed-precondition' | 'permission-denied' | 'not-found' | 'already-exists' | 'invalid-argument', message: string): never => {
  throw new HttpsError(code, message);
};

const SAFETY_SUSPEND_WINDOW_MS = 48 * 3600_000;
const SAFETY_SUSPENDS_PER_REPORTER = 2;

/** Who may rate or report whom on an order. */
const ALLOWED: Record<'customer' | 'shop' | 'rider', { rate: TargetType[]; report: TargetType[] }> = {
  customer: { rate: ['shop', 'rider'], report: ['shop', 'rider'] },
  shop: { rate: ['customer'], report: ['customer', 'rider'] },
  rider: { rate: ['customer'], report: ['customer', 'shop'] },
};

function targetOf(order: Order, type: TargetType): { id: string; name: string } | null {
  if (type === 'shop') return { id: order.shopId, name: order.shopName };
  if (type === 'customer') return { id: order.customerId, name: order.customerName };
  return order.riderId ? { id: order.riderId, name: order.rider?.name ?? '' } : null;
}

function partyActor(actor: OrderActor | null): 'customer' | 'shop' | 'rider' {
  if (actor === 'customer' || actor === 'shop' || actor === 'rider') return actor;
  return fail('permission-denied', 'not_on_order');
}

/** Rate the other side of a completed order (1–5 stars, quick tags, a short comment). One rating per side. */
export const submitRating = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(submitRatingInput, req.data);
  await db.runTransaction(async (tx) => {
    const { ref, order } = await getOrderIn(tx, input.orderId);
    const actor = partyActor(actorFor(caller, order));
    if (!ALLOWED[actor].rate.includes(input.toType)) fail('permission-denied', 'cannot_rate_target');
    if (order.status !== 'COMPLETED') fail('failed-precondition', 'not_completed');
    const completedAt = ms(order.statusHistory.find((h) => h.status === 'COMPLETED')?.at);
    if (Date.now() - completedAt > RATING_WINDOW_MS) fail('failed-precondition', 'rating_window_closed');
    const target = targetOf(order, input.toType) ?? fail('failed-precondition', 'no_rider');
    const tags = input.tags.filter((t) => RATING_TAGS[input.toType].includes(t));

    const ratingRef = db.collection('ratings').doc(`${order.id}_${caller.uid}_${input.toType}`);
    const tRef = targetRef(input.toType, target.id);
    const [existing, targetSnap] = await Promise.all([tx.get(ratingRef), tx.get(tRef)]);
    if (existing.exists) fail('already-exists', 'already_rated');
    const next = addToAverage(Number(targetSnap.get('ratingAvg') ?? 0), Number(targetSnap.get('ratingCount') ?? 0), input.stars);

    tx.create(ratingRef, {
      orderId: order.id,
      townId: order.townId,
      fromUserId: caller.uid,
      fromRole: actor,
      toType: input.toType,
      toId: target.id,
      stars: input.stars,
      tags,
      comment: input.comment,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(tRef, { ratingAvg: next.avg, ratingCount: next.count }, { merge: true });
    tx.update(ref, { [`ratings.${actor}_${input.toType}`]: true, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

/**
 * Report a problem with someone on an order. Safety reports are urgent: once
 * a rider has been assigned (people have met), the reported person is
 * suspended at once until the town coordinator reviews it.
 */
export const submitReport = onCall({ secrets: [SEMAPHORE_API_KEY, ORS_API_KEY] }, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(submitReportInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const { order } = await getOrderIn(tx, input.orderId);
    const actor = partyActor(actorFor(caller, order));
    if (!ALLOWED[actor].report.includes(input.targetType)) fail('permission-denied', 'cannot_report_target');
    const target = targetOf(order, input.targetType) ?? fail('failed-precondition', 'no_rider');
    const reportRef = db.collection('reports').doc(`${order.id}_${caller.uid}_${input.targetType}`);
    const tRef = targetRef(input.targetType, target.id);
    const [existing, town, targetSnap] = await Promise.all([tx.get(reportRef), tx.get(db.collection('towns').doc(order.townId)), tx.get(tRef)]);
    if (existing.exists) fail('already-exists', 'already_reported');

    const urgent = input.category === 'safety';
    const met = order.statusHistory.some((h) => h.status === 'RIDER_ASSIGNED');
    // Instant suspension is for something that just happened: the order is
    // still running or ended within 48 hours. Older reports wait for review.
    const lastAt = Math.max(...order.statusHistory.map((h) => ms(h.at)));
    const recent = !['COMPLETED', 'CANCELLED', 'EXPIRED', 'SHOP_DECLINED'].includes(order.status) || Date.now() - lastAt < SAFETY_SUSPEND_WINDOW_MS;
    // Shops are not taken offline on one report; and one reporter can trigger
    // at most SAFETY_SUSPENDS_PER_REPORTER instant suspensions in 30 days.
    const byReporter = await tx.get(
      db.collection('reports').where('reporterId', '==', caller.uid).where('suspendedOnReport', '==', true).where('createdAt', '>=', new Date(Date.now() - 30 * 86_400_000)),
    );
    const underCap = byReporter.size < SAFETY_SUSPENDS_PER_REPORTER;
    // Only an active account is suspended on report: never an already-suspended or banned one.
    const suspendNow = urgent && met && recent && underCap && input.targetType !== 'shop' && targetSnap.get('status') === 'active';
    tx.create(reportRef, {
      orderId: order.id,
      orderCode: orderCode(order),
      townId: order.townId,
      reporterId: caller.uid,
      reporterRole: actor,
      targetType: input.targetType,
      targetId: target.id,
      targetName: target.name,
      category: input.category,
      details: input.details,
      urgent,
      suspendedOnReport: suspendNow,
      status: 'open',
      resolution: null,
      note: null,
      handledBy: null,
      createdAt: FieldValue.serverTimestamp(),
      resolvedAt: null,
    });
    if (suspendNow) tx.update(tRef, suspensionFields(input.targetType, 'safety_review', null));

    const coordinators = ((town.get('coordinatorIds') as string[] | undefined) ?? []).map((uid) => ({
      uid,
      notice: {
        title: urgent ? 'URGENT safety report' : 'New report',
        body: `${urgent ? 'Safety report' : 'Report'} about ${target.name} on order ${orderCode(order)}.`,
        link: '/coordinator/reports',
        sms: urgent,
      },
    }));
    return coordinators as Outbox;
  });
  await flush(outbox);
  return { ok: true };
});

/**
 * Coordinator (for their town) or admin decides a report. Confirmed = a
 * strike for the reported person: 3 in 30 days suspends them for 7 days.
 * A confirmed safety report keeps them suspended until an admin lifts it;
 * a dismissed one lifts the suspension it caused.
 */
export const resolveReport = onCall({ secrets: [SEMAPHORE_API_KEY, ORS_API_KEY] }, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(resolveReportInput, req.data);
  const outbox = await db.runTransaction(async (tx) => {
    const reportRef = db.collection('reports').doc(input.reportId);
    const report = await tx.get(reportRef);
    if (!report.exists) fail('not-found', 'report_not_found');
    const townId = report.get('townId') as string;
    const allowed = hasRole(caller.claims.roles, 'admin') || (hasRole(caller.claims.roles, 'coordinator') && caller.claims.coordTowns?.includes(townId));
    if (!allowed) fail('permission-denied', 'not_your_town');
    if (report.get('status') !== 'open') fail('failed-precondition', 'already_resolved');

    const type = report.get('targetType') as TargetType;
    const targetId = report.get('targetId') as string;
    const tSnap = await tx.get(targetRef(type, targetId));
    const sSnap = input.resolution === 'confirmed' ? await tx.get(strikesRef(type, targetId)) : null;
    const ownerUid = type === 'shop' ? (tSnap.get('ownerId') as string) : targetId;
    const out: Outbox = [];

    tx.update(reportRef, {
      status: 'resolved',
      resolution: input.resolution,
      note: input.note,
      handledBy: caller.uid,
      resolvedAt: FieldValue.serverTimestamp(),
    });

    if (input.resolution === 'confirmed') {
      const result = addStrike(tx, type, tSnap, sSnap!, { source: 'report', ref: reportRef.id, at: Date.now() });
      if (report.get('category') === 'safety' && !isBanned(tSnap)) tx.update(tSnap.ref, suspensionFields(type, 'safety', null));
      if (result.suspended || report.get('category') === 'safety') {
        out.push({ uid: ownerUid, notice: { title: 'Account suspended', body: 'Your Hatod account is suspended after a confirmed report. Contact your town coordinator.', link: '/', sms: true } });
      } else {
        out.push({ uid: ownerUid, notice: { title: 'Warning', body: 'A report about you was confirmed. 3 confirmed reports in 30 days mean a 7-day suspension.', link: '/' } });
      }
    } else if (report.get('suspendedOnReport') === true && tSnap.get('status') === 'suspended' && tSnap.get('suspendedReason') === 'safety_review') {
      tx.update(tSnap.ref, liftFields);
      out.push({ uid: ownerUid, notice: { title: 'Suspension lifted', body: 'The report was reviewed and dismissed. Your account is active again.', link: '/' } });
    }
    return out;
  });
  await flush(outbox);
  return { ok: true };
});

