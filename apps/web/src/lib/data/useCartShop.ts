'use client';

import { checkCart, type CartIssue } from '@hatod/shared';
import { useEffect, useMemo, useState } from 'react';
import { useCart } from '@/components/CartProvider';
import { fetchMenu, fetchShop } from './browse';
import type { MenuItem, Shop } from './shops';

/** The cart's shop and its current menu, plus any lines that no longer match the menu. */
export function useCartShop(): { shop: Shop | null | undefined; menu: MenuItem[] | null; issues: CartIssue[] } {
  const { cart } = useCart();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  useEffect(() => {
    if (!cart.shopId) return setShop(null);
    let cancelled = false;
    Promise.all([fetchShop(cart.shopId), fetchMenu(cart.shopId).catch(() => [])]).then(([s, m]) => {
      if (cancelled) return;
      setShop(s && s.verified && s.status === 'active' ? s : null);
      setMenu(m);
    });
    return () => {
      cancelled = true;
    };
  }, [cart.shopId]);
  const issues = useMemo(() => (menu ? checkCart(cart.lines, menu) : []), [menu, cart.lines]);
  return { shop, menu, issues };
}
