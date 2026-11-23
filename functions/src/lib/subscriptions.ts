import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import {
  creditValue,
  DEFAULT_PLANS,
  extendPeriod,
  manilaParts,
  nextStatusChange,
  subscriptionStatus,
  trialEndFor,
  type PaymentRecord,
  type PlanCode,
  type PlanDoc,
  type SubscriptionDoc,
  type TownTier,
} from '@hatod/shared';
import { db } from './admin';

export const subsCol = () => db.collection('subscriptions');
export const subId = (type: 'shop' | 'rider', id: string) => `${type}_${id}`;

/** Current plan settings (admin-edited), falling back to the defaults. */
export async function getPlan(code: PlanCode, tx?: Transaction): Promise<PlanDoc> {
  const ref = db.collection('plans').doc(code);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return (snap.exists ? (snap.data() as PlanDoc) : DEFAULT_PLANS.find((p) => p.code === code)!) as PlanDoc;
}

export function priceFor(plan: PlanDoc, tier: TownTier | undefined): number {
  return plan.prices[tier ?? 'C'] ?? plan.prices.C;
}

/** Fields copied onto the shop or rider so listings and eligibility need no extra reads. */
function mirror(type: 'shop' | 'rider', sub: Pick<SubscriptionDoc, 'planCode' | 'status'>) {
  return {
    planCode: sub.planCode,
    subscriptionStatus: sub.status,
    // A rider whose subscription lapsed cannot stay online.
    ...(type === 'rider' && sub.status === 'lapsed' ? { online: false, approxLocation: null } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Starts a subscription in its free trial when a shop or rider registers (inside their transaction). */
export function createSubscription(
  tx: Transaction,
  args: { type: 'shop' | 'rider'; id: string; ownerUid: string; townId: string; townTrialEndsAt: number | null; targetRef: DocumentReference },
) {
  const now = Date.now();
  const planCode: PlanCode = args.type === 'shop' ? 'shop_standard' : 'rider_monthly';
  const base = { planCode, trialEndsAt: trialEndFor(args.townTrialEndsAt, now), currentPeriodEnd: null, balance: 0 };
  const sub: SubscriptionDoc = {
    subscriberType: args.type,
    subscriberId: args.id,
    ownerUid: args.ownerUid,
    townId: args.townId,
    ...base,
    status: subscriptionStatus(base, now),
    lastChargedDate: null,
    nextChangeAt: nextStatusChange(base, now),
    createdAt: now,
    updatedAt: now,
  };
  tx.create(subsCol().doc(subId(args.type, args.id)), sub);
  return { planCode: sub.planCode, subscriptionStatus: sub.status };
}

/**
 * Recomputes status (and when it next changes) and mirrors it to the shop or
 * rider. Call inside a transaction after any change to the subscription.
 * Returns the old and new status so callers can notify on changes.
 */
export function writeStatus(
  tx: Transaction,
  ref: DocumentReference,
  sub: SubscriptionDoc,
  patch: Partial<SubscriptionDoc>,
  dailyPrice: number,
  now = Date.now(),
): { before: SubscriptionDoc['status']; after: SubscriptionDoc['status'] } {
  const next = { ...sub, ...patch };
  const status = subscriptionStatus(next, now, dailyPrice);
  tx.update(ref, { ...patch, status, nextChangeAt: nextStatusChange(next, now), updatedAt: now });
  const target = db.collection(sub.subscriberType === 'shop' ? 'shops' : 'riders').doc(sub.subscriberId);
  tx.update(target, mirror(sub.subscriberType, { planCode: next.planCode, status }));
  return { before: sub.status, after: status };
}

/**
 * Records a payment and extends the subscription (or tops up the daily
 * balance). Idempotent by payment reference: a webhook delivered twice, or a
 * receipt number entered twice, never counts twice.
 */
export async function applyPayment(subscriptionId: string, payment: Omit<PaymentRecord, 'at'>): Promise<{ duplicate: boolean; status: string }> {
  return db.runTransaction(async (tx) => {
    const ref = subsCol().doc(subscriptionId);
    const payRef = ref.collection('payments').doc(payment.ref);
    const [snap, existing] = await Promise.all([tx.get(ref), tx.get(payRef)]);
    if (!snap.exists) throw new Error('subscription_not_found');
    const sub = snap.data() as SubscriptionDoc;
    if (existing.exists) return { duplicate: true, status: sub.status };
    const [plan, daily, town] = await Promise.all([
      getPlan(sub.planCode, tx),
      getPlan('rider_daily', tx),
      tx.get(db.collection('towns').doc(sub.townId)),
    ]);
    const now = Date.now();
    tx.create(payRef, { ...payment, at: now });
    const tier = town.get('tier');
    const dailyPrice = priceFor(daily, tier);
    // A checkout priced for one plan but paid after a switch is credited by
    // its peso value on the current plan, never as periods of the new plan.
    const samePlan = !payment.planCode || payment.planCode === sub.planCode;
    const patch: Partial<SubscriptionDoc> =
      payment.kind === 'topup'
        ? { balance: sub.balance + payment.amount }
        : samePlan
          ? { currentPeriodEnd: extendPeriod(sub.currentPeriodEnd, Math.max(now, sub.trialEndsAt), plan.period, payment.periods) }
          : creditValue(sub, { code: plan.code, price: priceFor(plan, tier), period: plan.period }, payment.amount, now);
    const { after } = writeStatus(tx, ref, sub, patch, dailyPrice, now);
    return { duplicate: false, status: after };
  });
}

/** Charges a Rider Daily subscriber for today if not charged yet (outside the trial). */
export function chargeDaily(sub: SubscriptionDoc, price: number, now: number): { charge: boolean; ok: boolean; today: string } {
  const today = manilaParts(new Date(now)).date;
  if (sub.planCode !== 'rider_daily' || now < sub.trialEndsAt || sub.lastChargedDate === today) return { charge: false, ok: true, today };
  return { charge: true, ok: sub.balance >= price, today };
}
