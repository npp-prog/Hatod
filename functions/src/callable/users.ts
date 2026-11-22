import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  completeProfileInput,
  normalizeRoles,
  setUserRolesInput,
  type Role,
} from '@hatod/shared';
import { adminAuth, db } from '../lib/admin';
import { logAdminAction } from '../lib/audit';
import { parseInput, requireAuth, requireRole } from '../lib/guards';

const ADMIN_PHONES = defineString('ADMIN_PHONES', { default: '' });

function bootstrapAdminPhones(): Set<string> {
  return new Set(
    ADMIN_PHONES.value()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Sets custom claims and stamps claimsUpdatedAt on the user doc so the
 * signed-in client knows to refresh its ID token.
 */
async function applyClaims(ref: DocumentReference, uid: string, roles: Role[], coordTowns: string[]) {
  await adminAuth.setCustomUserClaims(uid, { roles, coordTowns });
  await ref.update({ claimsUpdatedAt: Date.now() });
}

/**
 * First sign-in: records name, consent and locale, creates the user with the
 * customer role, and sets claims. Safe to call again: an existing user keeps
 * their roles and status, only name and locale change.
 */
export const completeProfile = onCall(async (req) => {
  const caller = requireAuth(req);
  if (!caller.phone) throw new HttpsError('failed-precondition', 'phone_sign_in_required');
  const input = parseInput(completeProfileInput, req.data);

  const ref = db.collection('users').doc(caller.uid);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = FieldValue.serverTimestamp();
    if (snap.exists) {
      const data = snap.data()!;
      if (data.status === 'banned') throw new HttpsError('permission-denied', 'account_banned');
      tx.update(ref, { name: input.name, locale: input.locale, updatedAt: now });
      return {
        roles: normalizeRoles(data.roles),
        coordTowns: (data.coordTowns as string[] | undefined) ?? [],
        created: false,
      };
    }
    const roles: Role[] = bootstrapAdminPhones().has(caller.phone!) ? ['customer', 'admin'] : ['customer'];
    tx.create(ref, {
      uid: caller.uid,
      name: input.name,
      phone: caller.phone,
      roles,
      coordTowns: [],
      defaultTownId: null,
      status: 'active',
      strikes: [],
      locale: input.locale,
      consent: {
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
        acceptedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });
    return { roles, coordTowns: [] as string[], created: true };
  });

  const current = normalizeRoles((req.auth!.token as { roles?: unknown[] }).roles);
  if (result.created || current.join() !== result.roles.join()) {
    await applyClaims(ref, caller.uid, result.roles, result.coordTowns);
  }
  return { roles: result.roles, created: result.created };
});

/** Admin: replace a user's roles (and coordinator towns). Logged to adminLog. */
export const setUserRoles = onCall(async (req) => {
  const caller = requireRole(req, 'admin');
  const input = parseInput(setUserRolesInput, req.data);
  const roles = normalizeRoles(input.roles);
  if (input.uid === caller.uid && !roles.includes('admin')) {
    throw new HttpsError('failed-precondition', 'cannot_remove_own_admin');
  }

  const ref = db.collection('users').doc(input.uid);
  const before = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'user_not_found');
    const prev = {
      roles: (snap.get('roles') as string[] | undefined) ?? [],
      coordTowns: (snap.get('coordTowns') as string[] | undefined) ?? [],
    };

    // Keep towns/{id}.coordinatorIds in step with the user's coordinator towns.
    const next = new Set(input.coordTowns);
    const added = input.coordTowns.filter((t) => !prev.coordTowns.includes(t));
    const removed = prev.coordTowns.filter((t) => !next.has(t));
    const addedRefs = added.map((t) => db.collection('towns').doc(t));
    const addedSnaps = addedRefs.length ? await tx.getAll(...addedRefs) : [];
    const missing = addedSnaps.filter((s) => !s.exists).map((s) => s.id);
    if (missing.length) throw new HttpsError('failed-precondition', 'unknown_town', { towns: missing });
    for (const r of addedRefs) tx.update(r, { coordinatorIds: FieldValue.arrayUnion(input.uid) });
    for (const t of removed) {
      // set+merge so a since-deleted town does not fail the whole update
      tx.set(db.collection('towns').doc(t), { coordinatorIds: FieldValue.arrayRemove(input.uid) }, { merge: true });
    }

    tx.update(ref, { roles, coordTowns: input.coordTowns, updatedAt: FieldValue.serverTimestamp() });
    logAdminAction(tx, {
      action: 'setUserRoles',
      actorId: caller.uid,
      targetId: input.uid,
      before: prev,
      after: { roles, coordTowns: input.coordTowns },
    });
    return prev;
  });

  await applyClaims(ref, input.uid, roles, input.coordTowns);
  return { roles, coordTowns: input.coordTowns, previousRoles: before.roles };
});
