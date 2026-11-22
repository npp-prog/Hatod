import { describe, expect, it } from 'vitest';
import { canTransition, cancelNeedsReason, placeOrderInput, shopRespondInput, timelineIndex, ORDER_STATUSES, FINAL_STATUSES } from '../src';

describe('order state machine', () => {
  it('lets the shop accept or decline a new order, and only the shop', () => {
    expect(canTransition('PLACED', 'SHOP_ACCEPTED', 'shop')).toBe(true);
    expect(canTransition('PLACED', 'SHOP_DECLINED', 'shop')).toBe(true);
    expect(canTransition('PLACED', 'SHOP_ACCEPTED', 'customer')).toBe(false);
    expect(canTransition('PLACED', 'SHOP_ACCEPTED', 'rider')).toBe(false);
  });
  it('expires only by the system', () => {
    expect(canTransition('PLACED', 'EXPIRED', 'system')).toBe(true);
    expect(canTransition('PLACED', 'EXPIRED', 'shop')).toBe(false);
  });
  it('only the offered rider path assigns a rider; the shop assigns itself for self delivery', () => {
    expect(canTransition('RIDER_OFFERED', 'RIDER_ASSIGNED', 'rider')).toBe(true);
    expect(canTransition('SHOP_ACCEPTED', 'RIDER_ASSIGNED', 'shop')).toBe(true);
    expect(canTransition('SHOP_ACCEPTED', 'RIDER_ASSIGNED', 'rider')).toBe(false);
  });
  it('a declined or expired offer goes back to waiting for a rider', () => {
    expect(canTransition('RIDER_OFFERED', 'SHOP_ACCEPTED', 'rider')).toBe(true);
    expect(canTransition('RIDER_OFFERED', 'SHOP_ACCEPTED', 'system')).toBe(true);
    expect(canTransition('SHOP_ACCEPTED', 'RIDER_OFFERED', 'customer')).toBe(true);
  });
  it('moves forward one step at a time', () => {
    expect(canTransition('RIDER_ASSIGNED', 'DELIVERED', 'rider')).toBe(false);
    expect(canTransition('RIDER_ASSIGNED', 'PICKED_UP', 'rider')).toBe(true);
    expect(canTransition('PICKED_UP', 'DELIVERED', 'rider')).toBe(true);
    expect(canTransition('DELIVERED', 'COMPLETED', 'customer')).toBe(true);
    expect(canTransition('DELIVERED', 'COMPLETED', 'rider')).toBe(false);
  });
  it('cancels: customer anytime before pickup, shop after accepting, admin until completion', () => {
    expect(canTransition('PLACED', 'CANCELLED', 'customer')).toBe(true);
    expect(canTransition('PLACED', 'CANCELLED', 'shop')).toBe(false); // the shop declines instead
    expect(canTransition('RIDER_ASSIGNED', 'CANCELLED', 'shop')).toBe(true);
    expect(canTransition('PICKED_UP', 'CANCELLED', 'customer')).toBe(false);
    expect(canTransition('PICKED_UP', 'CANCELLED', 'admin')).toBe(true);
    expect(canTransition('DELIVERED', 'CANCELLED', 'admin')).toBe(true);
  });
  it('final states go nowhere', () => {
    for (const from of FINAL_STATUSES) for (const to of ORDER_STATUSES) for (const by of ['customer', 'shop', 'rider', 'admin', 'system'] as const) {
      expect(canTransition(from, to, by)).toBe(false);
    }
  });
  it('a free cancel only before the shop accepts', () => {
    expect(cancelNeedsReason('PLACED', 'customer')).toBe(false);
    expect(cancelNeedsReason('SHOP_ACCEPTED', 'customer')).toBe(true);
    expect(cancelNeedsReason('PLACED', 'admin')).toBe(true);
  });
  it('maps statuses to the customer timeline', () => {
    expect(timelineIndex('PLACED')).toBe(0);
    expect(timelineIndex('RIDER_OFFERED')).toBe(1);
    expect(timelineIndex('COMPLETED')).toBe(5);
    expect(timelineIndex('CANCELLED')).toBe(-1);
  });
});

describe('order inputs', () => {
  const ok = { requestId: 'req_12345678', shopId: 's', lines: [{ itemId: 'i', variant: null, addOns: [], qty: 1 }], addressId: 'a', paymentMethod: 'cash', riderId: 'r' };
  it('accepts a normal order and needs a safe request id', () => {
    expect(placeOrderInput.safeParse(ok).success).toBe(true);
    expect(placeOrderInput.safeParse({ ...ok, requestId: 'short' }).success).toBe(false);
    expect(placeOrderInput.safeParse({ ...ok, requestId: 'has/slash_123' }).success).toBe(false);
  });
  it('refuses empty orders and silly quantities', () => {
    expect(placeOrderInput.safeParse({ ...ok, lines: [] }).success).toBe(false);
    expect(placeOrderInput.safeParse({ ...ok, lines: [{ ...ok.lines[0], qty: 0 }] }).success).toBe(false);
  });
  it('accept needs a listed ready time; decline needs a reason', () => {
    expect(shopRespondInput.safeParse({ orderId: 'o', accept: true, readyInMinutes: 20 }).success).toBe(true);
    expect(shopRespondInput.safeParse({ orderId: 'o', accept: true, readyInMinutes: 7 }).success).toBe(false);
    expect(shopRespondInput.safeParse({ orderId: 'o', accept: false, reason: 'sold_out' }).success).toBe(true);
    expect(shopRespondInput.safeParse({ orderId: 'o', accept: false }).success).toBe(false);
  });
});
