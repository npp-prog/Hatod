'use client';

import type { Metrics, RiderDoc, ShopDoc } from '@hatod/shared';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '@/lib/firebase/client';
import type { Rider } from './riders';
import type { Shop } from './shops';

const fn = <I, O = { ok: boolean }>(name: string) => (data: I) => httpsCallable<I, O>(firebase().functions, name)(data).then((r) => r.data);

export const verifyListing = fn<{ kind: 'shop' | 'rider'; id: string; decision: 'approve' | 'reject'; note: string }>('verifyListing');
export const setAccountStatus = fn<{ type: 'customer' | 'shop' | 'rider'; id: string; action: 'suspend' | 'ban' | 'reinstate'; note: string }>('setAccountStatus');
export type DashboardMetrics = Metrics & { listedShops: number; verifiedRiders: number; onlineRiders: number; subscriptions: number; paidSubscriptions: number };
export const adminMetrics = fn<{ townId: string | null; days: number }, DashboardMetrics>('adminMetrics');

/** Every shop and rider in a town (coordinators and admins may read them all). */
export async function fetchTownListings(townId: string): Promise<{ shops: Shop[]; riders: Rider[] }> {
  const { db } = firebase();
  const [s, r] = await Promise.all([
    getDocs(query(collection(db, 'shops'), where('townId', '==', townId))),
    getDocs(query(collection(db, 'riders'), where('townId', '==', townId))),
  ]);
  return {
    shops: s.docs.map((d) => ({ id: d.id, ...(d.data() as ShopDoc) })).sort((a, b) => a.name.localeCompare(b.name)),
    riders: r.docs.map((d) => ({ id: d.id, ...(d.data() as RiderDoc) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
