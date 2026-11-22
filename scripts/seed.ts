/**
 * Seeds the local emulators with demo accounts (one per role).
 * Run with the emulators up:  npm run seed
 * Refuses to run against anything but the emulators.
 *
 * Sign in on the web app with any of the numbers below; the 6-digit code
 * appears in the emulator terminal and in the Emulator UI (Auth tab).
 * Later milestones extend this with towns, barangays, shops, riders and plans.
 */
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'demo-hatod';

const PROJECT_ID = process.env.GCLOUD_PROJECT;
if (!PROJECT_ID.startsWith('demo-')) {
  console.error(`Refusing to seed project "${PROJECT_ID}": only demo-* emulator projects can be seeded.`);
  process.exit(1);
}

type Role = 'customer' | 'shop' | 'rider' | 'coordinator' | 'admin';

export const DEMO_TOWN_ID = 'demo-town';

const PEOPLE: { uid: string; name: string; phone: string; roles: Role[]; coordTowns?: string[] }[] = [
  { uid: 'demo-admin', name: 'Ana Admin', phone: '+639170000001', roles: ['customer', 'admin'] },
  {
    uid: 'demo-coordinator',
    name: 'Carlo Coordinator',
    phone: '+639170000002',
    roles: ['customer', 'coordinator'],
    coordTowns: [DEMO_TOWN_ID],
  },
  { uid: 'demo-shop', name: 'Susan Shop', phone: '+639170000003', roles: ['customer', 'shop'] },
  { uid: 'demo-rider', name: 'Ramon Rider', phone: '+639170000004', roles: ['customer', 'rider'] },
  { uid: 'demo-customer', name: 'Carmen Customer', phone: '+639170000005', roles: ['customer'] },
  { uid: 'demo-shop-rider', name: 'Sonny Shop-Rider', phone: '+639170000006', roles: ['customer', 'shop', 'rider'] },
];

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { FieldValue, getFirestore } = await import('firebase-admin/firestore');
  const { PRIVACY_VERSION, TERMS_VERSION } = await import('@hatod/shared');

  initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();

  for (const p of PEOPLE) {
    try {
      await auth.getUser(p.uid);
      await auth.updateUser(p.uid, { phoneNumber: p.phone, displayName: p.name });
    } catch {
      await auth.createUser({ uid: p.uid, phoneNumber: p.phone, displayName: p.name });
    }
    const coordTowns = p.coordTowns ?? [];
    await auth.setCustomUserClaims(p.uid, { roles: p.roles, coordTowns });
    const now = FieldValue.serverTimestamp();
    await db.doc(`users/${p.uid}`).set({
      uid: p.uid,
      name: p.name,
      phone: p.phone,
      roles: p.roles,
      coordTowns,
      defaultTownId: null,
      status: 'active',
      strikes: [],
      locale: 'en',
      consent: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now },
      claimsUpdatedAt: Date.now(),
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  ${p.phone.replace('+63', '0')}  ${p.name.padEnd(18)} ${p.roles.join(', ')}`);
  }
  console.log('\nSeeded demo accounts. Sign in with any number above; the code shows in the emulator log.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
