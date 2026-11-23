import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { db } from './admin';

/** Appends an entry to adminLog inside the caller's transaction. */
export function logAdminAction(
  tx: Transaction,
  entry: { action: string; actorId: string; targetId: string; before?: unknown; after?: unknown; note?: string },
) {
  tx.create(db.collection('adminLog').doc(), { ...entry, createdAt: FieldValue.serverTimestamp() });
}
