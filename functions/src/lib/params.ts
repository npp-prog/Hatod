import { defineSecret, defineString } from 'firebase-functions/params';

/** "console" (default: logs and stores messages in smsOutbox) or "semaphore" (real SMS). */
export const SMS_PROVIDER = defineString('SMS_PROVIDER', { default: 'console' });
export const SEMAPHORE_SENDER = defineString('SEMAPHORE_SENDER', { default: 'HATOD' });
/** Secrets live in Cloud Secret Manager: firebase functions:secrets:set SEMAPHORE_API_KEY */
export const SEMAPHORE_API_KEY = defineSecret('SEMAPHORE_API_KEY');
/** OpenRouteService key for road distance. Empty = straight-line estimate × 1.3. */
export const ORS_API_KEY = defineSecret('ORS_API_KEY');

/** Reads a secret without failing where it is not configured (emulator, tests). */
export function secretValue(s: { value(): string }): string {
  try {
    return s.value() ?? '';
  } catch {
    return '';
  }
}

/**
 * "paymongo" (default) or "mock" (a local test checkout page). Mock only
 * works inside the emulator, so a deploy that forgets this setting cannot
 * hand out free subscriptions.
 */
export const PAYMENT_PROVIDER = defineString('PAYMENT_PROVIDER', { default: 'paymongo' });

/** True only when running in the Firebase emulator. */
export const inEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';
/** Where checkout pages send people back to, e.g. https://hatod.ph */
export const APP_BASE_URL = defineString('APP_BASE_URL', { default: 'http://localhost:3000' });
export const PAYMONGO_SECRET_KEY = defineSecret('PAYMONGO_SECRET_KEY');
export const PAYMONGO_WEBHOOK_SECRET = defineSecret('PAYMONGO_WEBHOOK_SECRET');
