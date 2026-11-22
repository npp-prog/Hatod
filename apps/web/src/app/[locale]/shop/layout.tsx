import type { ReactNode } from 'react';
import { RoleGate } from '@/components/RoleGate';
import { ShopNav } from '@/components/shop/ShopNav';
import { ShopProvider } from '@/components/shop/ShopProvider';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RoleGate area="shop">
      <ShopProvider>
        <ShopNav />
        {children}
      </ShopProvider>
    </RoleGate>
  );
}
