'use client';

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebase } from '@/lib/firebase/client';

const VAPID = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

export type PushState = 'unsupported' | 'default' | 'denied' | 'granted';

export function pushState(): PushState {
  if (!VAPID || typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PushState;
}

/**
 * Asks permission, gets this phone's push token through our own service
 * worker (sw.ts shows the notifications) and stores it under
 * users/{uid}/devices so Cloud Functions can notify this phone.
 */
export async function enablePush(uid: string): Promise<PushState> {
  if (pushState() === 'unsupported') return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushState;
  const [{ getMessaging, getToken, isSupported }] = await Promise.all([import('firebase/messaging')]);
  if (!(await isSupported())) return 'unsupported';
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebase().app), { vapidKey: VAPID, serviceWorkerRegistration: registration });
  await setDoc(doc(firebase().db, 'users', uid, 'devices', token), {
    token,
    platform: navigator.userAgent.includes('Android') ? 'android-web' : 'web',
    updatedAt: serverTimestamp(),
  });
  return 'granted';
}
