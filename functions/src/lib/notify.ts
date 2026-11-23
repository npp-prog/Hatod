import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { db } from './admin';
import { smsProvider } from './providers/sms';

export interface Notice {
  title: string;
  body: string;
  /** App path to open, e.g. /shop/orders */
  link: string;
  /** Also send an SMS: for things people must not miss (new order, job offer). */
  sms?: boolean;
}

/**
 * Tells a person something happened: web push to every registered device and,
 * for important events, an SMS (web push is unreliable on some Android
 * phones). Never throws: a failed notification must not undo an order change.
 */
export async function notify(uid: string, notice: Notice): Promise<void> {
  try {
    const [devices, user] = await Promise.all([db.collection('users').doc(uid).collection('devices').get(), db.collection('users').doc(uid).get()]);
    const tokens = devices.docs.map((d) => d.get('token') as string).filter(Boolean);
    if (tokens.length) {
      const res = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title: notice.title, body: notice.body },
        webpush: { fcmOptions: { link: notice.link }, notification: { requireInteraction: !!notice.sms, tag: notice.link } },
        data: { link: notice.link },
      });
      // Forget tokens the browser no longer accepts.
      await Promise.all(
        res.responses.map((r, i) =>
          !r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code ?? '')
            ? devices.docs[i]!.ref.delete()
            : Promise.resolve(),
        ),
      );
    }
    const phone = user.get('phone') as string | undefined;
    if (notice.sms && phone) await smsProvider().send(phone, `Hatod: ${notice.body}`);
  } catch (e) {
    logger.warn('notify failed', { uid, error: String(e) });
  }
}
