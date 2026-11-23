import type { ReactNode } from 'react';
import { CoordNav } from '@/components/coordinator/CoordNav';
import { TownScopeProvider } from '@/components/coordinator/TownScope';
import { RoleGate } from '@/components/RoleGate';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RoleGate area="coordinator">
      <TownScopeProvider>
        <CoordNav />
        {children}
      </TownScopeProvider>
    </RoleGate>
  );
}
