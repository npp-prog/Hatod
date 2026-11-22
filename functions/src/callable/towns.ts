import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  barangayId,
  endOfManilaDay,
  importBarangaysInput,
  parseBarangayCsv,
  roundLatLng,
  townId as makeTownId,
  upsertTownInput,
} from '@hatod/shared';
import { db } from '../lib/admin';
import { logAdminAction } from '../lib/audit';
import { parseInput, requireRole } from '../lib/guards';

/** Admin: create a town, or update one when townId is given. */
export const adminUpsertTown = onCall(async (req) => {
  const caller = requireRole(req, 'admin');
  const input = parseInput(upsertTownInput, req.data);
  const id = input.townId ?? makeTownId(input.name, input.province);
  const ref = db.collection('towns').doc(id);

  const fields = {
    name: input.name,
    province: input.province,
    tier: input.tier,
    isLive: input.isLive,
    trialEndsAt: input.trialEndsOn ? Timestamp.fromDate(endOfManilaDay(input.trialEndsOn)) : null,
    center: roundLatLng(input.center),
    radiusKm: input.radiusKm,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (input.townId && !snap.exists) throw new HttpsError('not-found', 'town_not_found');
    if (!input.townId && snap.exists) throw new HttpsError('already-exists', 'town_exists');
    if (snap.exists) {
      tx.update(ref, fields);
    } else {
      tx.create(ref, { ...fields, coordinatorIds: [], createdAt: FieldValue.serverTimestamp() });
    }
    logAdminAction(tx, {
      action: snap.exists ? 'updateTown' : 'createTown',
      actorId: caller.uid,
      targetId: id,
      before: snap.exists ? snap.data() : null,
      after: { ...fields, updatedAt: null },
    });
    return !snap.exists;
  });

  return { townId: id, created };
});

/**
 * Admin: upsert barangays from CSV (name,lat,lng). Rows are matched by name,
 * so re-importing updates coordinates instead of duplicating. Barangays missing
 * from the file are left alone: saved addresses may point at them.
 */
export const adminImportBarangays = onCall(async (req) => {
  const caller = requireRole(req, 'admin');
  const input = parseInput(importBarangaysInput, req.data);
  const townRef = db.collection('towns').doc(input.townId);
  const town = await townRef.get();
  if (!town.exists) throw new HttpsError('not-found', 'town_not_found');

  const { rows, issues } = parseBarangayCsv(input.csv);
  if (rows.length === 0) return { created: 0, updated: 0, issues };

  const refs = rows.map((r) => db.collection('barangays').doc(barangayId(input.townId, r.name)));
  const existing = await db.getAll(...refs);
  const now = FieldValue.serverTimestamp();
  let created = 0;
  let updated = 0;

  // A Firestore batch holds 500 writes; MAX_BARANGAY_ROWS keeps us below that.
  const batch = db.batch();
  rows.forEach((r, i) => {
    const data = { townId: input.townId, name: r.name, centroid: roundLatLng(r), active: true, updatedAt: now };
    if (existing[i]!.exists) {
      batch.update(refs[i]!, data);
      updated++;
    } else {
      batch.create(refs[i]!, { ...data, createdAt: now });
      created++;
    }
  });
  batch.create(db.collection('adminLog').doc(), {
    action: 'importBarangays',
    actorId: caller.uid,
    targetId: input.townId,
    after: { created, updated, issues: issues.length },
    createdAt: now,
  });
  await batch.commit();
  return { created, updated, issues };
});
