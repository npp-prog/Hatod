'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTown } from '@/components/TownProvider';
import { fetchTown, type Town } from './places';

/**
 * Town for shop and rider sign-up: a ?town=ID link from a coordinator (works
 * before the town goes live, when it accepts sign-ups), otherwise the town the
 * person picked.
 */
export function useSignupTown(): { town: Town | null; loading: boolean } {
  const param = useSearchParams().get('town');
  const picked = useTown();
  const [linked, setLinked] = useState<Town | null | undefined>(param ? undefined : null);
  useEffect(() => {
    if (!param) return;
    fetchTown(param)
      .then((t) => setLinked(t && (t.isLive || t.acceptingSignups) ? t : null))
      .catch(() => setLinked(null));
  }, [param]);
  if (param) return { town: linked ?? null, loading: linked === undefined };
  return { town: picked.town, loading: picked.loading };
}
