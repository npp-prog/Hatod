import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { z } from 'zod';
import {
  choosePlanInput,
  coarseLatLng,
  formatPHP,
  hasRole,
  recordCashPaymentInput,
  RIDER_PLANS,
  setPlanPricesInput,
  SHOP_PLANS,
  startCheckoutInput,
  switchPlan,
  type SubscriptionDoc,
} from '@hatod/shared';
import { db } from '../lib/admin';
import { logAdminAction } from '../lib/audit';
import { parseInput, requireAuth, type Caller } from '../lib/guards';
import { notify } from '../lib/notify';
import { PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET, SEMAPHORE_API_KEY, ORS_API_KEY } from '../lib/params';
import { mockPaymentsActive, paymentProvider, paymongoLive, verifyPaymongoSignature } from '../lib/providers/payments';
import { applyPayment, chargeDaily, getPlan, priceFor, subId, subsCol, writeStatus } from '../lib/subscriptions';

const fail = (code: 'permission-denied' | 'not-found' | 'failed-precondition' | 'invalid-argument', message: string): never => {
  throw new HttpsError(code, message);
};
const subscriberType = z.object({ subscriberType: z.enum(['shop', 'rider']) });

/** The caller's own shop or rider subscription. */
async function ownSubscription(caller: Caller, type: 'shop' | 'rider') {
  const id = type === 'shop' ? caller.claims.shops?.[0] : caller.uid;
  if (!id || (type === 'rider' && !hasRole(caller.claims.roles, 'rider'))) fail('permission-denied', 'no_subscription');
  const ref = subsCol().doc(subId(type, id!));
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'no_subscription');
  return { ref, sub: snap.data() as SubscriptionDoc };
}

async function tierOf(townId: string) {
  return (await db.collection('towns').doc(townId).get()).get('tier') ?? 'C';
}

/** Switch plan (Basic/Standard/Plus for shops, Daily/Monthly for riders). The value of unused paid time carries over. */
export const choosePlan = onCall(async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(choosePlanInput.merge(subscriberType), req.data);
  const allowed = input.subscriberType === 'shop' ? SHOP_PLANS : RIDER_PLANS;
  if (!allowed.includes(input.planCode)) fail('invalid-argument', 'plan_not_for_you');
  const { ref } = await ownSubscription(caller, input.subscriberType);
  await db.runTransaction(async (tx) => {
    const sub = (await tx.get(ref)).data() as SubscriptionDoc;
    if (sub.planCode === input.planCode) return;
    const [daily, from, to, town] = await Promise.all([
      getPlan('rider_daily', tx),
      getPlan(sub.planCode, tx),
      getPlan(input.planCode, tx),
      tx.get(db.collection('towns').doc(sub.townId)),
    ]);
    const tier = town.get('tier');
    const now = Date.now();
    const patch = switchPlan(sub, { code: from.code, price: priceFor(from, tier), period: from.period }, { code: to.code, price: priceFor(to, tier), period: to.period }, now);
    writeStatus(tx, ref, sub, patch, priceFor(daily, tier), now);
  });
  return { ok: true };
});

/** Starts a GCash/Maya checkout for n periods, or a Rider Daily top-up. */
export const startCheckout = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(startCheckoutInput.merge(subscriberType), req.data);
  const { ref, sub } = await ownSubscription(caller, input.subscriberType);
  const plan = await getPlan(sub.planCode);
  const price = priceFor(plan, await tierOf(sub.townId));
  const topUp = sub.planCode === 'rider_daily';
  if (topUp && !input.topUp) fail('invalid-argument', 'topup_amount_required');
  if (!topUp && price === 0) fail('failed-precondition', 'free_plan');
  const amount = topUp ? input.topUp! : price * input.periods;
  const checkoutRef = db.collection('checkouts').doc();
  const description = topUp ? `Hatod rider load ${formatPHP(amount)}` : `Hatod ${plan.code.replace('_', ' ')} × ${input.periods}`;
  const provider = paymentProvider();
  const { url, sessionId } = await provider.createCheckout({ checkoutId: checkoutRef.id, amount, description, method: input.method });
  await checkoutRef.set({
    subscriptionId: ref.id,
    ownerUid: caller.uid,
    amount,
    kind: topUp ? 'topup' : 'period',
    periods: topUp ? 0 : input.periods,
    planCode: sub.planCode,
    method: input.method,
    provider: provider.name,
    sessionId,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  });
  return { url, checkoutId: checkoutRef.id };
});

