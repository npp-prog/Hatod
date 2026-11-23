/**
 * One-time setup for a real Firebase project: writes config/app, which the
 * security rules read to accept only image URLs from this project's Storage
 * bucket.
 *
 *   GCLOUD_PROJECT=my-project STORAGE_BUCKET=my-project.firebasestorage.app npx tsx scripts/set-config.ts
 *
 * Uses Application Default Credentials (`gcloud auth application-default login`).
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT;
const storageBucket = process.env.STORAGE_BUCKET;
if (!projectId || !storageBucket) {
  console.error('Set GCLOUD_PROJECT and STORAGE_BUCKET (as shown in Firebase console → Storage).');
  process.exit(1);
}
initializeApp({ projectId });
getFirestore()
  .doc('config/app')
  .set({ storageBucket }, { merge: true })
  .then(() => console.log(`config/app.storageBucket = ${storageBucket} on ${projectId}`));
