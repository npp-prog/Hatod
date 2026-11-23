'use client';

import type { MenuItemDoc, RiderDoc, ShopDoc } from '@hatod/shared';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { firebase } from '@/lib/firebase/client';
import type { MenuItem, Shop } from './shops';
import type { Rider } from './riders';

/** Listed (verified, active) shops in a town. The where-clauses match the security rules. */
export async function fetchListedShops(townId: string): Promise<Shop[]> {
  const snap = await getDocs(
    query(collection(firebase().db, 'shops'), where('townId', '==', townId), where('verified', '==', true), where('status', '==', 'active')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ShopDoc) }));
}

export async function fetchShop(id: string): Promise<Shop | null> {
  try {
    const s = await getDoc(doc(firebase().db, 'shops', id));
    return s.exists() ? ({ id: s.id, ...(s.data() as ShopDoc) } as Shop) : null;
  } catch {
    return null; // not listed (or not ours): treat as not found
  }
}

export async function fetchMenu(shopId: string): Promise<MenuItem[]> {
  const snap = await getDocs(collection(firebase().db, 'shops', shopId, 'menuItems'));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as MenuItemDoc) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Online, verified, active riders in a town (eligibility per trip is decided in @hatod/shared). */
export async function fetchOnlineRiders(townId: string): Promise<Rider[]> {
  const snap = await getDocs(
    query(
      collection(firebase().db, 'riders'),
      where('townId', '==', townId),
      where('verified', '==', true),
      where('status', '==', 'active'),
      where('online', '==', true),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as RiderDoc) }));
}
