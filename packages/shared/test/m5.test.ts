import { describe, expect, it } from 'vitest';
import {
  addToCart,
  checkCart,
  coarseLatLng,
  DEFAULT_RATE_CARD,
  EMPTY_CART,
  estimateRoadKm,
  itemCount,
  itemsTotal,
  lineKey,
  menuSummary,
  newCustomerCapExceeded,
  riderOptions,
  setLineQty,
  shopMatches,
  sortShopsForHome,
  type RiderForQuote,
} from '../src';

const shop = { id: 's1', name: "Susan's", townId: 't1' };
const line = (over = {}) => ({ itemId: 'tapsi', name: 'Tapsilog', variant: 'Large', addOns: ['Egg'], qty: 1, note: '', unitPrice: 112, ...over });

describe('cart', () => {
  it('merges identical picks and keeps different ones apart', () => {
    let c = addToCart(EMPTY_CART, shop, line());
    c = addToCart(c, shop, line({ qty: 2 }));
    c = addToCart(c, shop, line({ variant: 'Regular', unitPrice: 92 }));
    expect(c.lines).toHaveLength(2);
    expect(c.lines[0]!.qty).toBe(3);
    expect(itemCount(c.lines)).toBe(4);
    expect(itemsTotal(c.lines)).toBe(3 * 112 + 92);
  });
  it('add-on order and note case do not create new lines', () => {
    expect(lineKey('a', null, ['x', 'y'], 'No onions')).toBe(lineKey('a', null, ['y', 'x'], ' no onions'));
  });
  it('allows one shop per order', () => {
    const c = addToCart(EMPTY_CART, shop, line());
    expect(() => addToCart(c, { id: 's2', name: 'Other', townId: 't1' }, line())).toThrow('other_shop');
  });
  it('removing the last line empties the cart', () => {
    const c = addToCart(EMPTY_CART, shop, line());
    expect(setLineQty(c, c.lines[0]!.key, 0)).toEqual(EMPTY_CART);
    expect(setLineQty(c, c.lines[0]!.key, 4).lines[0]!.qty).toBe(4);
  });
  it('spots items that changed since they were added', () => {
    const c = addToCart(addToCart(addToCart(addToCart(EMPTY_CART, shop, line()), shop, line({ itemId: 'gone' })), shop, line({ itemId: 'out' })), shop, line({ itemId: 'dear' }));
    const sizes = [{ name: 'Regular', price: 80 }, { name: 'Large', price: 100 }];
    const menu = [
      { id: 'tapsi', available: true, price: 80, variants: sizes, addOns: [{ name: 'Egg', price: 12 }] },
      { id: 'out', available: false, price: 80, variants: sizes, addOns: [{ name: 'Egg', price: 12 }] },
      { id: 'dear', available: true, price: 90, variants: [{ name: 'Regular', price: 90 }, { name: 'Large', price: 110 }], addOns: [{ name: 'Egg', price: 12 }] },
    ];
    const problems = Object.fromEntries(checkCart(c.lines, menu).map((i) => [c.lines.find((l) => l.key === i.key)!.itemId, i]));
    expect(problems.tapsi).toBeUndefined();
    expect(problems.gone!.problem).toBe('removed');
    expect(problems.out!.problem).toBe('sold_out');
    expect(problems.dear).toMatchObject({ problem: 'price_changed', newPrice: 122 });
  });
  it('caps a new customer\'s first 3 orders at ₱1,000', () => {
    expect(newCustomerCapExceeded(0, 1000)).toBe(false);
    expect(newCustomerCapExceeded(0, 1001)).toBe(true);
    expect(newCustomerCapExceeded(2, 1500)).toBe(true);
    expect(newCustomerCapExceeded(3, 5000)).toBe(false);
  });
});

describe('trip helpers', () => {
  it('estimates road distance as straight line × 1.3', () => {
    const a = { lat: 11.1, lng: 122.64 };
    const b = { lat: 11.11, lng: 122.64 };
    expect(estimateRoadKm(a, b)).toBeCloseTo(1.112 * 1.3, 1);
  });
  it('coarsens rider location to about 1 km', () => {
    expect(coarseLatLng({ lat: 11.10567, lng: 122.64321 })).toEqual({ lat: 11.11, lng: 122.64 });
  });
});

