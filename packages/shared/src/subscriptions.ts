import type { TownTier } from './towns';

/**
 * Subscriptions are the only money Hatod handles. Shops and riders pay a flat
 * plan price; Hatod never takes anything per order or per delivery.
 */
export const PLAN_CODES = ['shop_basic', 'shop_standard', 'shop_plus', 'rider_daily', 'rider_monthly', 'featured_banner'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type PlanPeriod = 'day' | 'week' | 'month';

export interface PlanDoc {
  code: PlanCode;
  subscriberType: 'shop' | 'rider';
  period: PlanPeriod;
  /** Price in pesos per town tier. */
  prices: Record<TownTier, number>;
  features: string[];
  active: boolean;
}

/** Starting prices from the plan (PHP), the same in every tier until an admin changes them. */
const same = (n: number): Record<TownTier, number> => ({ A: n, B: n, C: n });
export const DEFAULT_PLANS: PlanDoc[] = [
  { code: 'shop_basic', subscriberType: 'shop', period: 'month', prices: same(0), features: ['listing', 'contact', 'menu_10'], active: true },
  { code: 'shop_standard', subscriberType: 'shop', period: 'month', prices: same(199), features: ['listing', 'full_menu', 'in_app_orders', 'order_history', 'sales_count'], active: true },
  { code: 'shop_plus', subscriberType: 'shop', period: 'month', prices: same(399), features: ['listing', 'full_menu', 'in_app_orders', 'order_history', 'sales_count', 'featured', 'weekly_analytics', 'staff_logins'], active: true },
  { code: 'rider_daily', subscriberType: 'rider', period: 'day', prices: same(5), features: ['rider_listing', 'job_offers', 'ratings'], active: true },
  { code: 'rider_monthly', subscriberType: 'rider', period: 'month', prices: same(69), features: ['rider_listing', 'job_offers', 'ratings'], active: true },
  { code: 'featured_banner', subscriberType: 'shop', period: 'week', prices: same(150), features: ['home_banner'], active: false },
];

export const SHOP_PLANS: PlanCode[] = ['shop_basic', 'shop_standard', 'shop_plus'];
export const RIDER_PLANS: PlanCode[] = ['rider_daily', 'rider_monthly'];

export const DAY_MS = 24 * 3600_000;
export const TRIAL_DAYS = 60;
export const GRACE_DAYS = 3;
/** Shops on Basic (or lapsed) show at most this many menu items. */
export const BASIC_MENU_LIMIT = 10;
export const DAILY_TOPUP_OPTIONS = [50, 100, 150, 300] as const;

export type SubStatus = 'trial' | 'active' | 'grace' | 'lapsed';

/**
 * subscriptions/{shop|rider}_{id}. Written only by Cloud Functions.
 * Times are milliseconds. Payments live in the payments subcollection.
 */
export interface SubscriptionDoc {
  subscriberType: 'shop' | 'rider';
  subscriberId: string;
  ownerUid: string;
  townId: string;
  planCode: PlanCode;
  status: SubStatus;
  trialEndsAt: number;
  /** Paid until (period plans). Null before the first payment. */
  currentPeriodEnd: number | null;
  /** Prepaid pesos (rider daily plan). */
  balance: number;
  /** Manila date the daily fee was last charged. */
  lastChargedDate: string | null;
  /** When the status will next change by itself (for the daily sweep). */
  nextChangeAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentRecord {
  amount: number;
  method: 'gcash' | 'maya' | 'card' | 'cash' | 'mock';
  /** Provider reference or cash receipt number; also the payment's document id. */
  ref: string;
  receiptNo: string;
  recordedBy: string | null;
  kind: 'period' | 'topup';
  periods: number;
  at: number;
}

/** Plan period added to a date. Months are 30 days so renewals are predictable. */
export function periodMs(period: PlanPeriod): number {
  return period === 'day' ? DAY_MS : period === 'week' ? 7 * DAY_MS : 30 * DAY_MS;
}

/** New paid-until after paying n periods: from today if lapsed, else from the current end. */
export function extendPeriod(currentEnd: number | null, now: number, period: PlanPeriod, periods: number): number {
  return Math.max(currentEnd ?? 0, now) + periodMs(period) * periods;
}

/**
 * Status at `now`. Free Basic is always active. Rider Daily is active while
 * the balance covers a day (or during the trial). Period plans:
 * trial → active (paid) → grace (3 days after the paid period ends) → lapsed.
 */
export function subscriptionStatus(sub: Pick<SubscriptionDoc, 'planCode' | 'trialEndsAt' | 'currentPeriodEnd' | 'balance'>, now: number, dailyPrice = 5): SubStatus {
  if (sub.planCode === 'shop_basic') return 'active';
  if (now < sub.trialEndsAt) return 'trial';
  if (sub.planCode === 'rider_daily') return sub.balance >= dailyPrice ? 'active' : 'lapsed';
  const end = sub.currentPeriodEnd ?? sub.trialEndsAt;
  if (sub.currentPeriodEnd !== null && now < end) return 'active';
  if (now < end + GRACE_DAYS * DAY_MS) return 'grace';
  return 'lapsed';
}

/** The next moment the status changes without anyone doing anything. */
export function nextStatusChange(sub: Pick<SubscriptionDoc, 'planCode' | 'trialEndsAt' | 'currentPeriodEnd'>, now: number): number | null {
  if (sub.planCode === 'shop_basic') return null;
  const candidates = [sub.trialEndsAt];
  if (sub.planCode !== 'rider_daily') {
    const end = sub.currentPeriodEnd ?? sub.trialEndsAt;
    candidates.push(end, end + GRACE_DAYS * DAY_MS);
  }
  const future = candidates.filter((t) => t > now).sort((a, b) => a - b);
  return future[0] ?? null;
}

/** Subscriptions in these states keep their listing and features. */
export function inGoodStanding(status: SubStatus | null | undefined): boolean {
  return status === 'trial' || status === 'active' || status === 'grace';
}

/** A shop takes in-app orders only on a paid plan in good standing; Basic and lapsed shops get calls and messages. */
export function shopTakesOrders(shop: { planCode?: PlanCode | null; subscriptionStatus?: SubStatus | null }): boolean {
  if (!shop.planCode) return true; // shops created before plans existed: treated as on trial
  return shop.planCode !== 'shop_basic' && inGoodStanding(shop.subscriptionStatus);
}

export function shopIsFeatured(shop: { planCode?: PlanCode | null; subscriptionStatus?: SubStatus | null }): boolean {
  return shop.planCode === 'shop_plus' && inGoodStanding(shop.subscriptionStatus);
}

/** How many menu items customers see. */
export function visibleMenuLimit(shop: { planCode?: PlanCode | null; subscriptionStatus?: SubStatus | null }): number | null {
  return shopTakesOrders(shop) ? null : BASIC_MENU_LIMIT;
}

/** Trial end for a new subscriber: the town's trial date if set and in the future, else 60 days from now. */
export function trialEndFor(townTrialEndsAt: number | null, now: number): number {
  return townTrialEndsAt && townTrialEndsAt > now ? townTrialEndsAt : now + TRIAL_DAYS * DAY_MS;
}
