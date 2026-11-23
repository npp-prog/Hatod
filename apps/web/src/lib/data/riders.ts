'use client';

import { coarseLatLng, IMAGE_LIMITS, type EmergencyContact, type RateCard, type RiderDoc, type RiderDocKey, type RiderPrivateDoc } from '@hatod/shared';
import { doc, onSnapshot, serverTimestamp, updateDoc, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { firebase } from '@/lib/firebase/client';
import { compressImage } from '@/lib/images';

export type Rider = RiderDoc & { id: string };
export type RiderPrivate = RiderPrivateDoc;

export function watchRider(uid: string, cb: (r: Rider | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    doc(firebase().db, 'riders', uid),
    (s) => cb(s.exists() ? ({ id: s.id, ...(s.data({ serverTimestamps: 'estimate' }) as RiderDoc) } as Rider) : null),
    onError,
  );
}

export function watchRiderPrivate(uid: string, cb: (p: RiderPrivate | null) => void): Unsubscribe {
  return onSnapshot(
    doc(firebase().db, 'riders', uid, 'private', 'info'),
    (s) => cb(s.exists() ? (s.data() as RiderPrivate) : null),
    () => cb(null),
  );
}

/** Rider switches and editable profile fields (rules decide which are allowed). */
export function updateRider(uid: string, patch: Partial<Pick<RiderDoc, 'photoUrl' | 'vehicleType' | 'vehicleDesc' | 'plateNo' | 'rainOn'>>) {
  return updateDoc(doc(firebase().db, 'riders', uid), { ...patch, updatedAt: serverTimestamp() });
}

/** Records that the rider is active (keeps an online rider from timing out). */
export function touchRider(uid: string) {
  void updateDoc(doc(firebase().db, 'riders', uid), { lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
}

/** Best-effort phone location rounded to about 1 km; null if denied or slow. */
function roughLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (p) => (clearTimeout(timer), resolve(coarseLatLng({ lat: p.coords.latitude, lng: p.coords.longitude }))),
      () => (clearTimeout(timer), resolve(null)),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  });
}

/**
 * Online/offline switch. Going online goes through the goOnline function: it
 * checks verification and the subscription, takes the Rider Daily fee once a
 * day, and stores a rough location (about 1 km) for "nearest" sorting.
 * Going offline is a direct write, so it works even on weak signal.
 */
export async function setOnline(uid: string, online: boolean) {
  if (!online) {
    await updateDoc(doc(firebase().db, 'riders', uid), { online: false, approxLocation: null, lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return;
  }
  const approxLocation = await roughLocation();
  await httpsCallable(firebase().functions, 'goOnline')({ approxLocation });
}

export function saveRateCard(rateCard: RateCard) {
  return httpsCallable<unknown, { nextAllowedAt: number | null }>(firebase().functions, 'updateRateCard')({ rateCard });
}

export function saveServiceArea(servedBarangayIds: string[], maxKm: number) {
  return httpsCallable(firebase().functions, 'updateServiceArea')({ servedBarangayIds, maxKm });
}

export function saveEmergencyContact(uid: string, emergencyContact: EmergencyContact) {
  return updateDoc(doc(firebase().db, 'riders', uid, 'private', 'info'), { emergencyContact, updatedAt: serverTimestamp() });
}

export async function uploadRiderPhoto(uid: string, file: File): Promise<string> {
  const blob = await compressImage(file, { maxDim: 600, targetBytes: IMAGE_LIMITS.targetBytes });
  if (blob.size > IMAGE_LIMITS.publicMaxBytes) throw new Error('image_too_large');
  const r = ref(firebase().storage, `riders/${uid}/public/photo-${Date.now()}.webp`);
  await uploadBytes(r, blob, { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' });
  return getDownloadURL(r);
}

/** Uploads one document (photo or PDF) to the rider's private folder and records its path. */
export async function uploadRiderDoc(rider: Rider, key: RiderDocKey, file: File) {
  const { storage, db } = firebase();
  const isPdf = file.type === 'application/pdf';
  const blob = isPdf ? file : await compressImage(file, { maxDim: 2000, targetBytes: 600 * 1024 });
  if (blob.size > IMAGE_LIMITS.privateMaxBytes) throw new Error('file_too_large');
  const path = `private/towns/${rider.townId}/riders/${rider.id}/${key}-${Date.now()}.${isPdf ? 'pdf' : 'webp'}`;
  await uploadBytes(ref(storage, path), blob, { contentType: isPdf ? 'application/pdf' : 'image/webp' });
  // Update only this document's field: uploads can finish in any order, and
  // writing the whole docs map from a stale copy would erase another upload.
  await updateDoc(doc(db, 'riders', rider.id, 'private', 'info'), { [`docs.${key}`]: path, updatedAt: serverTimestamp() });
}
