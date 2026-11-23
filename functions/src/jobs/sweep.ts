import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { ORDER_TIMING } from '@hatod/shared';
import { db } from '../lib/admin';
import { ORS_API_KEY, SEMAPHORE_API_KEY } from '../lib/params';
import { liftFields } from '../lib/strikes';
import { applyTimeouts, flush, getOrderIn, offersCol, orderCode, ordersCol, transition } from '../orders/core';

/**
 * Everything time-based, run every minute. Each step is idempotent, so a
 * missed or doubled run is harmless:
 *  - orders a shop did not answer within 10 minutes expire
 *  - rider offers not answered within 60 seconds expire (customer picks again)
 *  - delivered orders complete by themselves after 2 hours
 *  - riders idle for 2 hours go offline
 */
export async function sweep(now = Date.now()) {
  const ts = Timestamp.fromMillis(now);
  const [placed, offers, delivered, idle] = await Promise.all([
    ordersCol().where('status', '==', 'PLACED').where('expiresAt', '<=', ts).limit(200).get(),
    offersCol().where('status', '==', 'pending').where('expiresAt', '<=', ts).limit(200).get(),
    ordersCol().where('status', '==', 'DELIVERED').where('deliveredAt', '<=', Timestamp.fromMillis(now - ORDER_TIMING.autoCompleteMs)).limit(200).get(),
    db.collection('riders').where('online', '==', true).where('lastActiveAt', '<=', Timestamp.fromMillis(now - ORDER_TIMING.riderIdleMs)).limit(200).get(),
  ]);

  const orderIds = new Set([...placed.docs.map((d) => d.id), ...offers.docs.map((d) => d.get('orderId') as string)]);
  for (const id of orderIds) await flush(await applyTimeouts(id, now));

  // An offer whose order already moved on (cancelled, re-offered) just closes.
  for (const o of offers.docs) {
    const fresh = await o.ref.get();
    if (fresh.get('status') === 'pending') await o.ref.update({ status: 'expired', respondedAt: FieldValue.serverTimestamp() });
  }

  for (const d of delivered.docs) {
    await db.runTransaction(async (tx) => {
      const { ref, order } = await getOrderIn(tx, d.id);
      if (order.status !== 'DELIVERED') return;
      tx.update(db.collection('users').doc(order.customerId), { completedOrders: FieldValue.increment(1) });
      if (order.riderId) tx.update(db.collection('riders').doc(order.riderId), { completedCount: FieldValue.increment(1) });
      transition(tx, ref, order, 'COMPLETED', 'system');
    });
    logger.info('Auto-completed', { order: orderCode(d.data() as { requestId: string }) });
  }

  for (const r of idle.docs) await r.ref.update({ online: false, approxLocation: null, updatedAt: FieldValue.serverTimestamp() });

  // 7-day strike suspensions end by themselves. (Safety suspensions wait for a person.)
  let lifted = 0;
  for (const coll of ['users', 'riders', 'shops']) {
    const due = await db.collection(coll).where('suspendedReason', '==', 'strikes').where('suspendedUntil', '<=', ts).limit(200).get();
    for (const d of due.docs) await d.ref.update(liftFields);
    lifted += due.size;
  }

  return { expiredOrders: placed.size, expiredOffers: offers.size, autoCompleted: delivered.size, ridersOffline: idle.size, suspensionsLifted: lifted };
}

export const sweepOrders = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'Asia/Manila', secrets: [SEMAPHORE_API_KEY, ORS_API_KEY], retryCount: 0 },
  async () => {
    const result = await sweep();
    if (Object.values(result).some((n) => n > 0)) logger.info('sweep', result);
  },
);
