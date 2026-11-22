import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// App shell precache + Serwist's default runtime caching (pages network-first,
// static assets cache-first). Menu and order caching is added in M5/M6.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

/**
 * Web push from Firebase Cloud Messaging. The payload carries
 * { notification: { title, body }, data: { link } }. Orders and job offers
 * stay on screen until tapped (requireInteraction) so they are not missed.
 */
self.addEventListener('push', (event) => {
  let payload: { notification?: { title?: string; body?: string }; data?: { link?: string } } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    /* not JSON */
  }
  const title = payload.notification?.title ?? 'Hatod';
  const link = payload.data?.link ?? '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.notification?.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: link,
      data: { link },
      requireInteraction: link.startsWith('/shop/orders') || link.startsWith('/rider/jobs'),
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data as { link?: string } | undefined)?.link ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).pathname.endsWith(link));
      if (open) return open.focus();
      return self.clients.openWindow(link);
    })(),
  );
});
