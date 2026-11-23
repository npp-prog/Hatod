'use client';

import type { ReportDoc, SubmitRatingInput, SubmitReportInput } from '@hatod/shared';
import { collection, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '@/lib/firebase/client';

export type Report = ReportDoc & { id: string; suspendedOnReport?: boolean };

const fn = <I,>(name: string) => (data: I) => httpsCallable<I, { ok: boolean }>(firebase().functions, name)(data).then((r) => r.data);
export const submitRating = fn<SubmitRatingInput>('submitRating');
export const submitReport = fn<SubmitReportInput>('submitReport');
export const resolveReport = fn<{ reportId: string; resolution: 'confirmed' | 'dismissed'; note: string }>('resolveReport');

/** Reports for the given towns (coordinator), or all towns (admin: towns = null). */
export function watchReports(towns: string[] | null, status: 'open' | 'resolved', cb: (r: Report[]) => void): Unsubscribe {
  const base = collection(firebase().db, 'reports');
  const q = towns
    ? query(base, where('townId', 'in', towns.slice(0, 10)), where('status', '==', status), orderBy('createdAt', 'desc'), limit(50))
    : query(base, where('status', '==', status), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as ReportDoc) }))),
    () => cb([]),
  );
}
