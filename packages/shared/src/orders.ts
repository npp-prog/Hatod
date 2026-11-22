/**
 * Order lifecycle. Only Cloud Functions change an order's status; this module
 * is the single definition of which changes are allowed and by whom.
 *
 *   PLACED ── shop accepts ──> SHOP_ACCEPTED ── offer to chosen rider ──> RIDER_OFFERED ── rider accepts ──> RIDER_ASSIGNED
 *     │                          ▲    │ (shop delivers itself) ─────────────────────────────────────────────────┘ │
 *     │                          └────┴── rider declines / offer expires: customer picks another rider            │
 *     ├─ shop declines ──> SHOP_DECLINED                                         RIDER_ASSIGNED ─> PICKED_UP ─> DELIVERED ─> COMPLETED
 *     └─ no answer in 10 min ──> EXPIRED                                         (cancel allowed until PICKED_UP, with a reason after PLACED)
 */
export const ORDER_STATUSES = [
  'PLACED',
  'SHOP_ACCEPTED',
  'SHOP_DECLINED',
  'RIDER_OFFERED',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderActor = 'customer' | 'shop' | 'rider' | 'admin' | 'system';

/** Orders that still need someone to do something. */
export const ACTIVE_STATUSES: OrderStatus[] = ['PLACED', 'SHOP_ACCEPTED', 'RIDER_OFFERED', 'RIDER_ASSIGNED', 'PICKED_UP', 'DELIVERED'];
export const FINAL_STATUSES: OrderStatus[] = ['COMPLETED', 'CANCELLED', 'SHOP_DECLINED', 'EXPIRED'];

export const ORDER_TIMING = {
  /** A shop that does not answer in 10 minutes: the order expires. */
  shopResponseMs: 10 * 60_000,
  /** A rider has 60 seconds to accept an offer. */
  offerMs: 60_000,
  /** A delivered order completes by itself after 2 hours if the customer does not confirm. */
  autoCompleteMs: 2 * 3600_000,
  /** Riders go offline after 2 hours without activity. */
  riderIdleMs: 2 * 3600_000,
} as const;

export const MAX_OPEN_ORDERS = 5;
export const READY_TIME_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
export const DECLINE_REASONS = ['sold_out', 'too_busy', 'closing', 'too_far', 'other'] as const;
export const CANCEL_REASONS = ['changed_mind', 'too_long', 'wrong_order', 'sold_out', 'closing', 'customer_unreachable', 'other'] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];
export type CancelReason = (typeof CANCEL_REASONS)[number];

type Rule = { to: OrderStatus; by: OrderActor[] };
const RULES: Record<OrderStatus, Rule[]> = {
  PLACED: [
    { to: 'SHOP_ACCEPTED', by: ['shop'] },
    { to: 'SHOP_DECLINED', by: ['shop'] },
    { to: 'EXPIRED', by: ['system'] },
    { to: 'CANCELLED', by: ['customer', 'admin'] },
  ],
  SHOP_ACCEPTED: [
    { to: 'RIDER_OFFERED', by: ['system', 'customer'] },
    { to: 'RIDER_ASSIGNED', by: ['shop'] },
    { to: 'CANCELLED', by: ['customer', 'shop', 'admin'] },
  ],
  RIDER_OFFERED: [
    { to: 'RIDER_ASSIGNED', by: ['rider'] },
    { to: 'SHOP_ACCEPTED', by: ['rider', 'system'] },
    { to: 'CANCELLED', by: ['customer', 'shop', 'admin'] },
  ],
  RIDER_ASSIGNED: [
    { to: 'PICKED_UP', by: ['rider', 'shop'] },
    { to: 'CANCELLED', by: ['customer', 'shop', 'admin'] },
  ],
  PICKED_UP: [
    { to: 'DELIVERED', by: ['rider', 'shop'] },
    { to: 'CANCELLED', by: ['admin'] },
  ],
  DELIVERED: [
    { to: 'COMPLETED', by: ['customer', 'system', 'admin'] },
    { to: 'CANCELLED', by: ['admin'] },
  ],
  COMPLETED: [],
  CANCELLED: [],
  SHOP_DECLINED: [],
  EXPIRED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  return RULES[from].some((r) => r.to === to && r.by.includes(actor));
}

/** A cancel needs a reason once the shop has started on the order. */
export function cancelNeedsReason(from: OrderStatus, actor: OrderActor): boolean {
  return !(from === 'PLACED' && actor === 'customer');
}

export function isActive(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Who delivers: the assigned rider, or the shop itself. */
export function delivererActor(order: { selfDelivery: boolean }): 'rider' | 'shop' {
  return order.selfDelivery ? 'shop' : 'rider';
}

/** Steps shown on the customer's tracking timeline, in order. */
export const TIMELINE: OrderStatus[] = ['PLACED', 'SHOP_ACCEPTED', 'RIDER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED'];

/** How far along the timeline an order is (RIDER_OFFERED counts as SHOP_ACCEPTED). */
export function timelineIndex(status: OrderStatus): number {
  const s = status === 'RIDER_OFFERED' ? 'SHOP_ACCEPTED' : status;
  return TIMELINE.indexOf(s);
}
