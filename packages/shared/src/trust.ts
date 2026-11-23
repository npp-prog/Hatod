import { z } from 'zod';

/** Who or what a rating or report is about. */
export const TARGET_TYPES = ['shop', 'rider', 'customer'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

/** Quick tags people can tap instead of typing. Good ones first. */
export const RATING_TAGS: Record<TargetType, readonly string[]> = {
  shop: ['tasty', 'well_packed', 'good_value', 'fast', 'cold_food', 'wrong_item', 'small_serving', 'slow'],
  rider: ['friendly', 'fast', 'careful', 'easy_to_reach', 'late', 'rude', 'unsafe_driving'],
  customer: ['easy_to_find', 'polite', 'paid_promptly', 'hard_to_find', 'not_answering', 'rude'],
};

/** Ratings can be given for 7 days after the order is completed. */
export const RATING_WINDOW_MS = 7 * 24 * 3600_000;

export const submitRatingInput = z.object({
  orderId: z.string().min(1).max(200),
  toType: z.enum(TARGET_TYPES),
  stars: z.number().int().min(1, 'stars_required').max(5),
  tags: z.array(z.string().max(30)).max(8).default([]),
  comment: z.string().trim().max(300, 'comment_too_long').default(''),
});
export type SubmitRatingInput = z.input<typeof submitRatingInput>;

/** New average after one more rating. */
export function addToAverage(avg: number, count: number, stars: number): { avg: number; count: number } {
  const next = count + 1;
  return { avg: Math.round(((avg * count + stars) / next) * 100) / 100, count: next };
}

export const REPORT_CATEGORIES = ['no_show', 'wrong_order', 'rude', 'overcharge', 'late', 'safety', 'other'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Which categories make sense against whom. */
export const REPORT_CATEGORIES_FOR: Record<TargetType, readonly ReportCategory[]> = {
  shop: ['wrong_order', 'overcharge', 'rude', 'late', 'safety', 'other'],
  rider: ['no_show', 'late', 'rude', 'overcharge', 'safety', 'other'],
  customer: ['no_show', 'rude', 'safety', 'other'],
};

export const submitReportInput = z
  .object({
    orderId: z.string().min(1).max(200),
    targetType: z.enum(TARGET_TYPES),
    category: z.enum(REPORT_CATEGORIES),
    details: z.string().trim().min(10, 'details_too_short').max(1000, 'details_too_long'),
  })
  .refine((r) => REPORT_CATEGORIES_FOR[r.targetType].includes(r.category), { message: 'category_not_for_target', path: ['category'] });
export type SubmitReportInput = z.input<typeof submitReportInput>;

export const resolveReportInput = z.object({
  reportId: z.string().min(1).max(200),
  resolution: z.enum(['confirmed', 'dismissed']),
  note: z.string().trim().min(3, 'note_required').max(500),
});

/** A strike: a confirmed report, or a late cancellation by a customer. */
export interface Strike {
  source: 'report' | 'late_cancel';
  ref: string;
  /** milliseconds */
  at: number;
}

export const STRIKE_RULE = {
  /** This many strikes within the window… */
  count: 3,
  windowMs: 30 * 24 * 3600_000,
  /** …suspend for this long. */
  suspensionMs: 7 * 24 * 3600_000,
} as const;

/** Strikes in the last 30 days, and whether they now add up to a suspension. */
export function strikeOutcome(strikes: Strike[], now: number): { recent: number; suspend: boolean; until: number | null } {
  const recent = strikes.filter((s) => now - s.at < STRIKE_RULE.windowMs).length;
  const suspend = recent >= STRIKE_RULE.count;
  return { recent, suspend, until: suspend ? now + STRIKE_RULE.suspensionMs : null };
}

/** Old strikes are dropped when a new one is added, so the list stays small. */
export function pruneStrikes(strikes: Strike[], now: number): Strike[] {
  return strikes.filter((s) => now - s.at < STRIKE_RULE.windowMs * 2);
}
