import { z } from 'zod';
import { manilaParts } from './hours';
import type { OrderStatus } from './orders';

/** Coordinator decides on a shop or rider after checking documents in person. */
export const verifyListingInput = z.object({
  kind: z.enum(['shop', 'rider']),
  id: z.string().min(1).max(128),
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).default(''),
}).refine((v) => v.decision === 'approve' || v.note.length >= 3, { message: 'note_required', path: ['note'] });

/**
 * Account actions. Coordinators may suspend in their own town (pending admin
 * review); only admins ban or reinstate.
 */
export const setAccountStatusInput = z.object({
  type: z.enum(['customer', 'shop', 'rider']),
  id: z.string().min(1).max(128),
  action: z.enum(['suspend', 'ban', 'reinstate']),
  note: z.string().trim().min(3, 'note_required').max(500),
});

export const metricsInput = z.object({
  townId: z.string().min(1).max(130).nullable(),
  days: z.number().int().min(1).max(90).default(14),
});

/** The small slice of an order the dashboard needs. */
export interface MetricOrder {
  status: OrderStatus;
  customerId: string;
  shopId: string;
  riderId: string | null;
  createdAt: number;
  /** ms from placement to a rider (or the shop) being assigned; null if never. */
  assignMs: number | null;
}

export interface Metrics {
  days: { date: string; placed: number; completed: number }[];
  placed: number;
  completed: number;
  cancelled: number;
  /** completed ÷ finished (orders still in progress are left out). */
  completionRate: number | null;
  /** Median minutes from order to assigned delivery. */
  medianAssignMinutes: number | null;
  /** Shops and riders with at least one completed order in the last 7 days. */
  activeShops: number;
  activeRiders: number;
  /** Of customers with a completed order in the period, the share with two or more. */
  repeatRate: number | null;
  customers: number;
}

const DAY = 24 * 3600_000;

/** Pilot dashboard numbers from a list of orders (pure, so it is unit tested). */
export function computeMetrics(orders: MetricOrder[], now: number, days: number): Metrics {
  const start = now - days * DAY;
  const inRange = orders.filter((o) => o.createdAt >= start && o.createdAt <= now);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(manilaParts(new Date(now - i * DAY)).date);
  const byDay = new Map(dates.map((d) => [d, { date: d, placed: 0, completed: 0 }]));
  for (const o of inRange) {
    const row = byDay.get(manilaParts(new Date(o.createdAt)).date);
    if (!row) continue;
    row.placed++;
    if (o.status === 'COMPLETED') row.completed++;
  }
  const completedOrders = inRange.filter((o) => o.status === 'COMPLETED');
  const finished = inRange.filter((o) => ['COMPLETED', 'CANCELLED', 'SHOP_DECLINED', 'EXPIRED'].includes(o.status));
  const assign = inRange.map((o) => o.assignMs).filter((m): m is number => m !== null).sort((a, b) => a - b);
  const median = assign.length ? assign[Math.floor((assign.length - 1) / 2)]! / 60_000 : null;
  const week = completedOrders.filter((o) => o.createdAt >= now - 7 * DAY);
  const perCustomer = new Map<string, number>();
  for (const o of completedOrders) perCustomer.set(o.customerId, (perCustomer.get(o.customerId) ?? 0) + 1);
  const repeaters = [...perCustomer.values()].filter((n) => n >= 2).length;
  return {
    days: [...byDay.values()],
    placed: inRange.length,
    completed: completedOrders.length,
    cancelled: inRange.filter((o) => o.status === 'CANCELLED').length,
    completionRate: finished.length ? completedOrders.length / finished.length : null,
    medianAssignMinutes: median === null ? null : Math.round(median * 10) / 10,
    activeShops: new Set(week.map((o) => o.shopId)).size,
    activeRiders: new Set(week.map((o) => o.riderId).filter(Boolean)).size,
    repeatRate: perCustomer.size ? repeaters / perCustomer.size : null,
    customers: perCustomer.size,
  };
}
