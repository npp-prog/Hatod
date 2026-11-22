import type { ReactNode } from 'react';
import { RoleGate } from '@/components/RoleGate';

/** Saved addresses need a signed-in account (browsing does not). */
export default function Layout({ children }: { children: ReactNode }) {
  return <RoleGate area="customer">{children}</RoleGate>;
}
