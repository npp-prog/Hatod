'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchTownListings } from '@/lib/data/admin';
import type { Rider } from '@/lib/data/riders';
import type { Shop } from '@/lib/data/shops';
import { useTownScope } from './TownScope';

export function useListings() {
  const { town } = useTownScope();
  const [data, setData] = useState<{ shops: Shop[]; riders: Rider[] } | null>(null);
  const reload = useCallback(() => {
    if (town) fetchTownListings(town.id).then(setData).catch(() => setData({ shops: [], riders: [] }));
  }, [town]);
  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);
  return { data, reload };
}
