import type { ReactNode } from 'react';
import { RoleGate } from '@/components/RoleGate';
import { RiderNav } from '@/components/rider/RiderNav';
import { RiderProvider } from '@/components/rider/RiderProvider';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RoleGate area="rider">
      <RiderProvider>
        <RiderNav />
        {children}
      </RiderProvider>
    </RoleGate>
  );
}
