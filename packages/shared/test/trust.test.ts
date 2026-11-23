import { describe, expect, it } from 'vitest';
import { addToAverage, pruneStrikes, strikeOutcome, submitRatingInput, submitReportInput, STRIKE_RULE, type Strike } from '../src';

const DAY = 24 * 3600_000;
const now = Date.parse('2026-11-23T12:00:00+08:00');
const strike = (daysAgo: number): Strike => ({ source: 'report', ref: `r${daysAgo}`, at: now - daysAgo * DAY });

describe('strikes', () => {
  it('3 strikes within 30 days suspend for 7 days', () => {
    expect(strikeOutcome([strike(1), strike(10), strike(29)], now)).toEqual({ recent: 3, suspend: true, until: now + 7 * DAY });
  });
  it('older strikes do not count', () => {
    expect(strikeOutcome([strike(1), strike(10), strike(31)], now)).toMatchObject({ recent: 2, suspend: false, until: null });
  });
  it('two strikes are a warning, not a suspension', () => {
    expect(strikeOutcome([strike(0), strike(0)], now).suspend).toBe(false);
  });
  it('prunes strikes older than two windows', () => {
    expect(pruneStrikes([strike(1), strike(59), strike(61)], now).map((s) => s.ref)).toEqual(['r1', 'r59']);
    expect(STRIKE_RULE.count).toBe(3);
  });
});

describe('ratings', () => {
  it('averages to two decimals', () => {
    expect(addToAverage(0, 0, 5)).toEqual({ avg: 5, count: 1 });
    expect(addToAverage(4.5, 2, 3)).toEqual({ avg: 4, count: 3 });
    expect(addToAverage(4.8, 52, 1)).toEqual({ avg: 4.73, count: 53 });
  });
  it('needs 1 to 5 whole stars', () => {
    expect(submitRatingInput.safeParse({ orderId: 'o', toType: 'shop', stars: 0 }).success).toBe(false);
    expect(submitRatingInput.safeParse({ orderId: 'o', toType: 'shop', stars: 4.5 }).success).toBe(false);
    expect(submitRatingInput.parse({ orderId: 'o', toType: 'rider', stars: 5 })).toMatchObject({ tags: [], comment: '' });
  });
});

describe('reports', () => {
  const ok = { orderId: 'o', targetType: 'rider', category: 'no_show', details: 'Rider never came to the shop.' };
  it('accepts a report with enough detail', () => {
    expect(submitReportInput.safeParse(ok).success).toBe(true);
    expect(submitReportInput.safeParse({ ...ok, details: 'bad' }).error?.issues[0]?.message).toBe('details_too_short');
  });
  it('only allows categories that fit the target', () => {
    expect(submitReportInput.safeParse({ ...ok, targetType: 'customer', category: 'wrong_order' }).error?.issues[0]?.message).toBe(
      'category_not_for_target',
    );
  });
});
