import { z } from 'zod';
import { CART_LIMITS } from '../cart';
import { CANCEL_REASONS, DECLINE_REASONS, READY_TIME_OPTIONS } from '../orders';
import { PAYMENT_METHODS } from '../shops';

const id = z.string().min(1).max(128);

export const placeOrderInput = z.object({
  /** Client-generated id: retrying the same request never creates a second order. */
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  shopId: id,
  lines: z
    .array(
      z.object({
        itemId: id,
        variant: z.string().max(30).nullable(),
        addOns: z.array(z.string().max(30)).max(20),
        qty: z.number().int().min(1).max(CART_LIMITS.qtyMax),
        note: z.string().max(CART_LIMITS.noteMax).default(''),
      }),
    )
    .min(1)
    .max(CART_LIMITS.linesMax),
  addressId: id,
  paymentMethod: z.enum(PAYMENT_METHODS),
  riderId: id.nullable(),
});
export type PlaceOrderInput = z.input<typeof placeOrderInput>;

export const shopRespondInput = z.discriminatedUnion('accept', [
  z.object({ orderId: id, accept: z.literal(true), readyInMinutes: z.number().int().refine((n) => (READY_TIME_OPTIONS as readonly number[]).includes(n)) }),
  z.object({ orderId: id, accept: z.literal(false), reason: z.enum(DECLINE_REASONS) }),
]);

export const riderRespondInput = z.object({ offerId: id, accept: z.boolean() });
export const chooseRiderInput = z.object({ orderId: id, riderId: id });
export const advanceOrderInput = z.object({ orderId: id, to: z.enum(['PICKED_UP', 'DELIVERED', 'COMPLETED']) });
export const cancelOrderInput = z.object({ orderId: id, reason: z.enum(CANCEL_REASONS).nullable().default(null) });
export const markPaidInput = z.object({ orderId: id, party: z.enum(['shop', 'rider']) });
export const orderIdInput = z.object({ orderId: id });
