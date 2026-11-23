import { z } from 'zod';
import { PLAN_CODES } from '../subscriptions';

export const choosePlanInput = z.object({ planCode: z.enum(PLAN_CODES) });
export const startCheckoutInput = z.object({
  /** Number of periods to pay for (period plans). */
  periods: z.number().int().min(1).max(12).default(1),
  /** Top-up amount (rider daily). */
  topUp: z.number().int().min(5).max(5000).nullable().default(null),
  method: z.enum(['gcash', 'maya']).default('gcash'),
});
export const recordCashPaymentInput = z.object({
  subscriptionId: z.string().min(1).max(200),
  receiptNo: z.string().trim().min(1, 'receipt_required').max(40).regex(/^[A-Za-z0-9-]+$/, 'bad_receipt'),
  periods: z.number().int().min(1).max(12).default(1),
  topUp: z.number().int().min(5).max(5000).nullable().default(null),
});
export const setPlanPricesInput = z.object({
  code: z.enum(PLAN_CODES),
  prices: z.object({ A: z.number().int().min(0).max(5000), B: z.number().int().min(0).max(5000), C: z.number().int().min(0).max(5000) }),
  active: z.boolean(),
});
