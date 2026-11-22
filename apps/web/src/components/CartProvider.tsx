'use client';

import { addToCart as add, EMPTY_CART, setLineQty, type Cart, type CartLine } from '@hatod/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const KEY = 'hatod.cart.v1';

interface CartState {
  cart: Cart;
  ready: boolean;
  /** Throws 'other_shop' if the cart holds another shop's items. */
  addLine: (shop: { id: string; name: string; townId: string }, line: Omit<CartLine, 'key'>) => void;
  /** Empties the cart and starts a new one with this line (switching shops). */
  replaceWith: (shop: { id: string; name: string; townId: string }, line: Omit<CartLine, 'key'>) => void;
  setQty: (key: string, qty: number) => void;
  updatePrice: (key: string, unitPrice: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);

/** The cart lives on the phone (localStorage) so it survives reloads and lost signal. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Cart;
        if (parsed && Array.isArray(parsed.lines)) setCart(parsed);
      }
    } catch {
      /* corrupt or blocked storage: start empty */
    }
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setCart(e.newValue ? (JSON.parse(e.newValue) as Cart) : EMPTY_CART);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((next: Cart) => {
    setCart(next);
    try {
      if (next.lines.length) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode: cart still works for this visit */
    }
  }, []);

  const value = useMemo<CartState>(
    () => ({
      cart,
      ready,
      addLine: (shop, line) => save(add(cart, shop, line)),
      replaceWith: (shop, line) => save(add(EMPTY_CART, shop, line)),
      setQty: (key, qty) => save(setLineQty(cart, key, qty)),
      updatePrice: (key, unitPrice) => save({ ...cart, lines: cart.lines.map((l) => (l.key === key ? { ...l, unitPrice } : l)) }),
      clear: () => save(EMPTY_CART),
    }),
    [cart, ready, save],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
