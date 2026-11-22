import { itemUnitPrice, type AddOn, type Variant } from './menu';

export const CART_LIMITS = { linesMax: 30, qtyMax: 50, noteMax: 120 } as const;

/** One line in the cart: an item with its chosen size and add-ons. Prices are a snapshot, re-checked at checkout. */
export interface CartLine {
  /** Stable key of this combination (item + size + add-ons + note), so identical picks merge. */
  key: string;
  itemId: string;
  name: string;
  variant: string | null;
  addOns: string[];
  qty: number;
  note: string;
  unitPrice: number;
}

export interface Cart {
  shopId: string | null;
  shopName: string | null;
  townId: string | null;
  lines: CartLine[];
}

export const EMPTY_CART: Cart = { shopId: null, shopName: null, townId: null, lines: [] };

export function lineKey(itemId: string, variant: string | null, addOns: string[], note: string): string {
  return [itemId, variant ?? '', [...addOns].sort().join('+'), note.trim().toLowerCase()].join('|');
}

export function itemsTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** Adds a line, merging with an identical one. Returns a new cart. */
export function addToCart(cart: Cart, shop: { id: string; name: string; townId: string }, line: Omit<CartLine, 'key'>): Cart {
  if (cart.shopId && cart.shopId !== shop.id) throw new Error('other_shop');
  const key = lineKey(line.itemId, line.variant, line.addOns, line.note);
  const existing = cart.lines.find((l) => l.key === key);
  const lines = existing
    ? cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(CART_LIMITS.qtyMax, l.qty + line.qty), unitPrice: line.unitPrice } : l))
    : [...cart.lines, { ...line, key, note: line.note.trim().slice(0, CART_LIMITS.noteMax) }].slice(0, CART_LIMITS.linesMax);
  return { shopId: shop.id, shopName: shop.name, townId: shop.townId, lines };
}

export function setLineQty(cart: Cart, key: string, qty: number): Cart {
  const lines = qty <= 0 ? cart.lines.filter((l) => l.key !== key) : cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(CART_LIMITS.qtyMax, qty) } : l));
  return lines.length ? { ...cart, lines } : EMPTY_CART;
}

export type CartIssue = { key: string; problem: 'removed' | 'sold_out' | 'changed' | 'price_changed'; newPrice?: number };

/**
 * Compares cart lines with the shop's current menu. Items can be deleted,
 * sold out or edited between adding and checkout; the customer must see that.
 */
export function checkCart(
  lines: CartLine[],
  menu: { id: string; available: boolean; price: number; variants: Variant[]; addOns: AddOn[] }[],
): CartIssue[] {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const issues: CartIssue[] = [];
  for (const l of lines) {
    const item = byId.get(l.itemId);
    if (!item) issues.push({ key: l.key, problem: 'removed' });
    else if (!item.available) issues.push({ key: l.key, problem: 'sold_out' });
    else {
      const price = itemUnitPrice(item, l.variant, l.addOns);
      if (price === null) issues.push({ key: l.key, problem: 'changed' });
      else if (price !== l.unitPrice) issues.push({ key: l.key, problem: 'price_changed', newPrice: price });
    }
  }
  return issues;
}

/** New customers: the first 3 orders are capped at ₱1,000 of food, to limit losses to shops from fake orders. */
export const NEW_CUSTOMER_ORDERS = 3;
export const NEW_CUSTOMER_CAP = 1000;
export function newCustomerCapExceeded(completedOrders: number, total: number): boolean {
  return completedOrders < NEW_CUSTOMER_ORDERS && total > NEW_CUSTOMER_CAP;
}
