'use client';

import { roundLatLng, type AddressInput } from '@hatod/shared';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { firebase } from '@/lib/firebase/client';
import type { Address } from './places';

/**
 * Commits a batch without blocking the UI when offline: Firestore queues the
 * write locally and sends it when the signal returns.
 */
async function commitOrQueue(commit: () => Promise<void>): Promise<'saved' | 'queued'> {
  const p = commit();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    p.catch(() => {});
    return 'queued';
  }
  await p;
  return 'saved';
}

/**
 * Creates or updates an address. Keeps exactly one default per user: the
 * first address becomes the default, and choosing a new default clears the
 * flag on the others.
 */
export async function saveAddress(opts: {
  userId: string;
  townId: string;
  barangayName: string;
  input: Required<Pick<AddressInput, 'label' | 'barangayId' | 'landmark' | 'geo'>> & { street: string; isDefault: boolean };
  existing: Address[];
  id?: string;
}): Promise<'saved' | 'queued'> {
  const { db } = firebase();
  const others = opts.existing.filter((a) => a.id !== opts.id);
  const isDefault = opts.input.isDefault || others.every((a) => !a.isDefault);
  const ref = opts.id ? doc(db, 'addresses', opts.id) : doc(collection(db, 'addresses'));
  const batch = writeBatch(db);
  const data = {
    userId: opts.userId,
    townId: opts.townId,
    label: opts.input.label.trim(),
    barangayId: opts.input.barangayId,
    barangayName: opts.barangayName,
    street: opts.input.street.trim(),
    landmark: opts.input.landmark.trim(),
    geo: roundLatLng(opts.input.geo),
    isDefault,
    updatedAt: serverTimestamp(),
  };
  if (opts.id) batch.update(ref, data);
  else batch.set(ref, { ...data, createdAt: serverTimestamp() });
  if (isDefault) {
    for (const a of others) if (a.isDefault) batch.update(doc(db, 'addresses', a.id), { isDefault: false, updatedAt: serverTimestamp() });
  }
  return commitOrQueue(() => batch.commit());
}

/** Deletes an address; if it was the default, the oldest remaining one takes over. */
export async function deleteAddress(address: Address, existing: Address[]): Promise<'saved' | 'queued'> {
  const { db } = firebase();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'addresses', address.id));
  const next = existing.find((a) => a.id !== address.id);
  if (address.isDefault && next) batch.update(doc(db, 'addresses', next.id), { isDefault: true, updatedAt: serverTimestamp() });
  return commitOrQueue(() => batch.commit());
}

export async function makeDefault(address: Address, existing: Address[]): Promise<'saved' | 'queued'> {
  const { db } = firebase();
  const batch = writeBatch(db);
  batch.update(doc(db, 'addresses', address.id), { isDefault: true, updatedAt: serverTimestamp() });
  for (const a of existing) if (a.id !== address.id && a.isDefault) batch.update(doc(db, 'addresses', a.id), { isDefault: false, updatedAt: serverTimestamp() });
  return commitOrQueue(() => batch.commit());
}
