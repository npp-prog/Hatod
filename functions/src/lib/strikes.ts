import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { pruneStrikes, strikeOutcome, type Strike, type TargetType } from '@hatod/shared';
import { db } from './admin';

/** The document whose status a strike or suspension changes. */
export function targetRef(type: TargetType, id: string): DocumentReference {
  return db.collection(type === 'shop' ? 'shops' : type === 'rider' ? 'riders' : 'users').doc(id);
}

/**
 * Strikes live in their own collection, which no client can read: the
 * strike references point at reports and orders, and the reported person
 * must not be able to trace who reported them.
 */
export function strikesRef(type: TargetType, id: string): DocumentReference {
  return db.collection('strikes').doc(`${type}_${id}`);
}

export type SuspendReason = 'strikes' | 'safety_review' | 'safety' | 'coordinator' | 'admin';

/** A ban is final: only an admin's "reinstate" undoes it. Nothing automatic touches a banned account. */
export const isBanned = (snap: DocumentSnapshot) => snap.get('status') === 'banned';

/** Fields that suspend a shop, rider or customer. Riders also go offline. */
export function suspensionFields(type: TargetType, reason: SuspendReason, until: number | null) {
  return {
    status: 'suspended',
    suspendedReason: reason,
    suspendedUntil: until === null ? null : Timestamp.fromMillis(until),
    ...(type === 'rider' ? { online: false, approxLocation: null } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export const liftFields = { status: 'active', suspendedReason: null, suspendedUntil: null, updatedAt: FieldValue.serverTimestamp() };

/**
 * Adds a strike inside a transaction and suspends for 7 days if it makes 3 in
 * 30 days. Both snapshots must have been read in the same transaction
 * (target first, then strikesRef). Returns whether this strike suspended.
 */
export function addStrike(
  tx: Transaction,
  type: TargetType,
  snap: DocumentSnapshot,
  strikesSnap: DocumentSnapshot,
  strike: Strike,
): { suspended: boolean; until: number | null } {
  const now = strike.at;
  const strikes = pruneStrikes([...((strikesSnap.get('list') as Strike[] | undefined) ?? []), strike], now);
  tx.set(strikesSnap.ref, { type, targetId: snap.id, list: strikes, updatedAt: FieldValue.serverTimestamp() });
  const outcome = strikeOutcome(strikes, now);
  // Never shorten a longer suspension or overwrite a ban.
  const keep = isBanned(snap) || (snap.get('status') === 'suspended' && snap.get('suspendedReason') !== 'strikes');
  if (outcome.suspend && !keep) {
    tx.update(snap.ref, suspensionFields(type, 'strikes', outcome.until));
    return { suspended: true, until: outcome.until };
  }
  return { suspended: false, until: null };
}
