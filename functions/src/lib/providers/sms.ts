import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { db } from '../admin';
import { SEMAPHORE_API_KEY, SEMAPHORE_SENDER, SMS_PROVIDER, secretValue } from '../params';

export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

/** Development and tests: no SMS is sent; the message is logged and kept in smsOutbox. */
export class ConsoleSms implements SmsProvider {
  async send(to: string, message: string) {
    logger.info('SMS (console)', { to, message });
    await db.collection('smsOutbox').add({ to, message, provider: 'console', createdAt: FieldValue.serverTimestamp() });
  }
}

/** Semaphore (semaphore.co), a Philippine SMS gateway. */
export class SemaphoreSms implements SmsProvider {
  constructor(
    private apiKey: string,
    private sender: string,
  ) {}
  async send(to: string, message: string) {
    const body = new URLSearchParams({ apikey: this.apiKey, number: to.replace('+63', '0'), message: message.slice(0, 300), sendername: this.sender });
    const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`semaphore_${res.status}`);
  }
}

export function smsProvider(): SmsProvider {
  const key = secretValue(SEMAPHORE_API_KEY);
  if (SMS_PROVIDER.value() === 'semaphore' && key) return new SemaphoreSms(key, SEMAPHORE_SENDER.value());
  return new ConsoleSms();
}
