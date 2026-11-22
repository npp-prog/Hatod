import { describe, expect, it } from 'vitest';
import { estimatedPrepMinutes, itemUnitPrice, menuItemInput, registerShopInput, startingPrice } from '../src';

const silog = {
  price: 0,
  variants: [
    { name: 'Regular', price: 75 },
    { name: 'Large', price: 95 },
  ],
  addOns: [
    { name: 'Extra rice', price: 15 },
    { name: 'Egg', price: 12 },
  ],
};
const plain = { price: 20, variants: [], addOns: [{ name: 'Cheese', price: 10 }] };

describe('itemUnitPrice', () => {
  it('uses the variant price plus add-ons', () => {
    expect(itemUnitPrice(silog, 'Large', ['Extra rice', 'Egg'])).toBe(122);
  });
  it('uses the base price when there are no variants', () => {
    expect(itemUnitPrice(plain, null, ['Cheese'])).toBe(30);
  });
  it('refuses choices that are not on the item', () => {
    expect(itemUnitPrice(silog, null, [])).toBeNull();
    expect(itemUnitPrice(silog, 'Jumbo', [])).toBeNull();
    expect(itemUnitPrice(silog, 'Regular', ['Gravy'])).toBeNull();
    expect(itemUnitPrice(plain, 'Large', [])).toBeNull();
  });
});

describe('startingPrice', () => {
  it('is the cheapest variant or the base price', () => {
    expect(startingPrice(silog)).toBe(75);
    expect(startingPrice(plain)).toBe(20);
  });
});

describe('menuItemInput', () => {
  const ok = { name: 'Tapsilog', category: 'Silog', price: 0, variants: silog.variants, addOns: silog.addOns };
  it('accepts an item with sizes and add-ons', () => {
    expect(menuItemInput.parse(ok)).toMatchObject({ available: true, description: '', photoUrl: null });
  });
  it('wants whole, non-negative pesos', () => {
    expect(menuItemInput.safeParse({ ...ok, price: 12.5 }).error?.issues[0]?.message).toBe('whole_pesos');
    expect(menuItemInput.safeParse({ ...ok, price: -1 }).error?.issues[0]?.message).toBe('negative_price');
  });
  it('rejects duplicate option names and a lone size', () => {
    expect(
      menuItemInput.safeParse({ ...ok, addOns: [{ name: 'Egg', price: 1 }, { name: 'egg', price: 2 }] }).error?.issues[0]?.message,
    ).toBe('duplicate_option');
    expect(menuItemInput.safeParse({ ...ok, variants: [{ name: 'Regular', price: 75 }] }).error?.issues[0]?.message).toBe(
      'one_variant',
    );
  });
});

describe('registerShopInput', () => {
  const ok = {
    townId: 't1',
    name: "Aling Nena's Carinderia",
    category: 'meals',
    contactPhone: '+639171234567',
    barangayId: 'b1',
    landmark: 'Beside the public market',
    geo: { lat: 11.1, lng: 122.64 },
    paymentMethods: ['cash', 'gcash'],
  };
  it('fills sensible defaults', () => {
    expect(registerShopInput.parse(ok)).toMatchObject({ hasOwnRider: false, selfDeliveryFee: 0, prepMinutes: 20, description: '' });
  });
  it('needs at least one payment method and an E.164 phone', () => {
    expect(registerShopInput.safeParse({ ...ok, paymentMethods: [] }).success).toBe(false);
    expect(registerShopInput.safeParse({ ...ok, contactPhone: '0917 123 4567' }).success).toBe(false);
  });
});

describe('estimatedPrepMinutes', () => {
  it('adds the busy minutes', () => {
    expect(estimatedPrepMinutes({ prepMinutes: 20, busyMinutes: 15 })).toBe(35);
  });
});