/** Completes a checkout: shared by the PayMongo webhook and the development mock. */
async function completeCheckout(
  checkoutId: string,
  providerRef: string,
  method: 'gcash' | 'maya' | 'mock',
  check?: (c: FirebaseFirestore.DocumentData) => string | null,
) {
  const checkoutRef = db.collection('checkouts').doc(checkoutId);
  const checkout = await checkoutRef.get();
  if (!checkout.exists) throw new Error('checkout_not_found');
  const c = checkout.data()!;
  const problem = check?.(c);
  if (problem) throw new CheckoutMismatch(problem);
  const result = await applyPayment(c.subscriptionId, {
    amount: c.amount,
    method,
    ref: providerRef,
    receiptNo: `E-${providerRef.slice(-10).toUpperCase()}`,
    recordedBy: null,
    kind: c.kind,
    periods: c.periods,
    ...(c.planCode ? { planCode: c.planCode } : {}),
  });
  await checkoutRef.update({ status: 'paid', paidAt: FieldValue.serverTimestamp(), providerRef });
  if (!result.duplicate) await notify(c.ownerUid, { title: 'Payment received', body: `Hatod received your payment of ${formatPHP(c.amount)}. Thank you!`, link: '/' });
  return result;
}

class CheckoutMismatch extends Error {}

/** Development only: the mock checkout page's "Pay" button. Refused unless the mock provider is active. */
export const mockCompleteCheckout = onCall(async (req) => {
  const caller = requireAuth(req);
  if (!mockPaymentsActive()) fail('permission-denied', 'mock_disabled');
  const { checkoutId } = parseInput(z.object({ checkoutId: z.string().min(1).max(100) }), req.data);
  const c = await db.collection('checkouts').doc(checkoutId).get();
  if (!c.exists || c.get('ownerUid') !== caller.uid) fail('not-found', 'checkout_not_found');
  return completeCheckout(checkoutId, `mock_${checkoutId}`, 'mock');
});

/** PayMongo webhook: verifies the signature, then applies the payment (idempotent by payment id). */
export const paymongoWebhook = onRequest({ secrets: [PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET, SEMAPHORE_API_KEY, ORS_API_KEY] }, async (req, res) => {
  if (req.method !== 'POST') return void res.status(405).send('method');
  if (!verifyPaymongoSignature(req.get('Paymongo-Signature'), req.rawBody)) return void res.status(401).send('signature');
  const event = req.body?.data?.attributes;
  if (event?.type !== 'checkout_session.payment.paid') return void res.status(200).send('ignored');
  const session = event.data?.attributes;
  const checkoutId = session?.metadata?.checkoutId as string | undefined;
  const payment = session?.payments?.[0];
  if (!checkoutId || !payment?.id) return void res.status(400).send('missing');
  const method = payment.attributes?.source?.type === 'paymaya' ? 'maya' : 'gcash';
  const live = paymongoLive();
  try {
    await completeCheckout(checkoutId, payment.id, method, (c) => {
      if (Boolean(event.livemode ?? session.livemode) !== live) return 'mode';
      if (c.provider !== 'paymongo') return 'provider';
      if (event.data?.id !== c.sessionId) return 'session';
      const paid = Number(payment.attributes?.amount ?? 0);
      if (payment.attributes?.status !== 'paid' || paid < c.amount * 100) return 'amount';
      return null;
    });
    res.status(200).send('ok');
  } catch (e) {
    if (e instanceof CheckoutMismatch) {
      // Not ours or not what we asked for: log it and stop PayMongo retrying.
      logger.warn('paymongo webhook rejected', { reason: e.message, checkoutId });
      return void res.status(200).send('rejected');
    }
    logger.error('paymongo webhook failed', { error: String(e), checkoutId });
    res.status(500).send('error'); // PayMongo retries
  }
});

