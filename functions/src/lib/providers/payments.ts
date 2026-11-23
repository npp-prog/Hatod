import { createHmac, timingSafeEqual } from 'node:crypto';
import { APP_BASE_URL, inEmulator, PAYMENT_PROVIDER, PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET, secretValue } from '../params';

export interface CheckoutRequest {
  checkoutId: string;
  amount: number;
  description: string;
  method: 'gcash' | 'maya';
}

export interface PaymentProvider {
  name: 'mock' | 'paymongo';
  /** Returns the URL to send the person to, and the provider's session id. */
  createCheckout(req: CheckoutRequest): Promise<{ url: string; sessionId: string }>;
}

/** Development: a page in our own app with a "Pay" button. Never used in production. */
export class MockPayments implements PaymentProvider {
  name = 'mock' as const;
  async createCheckout(req: CheckoutRequest) {
    return { url: `${APP_BASE_URL.value()}/pay/mock?checkout=${encodeURIComponent(req.checkoutId)}`, sessionId: `mock_${req.checkoutId}` };
  }
}

/** PayMongo Checkout (GCash, Maya). The webhook confirms payment; the return URL is only for the person. */
export class PayMongoPayments implements PaymentProvider {
  name = 'paymongo' as const;
  constructor(private secretKey: string) {}
  async createCheckout(req: CheckoutRequest) {
    const base = APP_BASE_URL.value();
    const res = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{ name: req.description, amount: req.amount * 100, currency: 'PHP', quantity: 1 }],
            payment_method_types: [req.method === 'maya' ? 'paymaya' : 'gcash'],
            description: req.description,
            success_url: `${base}/pay/done?checkout=${encodeURIComponent(req.checkoutId)}`,
            cancel_url: `${base}/pay/done?checkout=${encodeURIComponent(req.checkoutId)}&cancelled=1`,
            metadata: { checkoutId: req.checkoutId },
            send_email_receipt: false,
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`paymongo_${res.status}`);
    const json = (await res.json()) as { data: { id: string; attributes: { checkout_url: string } } };
    return { url: json.data.attributes.checkout_url, sessionId: json.data.id };
  }
}

/** Fails closed: mock only inside the emulator, PayMongo only with its key. */
export function paymentProvider(): PaymentProvider {
  if (mockPaymentsActive()) return new MockPayments();
  const key = secretValue(PAYMONGO_SECRET_KEY);
  if (PAYMENT_PROVIDER.value() !== 'paymongo' || !key) throw new Error('payments_not_configured');
  return new PayMongoPayments(key);
}

export const mockPaymentsActive = () => PAYMENT_PROVIDER.value() === 'mock' && inEmulator();

/** A live secret key means live mode: only live-mode events and signatures count. */
export const paymongoLive = () => secretValue(PAYMONGO_SECRET_KEY).startsWith('sk_live_');

/**
 * Checks PayMongo's "Paymongo-Signature: t=…,te=…,li=…" header: HMAC-SHA256 of
 * "{t}.{raw body}" with the webhook secret (te = test mode, li = live mode),
 * and rejects events older than 5 minutes.
 */
export function verifyPaymongoSignature(header: string | undefined, rawBody: Buffer, now = Date.now(), live = paymongoLive()): boolean {
  const secret = secretValue(PAYMONGO_WEBHOOK_SECRET);
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody.toString('utf8')}`).digest('hex');
  const given = (live ? parts.li : parts.te) || '';
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
