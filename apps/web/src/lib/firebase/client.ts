'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-hatod',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const region = process.env.NEXT_PUBLIC_FUNCTIONS_REGION ?? 'asia-southeast1';

interface Clients {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
}

let clients: Clients | null = null;

/** Lazily creates the Firebase clients in the browser (never during server rendering). */
export function firebase(): Clients {
  if (clients) return clients;
  const app = getApps().length ? getApp() : initializeApp(config);
  // initializeAuth instead of getAuth: no popup/redirect sign-in resolver, so
  // every page skips loading Google's apis.google.com iframe script (phone OTP
  // does not need it). Saves a request and ~100 KB on slow connections.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // Persistent cache: towns, barangays and addresses stay readable offline, and
  // writes made offline are queued and sent when the signal returns.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const functions = getFunctions(app, region);
  const storage = getStorage(app);
  if (useEmulators) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    connectStorageEmulator(storage, host, 9199);
  }
  auth.useDeviceLanguage();
  clients = { app, auth, db, functions, storage };
  return clients;
}

export const isEmulator = useEmulators;