/** Coordinator (their town) or admin records a cash payment with the official receipt number. */
export const recordCashPayment = onCall({ secrets: [SEMAPHORE_API_KEY, ORS_API_KEY] }, async (req) => {
  const caller = requireAuth(req);
  const input = parseInput(recordCashPaymentInput, req.data);
  const snap = await subsCol().doc(input.subscriptionId).get();
  if (!snap.exists) fail('not-found', 'subscription_not_found');
  const sub = snap.data() as SubscriptionDoc;
  const ok = hasRole(caller.claims.roles, 'admin') || (hasRole(caller.claims.roles, 'coordinator') && caller.claims.coordTowns?.includes(sub.townId));
  if (!ok) fail('permission-denied', 'not_your_town');
  // A coordinator never records payments for their own shop or rider account.
  if (sub.ownerUid === caller.uid && !hasRole(caller.claims.roles, 'admin')) fail('permission-denied', 'not_your_own');
  const plan = await getPlan(sub.planCode);
  const price = priceFor(plan, await tierOf(sub.townId));
  const topUp = sub.planCode === 'rider_daily';
  if (topUp && !input.topUp) fail('invalid-argument', 'topup_amount_required');
  if (!topUp && price === 0) fail('failed-precondition', 'free_plan');
  const amount = topUp ? input.topUp! : price * input.periods;
  // Receipt numbers are unique per town: entering one twice changes nothing.
  const ref = `cash_${sub.townId}_${input.receiptNo.toUpperCase()}`;
  const result = await applyPayment(input.subscriptionId, {
    amount,
    method: 'cash',
    ref,
    receiptNo: input.receiptNo.toUpperCase(),
    recordedBy: caller.uid,
    kind: topUp ? 'topup' : 'period',
    periods: topUp ? 0 : input.periods,
  });
  if (result.duplicate) fail('failed-precondition', 'receipt_already_used');
  await db.collection('adminLog').add({ action: 'record_cash', actorId: caller.uid, targetId: input.subscriptionId, after: { amount, receiptNo: input.receiptNo }, createdAt: FieldValue.serverTimestamp() });
  await notify(sub.ownerUid, { title: 'Payment recorded', body: `Your cash payment of ${formatPHP(amount)} was recorded. Receipt ${input.receiptNo.toUpperCase()}.`, link: '/' });
  return { ok: true, amount, status: result.status };
});

/** Admin sets a plan's prices per town tier. */
export const adminSetPlanPrices = onCall(async (req) => {
  const caller = requireAuth(req);
  if (!hasRole(caller.claims.roles, 'admin')) fail('permission-denied', 'admin_only');
  const input = parseInput(setPlanPricesInput, req.data);
  await db.runTransaction(async (tx) => {
    const plan = await getPlan(input.code, tx);
    tx.set(db.collection('plans').doc(input.code), { ...plan, prices: input.prices, active: input.active });
    logAdminAction(tx, { action: 'set_plan_prices', actorId: caller.uid, targetId: input.code, before: plan.prices, after: input.prices });
  });
  return { ok: true };
});

/**
 * Rider goes online. Needs verification, an active account and a subscription
 * in good standing. Rider Daily: ₱5 (by tier) is taken from the prepaid
 * balance once per day the rider goes online (free during the trial).
 */
