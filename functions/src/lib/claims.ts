import { normalizeRoles } from '@hatod/shared';
import { adminAuth, db } from './admin';

/**
 * Rebuilds a user's custom claims from users/{uid} (the single source of
 * truth) and stamps claimsUpdatedAt so the signed-in app refreshes its token.
 * Always call this instead of setCustomUserClaims directly: that call replaces
 * every claim, so setting one field alone would drop the others.
 */
export async function syncClaims(uid: string): Promise<void> {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const d = snap.data() ?? {};
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  await adminAuth.setCustomUserClaims(uid, {
    roles: normalizeRoles(d.roles),
    coordTowns: strings(d.coordTowns),
    shops: strings(d.shopIds),
  });
  if (snap.exists) await ref.update({ claimsUpdatedAt: Date.now() });
}
