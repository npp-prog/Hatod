'use client';

import { DEFAULT_PLANS, type PaymentRecord, type PlanCode, type PlanDoc, type SubscriptionDoc } from '@hatod/shared';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '@/lib/firebase/client';

export type Subscription = SubscriptionDoc & { id: string };
export type Payment = PaymentRecord & { id: string };

const fn = <I, O = { ok: boolean }>(name: string) => (data: I) => httpsCallable<I, O>(firebase().functions, name)(data).then((r) => r.data);
export const choosePlan = fn<{ subscriberType: 'shop' | 'rider'; planCode: PlanCode }>('choosePlan');
export const startCheckout = fn<{ subscriberType: 'shop' | 'rider'; periods?: number; topUp?: number | null; method: 'gcash' | 'maya' }, { url: string; checkoutId: string }>('startCheckout');
export const mockCompleteCheckout = fn<{ checkoutId: string }, { duplicate: boolean; status: string }>('mockCompleteCheckout');
export const recordCashPayment = fn<{ subscriptionId: string; receiptNo: string; periods?: number; topUp?: number | null }, { ok: boolean; amount: number }>('recordCashPayment');
export const adminSetPlanPrices = fn<{ code: PlanCode; prices: { A: number; B: number; C: number }; active: boolean }>('adminSetPlanPrices');

/** Plans as configured by admins, falling back to the defaults. */
export async function fetchPlans(): Promise<PlanDoc[]> {
  const snap = await getDocs(collection(firebase().db, 'plans')).catch(() => null);
  const stored = new Map((snap?.docs ?? []).map((d) => [d.id, d.data() as PlanDoc]));
  return DEFAULT_PLANS.map((p) => stored.get(p.code) ?? p);
}

export function watchSubscription(id: string, cb: (s: Subscription | null) => void): Unsubscribe {
  return onSnapshot(
    doc(firebase().db, 'subscriptions', id),
    (s) => cb(s.exists() ? ({ id: s.id, ...(s.data() as SubscriptionDoc) } as Subscription) : null),
    () => cb(null),
  );
}

export function watchPayments(id: string, cb: (p: Payment[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(firebase().db, 'subscriptions', id, 'payments'), orderBy('at', 'desc'), limit(24)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as PaymentRecord) }))),
    () => cb([]),
  );
}

export async function fetchTownSubscriptions(townId: string): Promise<Subscription[]> {
  const snap = await getDocs(query(collection(firebase().db, 'subscriptions'), where('townId', '==', townId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as SubscriptionDoc) }));
}