describe('riderOptions', () => {
  const base: RiderForQuote = {
    id: 'r',
    verified: true,
    status: 'active',
    online: true,
    rainOn: false,
    servedBarangayIds: ['pob', 'mab'],
    maxKm: 8,
    rateCard: DEFAULT_RATE_CARD,
    ratingAvg: 4.5,
    ratingCount: 10,
    approxLocation: null,
  };
  const riders: RiderForQuote[] = [
    { ...base, id: 'cheap', rateCard: { ...DEFAULT_RATE_CARD, base: 20, perKm: 8 }, ratingAvg: 4.2, approxLocation: { lat: 11.2, lng: 122.64 } },
    { ...base, id: 'star', rateCard: { ...DEFAULT_RATE_CARD, base: 40 }, ratingAvg: 4.9, approxLocation: { lat: 11.11, lng: 122.64 } },
    { ...base, id: 'fixed', rateCard: { ...DEFAULT_RATE_CARD, base: 50, fixedFares: [{ fromBarangayId: 'pob', toBarangayId: 'mab', fee: 45 }] }, ratingAvg: 4.0 },
    { ...base, id: 'rainy', rainOn: true, rateCard: { ...DEFAULT_RATE_CARD, surcharges: { night: null, rain: 25, extraStop: 0 } } },
    { ...base, id: 'offline', online: false },
    { ...base, id: 'elsewhere', servedBarangayIds: ['pob'] },
    { ...base, id: 'short', maxKm: 2 },
    { ...base, id: 'lapsed' },
  ];
  const trip = { shopGeo: { lat: 11.1, lng: 122.64 }, shopBarangayId: 'pob', dropoffGeo: { lat: 11.12, lng: 122.65 }, dropoffBarangayId: 'mab', distanceKm: 3.2, estimate: true, at: new Date('2026-11-23T12:00:00+08:00') };
  const sub = (id: string) => (id === 'lapsed' ? 'lapsed' : 'trial');

  it('keeps only eligible riders and prices each with their own card', () => {
    const opts = riderOptions(riders, trip, sub, 'price');
    expect(opts.map((o) => [o.rider.id, o.quote.fee])).toEqual([
      ['fixed', 45],
      ['cheap', 48],
      ['star', 75],
      ['rainy', 90],
    ]);
    expect(opts.every((o) => o.quote.estimate)).toBe(true);
  });
  it('sorts by rating', () => {
    expect(riderOptions(riders, trip, sub, 'rating').map((o) => o.rider.id)).toEqual(['star', 'rainy', 'cheap', 'fixed']);
  });
  it('sorts by nearest, unknown locations last', () => {
    expect(riderOptions(riders, trip, sub, 'nearest').map((o) => o.rider.id)).toEqual(['star', 'cheap', 'fixed', 'rainy']);
  });
});

describe('browse', () => {
  const items = [
    { name: 'Pork Adobo with rice', category: 'Ulam', price: 85, available: true, variants: [] },
    { name: 'Tapsilog', category: 'Silog', price: 0, available: true, variants: [{ price: 80 }, { price: 100 }] },
    { name: 'Ube roll', category: 'Cakes', price: 180, available: false, variants: [] },
  ];
  it('summarizes a menu for search', () => {
    const s = menuSummary(items);
    expect(s).toMatchObject({ itemCount: 3, availableCount: 2, minPrice: 80 });
    expect(s.searchTerms).toEqual(expect.arrayContaining(['adobo', 'tapsilog', 'silog', 'ube']));
  });
  it('matches shop names, dishes and word starts, ignoring accents', () => {
    const shopA = { name: 'Aling Susan\'s Carinderia', menuSummary: menuSummary(items) };
    expect(shopMatches(shopA, 'adobo')).toBe(true);
    expect(shopMatches(shopA, 'tapsi')).toBe(true);
    expect(shopMatches(shopA, 'susan adobo')).toBe(true);
    expect(shopMatches(shopA, 'lechon')).toBe(false);
    expect(shopMatches({ name: 'Sto. Niño Bakery' }, 'nino')).toBe(true);
    expect(shopMatches(shopA, '  ')).toBe(true);
    expect(shopMatches({ name: 'X' }, 'meals', ['Meals'])).toBe(true);
  });
  it('lists open shops first, then well-rated, then by name', () => {
    const always = { mon: [{ open: '00:00', close: '24:00' }] };
    const never = {};
    const now = new Date('2026-11-23T12:00:00+08:00');
    const shops = [
      { name: 'B closed', hours: never, closedOn: null, ratingAvg: 5, ratingCount: 50 },
      { name: 'C open', hours: always, closedOn: null, ratingAvg: 4, ratingCount: 10 },
      { name: 'A open new', hours: always, closedOn: null, ratingAvg: 5, ratingCount: 1 },
      { name: 'D open best', hours: always, closedOn: null, ratingAvg: 4.8, ratingCount: 20 },
    ];
    expect(sortShopsForHome(shops, now).map((s) => s.name)).toEqual(['D open best', 'C open', 'A open new', 'B closed']);
  });
});
