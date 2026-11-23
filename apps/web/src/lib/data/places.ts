'use client';

import {
  compareBarangayNames,
  type AddressDoc,
  type BarangayDoc,
  type LatLng,
  type TownDoc,
} from '@hatod/shared';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebase } from '@/lib/firebase/client';

export type Town = TownDoc & { id: string };
export type Barangay = BarangayDoc & { id: string };
export type Address = AddressDoc & { id: string };

export async function fetchLiveTowns(): Promise<Town[]> {
  const snap = await getDocs(query(collection(firebase().db, 'towns'), where('isLive', '==', true)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TownDoc) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** All towns (admin view). */
export async function fetchAllTowns(): Promise<Town[]> {
  const snap = await getDocs(collection(firebase().db, 'towns'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TownDoc) })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchTown(id: string): Promise<Town | null> {
  const snap = await getDoc(doc(firebase().db, 'towns', id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as TownDoc) } : null;
}

export async function fetchBarangays(townId: string): Promise<Barangay[]> {
  const snap = await getDocs(query(collection(firebase().db, 'barangays'), where('townId', '==', townId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as BarangayDoc) }))
    .filter((b) => b.active !== false)
    .sort((a, b) => compareBarangayNames(a.name, b.name));
}

export function watchAddresses(userId: string, cb: (list: Address[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(firebase().db, 'addresses'), where('userId', '==', userId), orderBy('createdAt', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as AddressDoc) }))),
    onError,
  );
}

export type { LatLng };