export const goOnline = onCall(async (req) => {
  const caller = requireAuth(req);
  const { approxLocation } = parseInput(
    z.object({ approxLocation: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null) }),
    req.data,
  );
  const riderRef = db.collection('riders').doc(caller.uid);
  const sRef = subsCol().doc(subId('rider', caller.uid));
  return db.runTransaction(async (tx) => {
    const [rider, subSnap] = await Promise.all([tx.get(riderRef), tx.get(sRef)]);
    if (!rider.exists) fail('not-found', 'rider_not_found');
    if (rider.get('verified') !== true || rider.get('status') !== 'active') fail('failed-precondition', 'not_verified');
    const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;
    const town = await tx.get(db.collection('towns').doc(rider.get('townId')));
    const daily = await getPlan('rider_daily', tx);
    const price = priceFor(daily, town.get('tier'));
    let charged = 0;
    if (sub) {
      const now = Date.now();
      const c = chargeDaily(sub, price, now);
      if (c.charge && !c.ok) fail('failed-precondition', 'insufficient_balance');
      if (c.charge) {
        writeStatus(tx, sRef, sub, { balance: sub.balance - price, lastChargedDate: c.today }, price, now);
        charged = price;
      } else if (sub.status === 'lapsed') fail('failed-precondition', 'subscription_lapsed');
    }
    tx.update(riderRef, {
      online: true,
      lastActiveAt: FieldValue.serverTimestamp(),
      // A new rough location replaces the old one; going online again without one keeps it.
      ...(approxLocation ? { approxLocation: coarseLatLng(approxLocation) } : rider.get('online') === true ? {} : { approxLocation: null }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, charged };
  });
});

/**
 * Daily: moves subscriptions whose time has come (trial ending, paid period
 * ending, grace ending) and tells people. Rider Daily subscribers still online
 * after midnight are charged for the new day, or go offline if out of balance.
 */
export async function sweepSubscriptions(now = Date.now()) {
  const due = await subsCol().where('nextChangeAt', '<=', now).limit(500).get();
  let changed = 0;
  for (const d of due.docs) {
    const res = await db.runTransaction(async (tx) => {
      const snap = await tx.get(d.ref);
      const sub = snap.data() as SubscriptionDoc;
      const town = await tx.get(db.collection('towns').doc(sub.townId));
      const daily = await getPlan('rider_daily', tx);
      return writeStatus(tx, d.ref, sub, {}, priceFor(daily, town.get('tier')), now);
    });
    if (res.before !== res.after) {
      changed++;
      const sub = d.data() as SubscriptionDoc;
      const shop = sub.subscriberType === 'shop';
      const text =
        res.after === 'grace'
          ? `Your Hatod subscription is due. Please pay within 3 days to keep your ${shop ? 'shop taking orders' : 'rider listing'}.`
          : res.after === 'lapsed'
            ? shop
              ? 'Your Hatod subscription lapsed. Your shop is now on Basic (calls and messages only). Pay any time to restore orders.'
              : 'Your Hatod subscription lapsed. Customers cannot choose you until you renew.'
            : null;
      if (text) await notify(sub.ownerUid, { title: 'Subscription', body: text, link: shop ? '/shop/subscription' : '/rider/subscription', sms: true });
    }
  }
  // Rider Daily: charge riders still online on a new day.
  const online = await db.collection('riders').where('online', '==', true).where('planCode', '==', 'rider_daily').limit(500).get();
  for (const r of online.docs) {
    await db.runTransaction(async (tx) => {
      const sRef = subsCol().doc(subId('rider', r.id));
      const snap = await tx.get(sRef);
      if (!snap.exists) return;
      const sub = snap.data() as SubscriptionDoc;
      const town = await tx.get(db.collection('towns').doc(sub.townId));
      const price = priceFor(await getPlan('rider_daily', tx), town.get('tier'));
      const c = chargeDaily(sub, price, now);
      if (!c.charge) return;
      if (c.ok) writeStatus(tx, sRef, sub, { balance: sub.balance - price, lastChargedDate: c.today }, price, now);
      else tx.update(r.ref, { online: false, approxLocation: null, updatedAt: FieldValue.serverTimestamp() });
    });
  }
  return { checked: due.size, changed };
}

export const sweepSubscriptionsDaily = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'Asia/Manila', secrets: [SEMAPHORE_API_KEY, ORS_API_KEY], retryCount: 2 },
  async () => {
    logger.info('subscriptions sweep', await sweepSubscriptions());
  },
);
