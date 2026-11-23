'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { watchAddresses, type Address } from './places';

/** Live list of the signed-in user's addresses (works offline from cache). */
export function useAddresses(): { addresses: Address[] | null; error: boolean } {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!user) return;
    return watchAddresses(user.uid, setAddresses, () => setError(true));
  }, [user]);
  return { addresses, error };
}
