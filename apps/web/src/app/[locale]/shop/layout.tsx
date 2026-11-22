import type { ReactNode } from 'react';
import { RoleGate } from '@/components/RoleGate';

export default function Layout({ children }: { children: ReactNode }) {
  return <RoleGate area="shop">{children}</RoleGate>;
}
