import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { menuSummary } from '@hatod/shared';
import { db } from '../lib/admin';
import { parseInput, requireRole } from '../lib/guards';

/** Recomputes shops/{id}.menuSummary from the menu as stored. */
export async function recomputeMenuSummary(shopId: string) {
  const shopRef = db.collection('shops').doc(shopId);
  const items = await shopRef.collection('menuItems').get();
  const summary = menuSummary(
    items.docs.map((d) => ({
      name: String(d.get('name') ?? ''),
      category: String(d.get('category') ?? ''),
      price: Number(d.get('price') ?? 0),
      available: d.get('available') !== false,
      variants: (d.get('variants') as { price: number }[] | undefined) ?? [],
    })),
  );
  await shopRef.update({ menuSummary: summary, menuSummaryAt: FieldValue.serverTimestamp() });
  return summary;
}

/**
 * The shop app calls this after changing its menu. The summary (item counts,
 * lowest price, dish words for search) is computed here from the stored menu,
 * so the owner cannot write a misleading one. Idempotent: calling it twice or
 * late just recomputes the same thing.
 */
export const refreshMenuSummary = onCall(async (req) => {
  const caller = requireRole(req, 'shop');
  const { shopId } = parseInput(z.object({ shopId: z.string().min(1).max(128) }), req.data);
  if (!caller.claims.shops?.includes(shopId)) throw new HttpsError('permission-denied', 'not_your_shop');
  return recomputeMenuSummary(shopId);
});
