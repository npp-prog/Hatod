'use client';

import { IMAGE_LIMITS, type MenuItemDoc, type MenuItemInput, type ShopDoc } from '@hatod/shared';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { firebase } from '@/lib/firebase/client';
import { compressImage } from '@/lib/images';
import { deleteStorageFile } from './storage';

export type Shop = ShopDoc & { id: string };
export type MenuItem = MenuItemDoc & { id: string };

/** The signed-in owner's shop (one per person in the MVP), live. */
export function watchMyShop(uid: string, cb: (shop: Shop | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(firebase().db, 'shops'), where('ownerId', '==', uid), limit(1)),
    (snap) => {
      const d = snap.docs[0];
      cb(d ? ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as ShopDoc) } as Shop) : null);
    },
    onError,
  );
}

/** Owner edits to listing fields. Rules decide which fields are allowed. */
export function updateShop(shopId: string, patch: Partial<ShopDoc>): Promise<void> {
  return updateDoc(doc(firebase().db, 'shops', shopId), { ...patch, updatedAt: serverTimestamp() });
}

export function watchMenu(shopId: string, cb: (items: MenuItem[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(firebase().db, 'shops', shopId, 'menuItems'),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as MenuItemDoc) }))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      ),
    onError,
  );
}

/**
 * Asks the server to recompute the shop's menu summary (counts, lowest price,
 * dish words for search). Fire-and-forget: a failure only delays search
 * results, and the next menu change or dashboard visit retries.
 */
export function refreshMenuSummary(shopId: string): void {
  void httpsCallable(firebase().functions, 'refreshMenuSummary')({ shopId }).catch(() => {});
}

export async function saveMenuItem(shopId: string, input: Required<MenuItemInput>, opts: { id?: string; sortOrder: number }) {
  const { db } = firebase();
  const data = {
    name: input.name.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    price: input.price,
    photoUrl: input.photoUrl,
    variants: input.variants,
    addOns: input.addOns,
    available: input.available,
    sortOrder: opts.sortOrder,
    updatedAt: serverTimestamp(),
  };
  if (opts.id) await updateDoc(doc(db, 'shops', shopId, 'menuItems', opts.id), data);
  else await setDoc(doc(collection(db, 'shops', shopId, 'menuItems')), { ...data, createdAt: serverTimestamp() });
  refreshMenuSummary(shopId);
}

export async function setItemAvailable(shopId: string, itemId: string, available: boolean) {
  await updateDoc(doc(firebase().db, 'shops', shopId, 'menuItems', itemId), { available, updatedAt: serverTimestamp() });
  refreshMenuSummary(shopId);
}

export async function deleteMenuItem(shopId: string, itemId: string) {
  await deleteDoc(doc(firebase().db, 'shops', shopId, 'menuItems', itemId));
  refreshMenuSummary(shopId);
}

/** Renames a category on the shop and on every item in it, in one batch. */
export async function renameCategory(shop: Shop, items: MenuItem[], from: string, to: string) {
  const { db } = firebase();
  const batch = writeBatch(db);
  batch.update(doc(db, 'shops', shop.id), {
    menuCategories: shop.menuCategories.map((c) => (c === from ? to : c)),
    updatedAt: serverTimestamp(),
  });
  for (const it of items.filter((i) => i.category === from)) {
    batch.update(doc(db, 'shops', shop.id, 'menuItems', it.id), { category: to, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  refreshMenuSummary(shop.id);
}

/** Compresses and uploads a public shop image; returns its download URL. */
export async function uploadShopImage(shopId: string, file: File, name: string, maxDim = 1024): Promise<string> {
  const { storage } = firebase();
  const blob = await compressImage(file, { maxDim, targetBytes: IMAGE_LIMITS.targetBytes });
  if (blob.size > IMAGE_LIMITS.publicMaxBytes) throw new Error('image_too_large');
  const r = ref(storage, `shops/${shopId}/public/${name}-${Date.now()}.webp`);
  await uploadBytes(r, blob, { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' });
  return getDownloadURL(r);
}

/** Best-effort delete of an image we no longer reference. */
export const deleteShopImage = deleteStorageFile;

/** Uploads the business permit (photo or PDF) to the private folder and records its path. */
export async function uploadPermit(shop: Shop, file: File): Promise<void> {
  const { storage, db } = firebase();
  const isPdf = file.type === 'application/pdf';
  const blob = isPdf ? file : await compressImage(file, { maxDim: 2000, targetBytes: 600 * 1024 });
  if (blob.size > IMAGE_LIMITS.privateMaxBytes) throw new Error('file_too_large');
  const path = `private/towns/${shop.townId}/shops/${shop.id}/permit-${Date.now()}.${isPdf ? 'pdf' : 'webp'}`;
  await uploadBytes(ref(storage, path), blob, { contentType: isPdf ? 'application/pdf' : 'image/webp' });
  await updateDoc(doc(db, 'shops', shop.id, 'private', 'info'), { permitPath: path, updatedAt: serverTimestamp() });
}
