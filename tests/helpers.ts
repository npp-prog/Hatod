import { deleteApp, getApps as getAdminApps, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken, type User } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

export const PROJECT_ID = 'demo-hatod';
export const REGION = 'asia-southeast1';

const adminApp = getAdminApps()[0] ?? initAdmin({ projectId: PROJECT_ID });
export const adminAuth = getAdminAuth(adminApp);
export const adminDb = getAdminDb(adminApp);

let n = 0;

/** A separate client app per simulated person, signed in as a fresh phone user. */
export async function signInAsPhoneUser(phone: string): Promise<{ app: FirebaseApp; user: User; uid: string }> {
  const uid = `test-${Date.now()}-${n++}`;
  await adminAuth.createUser({ uid, phoneNumber: phone });
  const token = await adminAuth.createCustomToken(uid);
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key' }, uid);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const cred = await signInWithCustomToken(auth, token);
  return { app, user: cred.user, uid };
}

export function callable<I, O>(app: FirebaseApp, name: string) {
  const fns = getFunctions(app, REGION);
  const [host, port] = (process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001').split(':');
  connectFunctionsEmulator(fns, host!, Number(port));
  return httpsCallable<I, O>(fns, name);
}

export async function closeAdmin() {
  await deleteApp(adminApp);
}
