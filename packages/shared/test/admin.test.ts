import { describe, expect, it } from 'vitest';
import { computeMetrics, setAccountStatusInput, verifyListingInput, type MetricOrder } from '../src';

const now = Date.parse('2026-11-23T12:00:00+08:00');
const DAY = 24 * 3600_000;
const o = (daysAgo: number, status: MetricOrder['status'], customerId = 'c1', extra: Partial<MetricOrder> = {}): MetricOrder => ({
  status,
  customerId,
  shopId: 's1',
  riderId: 'r1',
  createdAt: now - daysAgo * DAY,
  assignMs: 4 * 60_000,
  ...extra,
});

describe('computeMetrics', () => {
  const orders = [
    o(0, 'COMPLETED', 'c1'),
    o(1, 'COMPLETED', 'c1', { assignMs: 2 * 60_000 }),
    o(1, 'CANCELLED', 'c2', { assignMs: null }),
    o(2, 'COMPLETED', 'c3', { shopId: 's2', riderId: 'r2', assignMs: 10 * 60_000 }),
    o(3, 'PICKED_UP', 'c4'),
    o(9, 'COMPLETED', 'c5', { shopId: 's3', riderId: 'r3' }),
    o(20, 'COMPLETED', 'c6'),
  ];
  const m = computeMetrics(orders, now, 14);
  it('counts orders per Manila day, oldest first', () => {
    expect(m.days).toHaveLength(14);
    expect(m.days.at(-1)).toEqual({ date: '2026-11-23', placed: 1, completed: 1 });
    expect(m.days.at(-2)).toEqual({ date: '2026-11-22', placed: 2, completed: 1 });
  });
  it('works out completion rate from finished orders only', () => {
    expect(m.placed).toBe(6);
    expect(m.completed).toBe(4);
    expect(m.cancelled).toBe(1);
    expect(m.completionRate).toBeCloseTo(4 / 5);
  });
  it('median time to a rider', () => {
    expect(m.medianAssignMinutes).toBe(4);
  });
  it('active shops and riders are those with a completed order in the last 7 days', () => {
    expect(m.activeShops).toBe(2);
    expect(m.activeRiders).toBe(2);
  });
  it('repeat rate: customers with two or more completed orders', () => {
    expect(m.customers).toBe(3);
    expect(m.repeatRate).toBeCloseTo(1 / 3);
  });
  it('handles no orders', () => {
    expect(computeMetrics([], now, 7)).toMatchObject({ placed: 0, completionRate: null, medianAssignMinutes: null, repeatRate: null });
  });
});

describe('admin inputs', () => {
  it('a rejection needs a note, an approval does not', () => {
    expect(verifyListingInput.safeParse({ kind: 'shop', id: 's', decision: 'approve' }).success).toBe(true);
    expect(verifyListingInput.safeParse({ kind: 'shop', id: 's', decision: 'reject' }).error?.issues[0]?.message).toBe('note_required');
  });
  it('account actions always need a note', () => {
    expect(setAccountStatusInput.safeParse({ type: 'rider', id: 'r', action: 'ban', note: '' }).success).toBe(false);
  });
});
