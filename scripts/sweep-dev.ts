/**
 * Local development only: runs the order sweep (timeouts, auto-complete,
 * idle riders) against the emulators every 30 seconds. In production the
 * scheduled function sweepOrders does this every minute; the emulator does
 * not run scheduled functions.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT ??= 'demo-hatod';
if (!process.env.GCLOUD_PROJECT.startsWith('demo-')) throw new Error('sweep-dev only runs against demo-* emulator projects');

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { sweep } = await import('../functions/src/jobs/sweep');
  const { sweepSubscriptions } = await import('../functions/src/callable/subscriptions');
  const once = process.argv.includes('--once');
  do {
    try {
      const r = { ...(await sweep()), ...(await sweepSubscriptions()) };
      if (Object.values(r).some((n) => n > 0)) console.log(new Date().toISOString(), r);
    } catch (e) {
      console.warn('sweep failed (emulators not up yet?)', String(e).slice(0, 120));
    }
    if (!once) await new Promise((r) => setTimeout(r, 30_000));
  } while (!once);
}
void main();
