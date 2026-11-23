'use client';

import { hasRole } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Spinner } from '@/components/ui';
import { fetchAllTowns, fetchTown, type Town } from '@/lib/data/places';

const KEY = 'hatod.coordTown';
interface Scope {
  towns: Town[];
  town: Town | null;
  setTownId: (id: string) => void;
  isAdmin: boolean;
}
const Ctx = createContext<Scope | null>(null);

/** Which town the coordinator area is looking at: their own towns, or any town for admins. */
export function TownScopeProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('coord');
  const { claims } = useAuth();
  const isAdmin = hasRole(claims.roles, 'admin');
  const [towns, setTowns] = useState<Town[] | null>(null);
  const [townId, setTownIdState] = useState<string | null>(null);
  const key = isAdmin ? '*' : (claims.coordTowns ?? []).join();

  useEffect(() => {
    (async () => {
      const list = isAdmin
        ? await fetchAllTowns()
        : (await Promise.all((claims.coordTowns ?? []).map((id) => fetchTown(id).catch(() => null)))).filter((x): x is Town => !!x);
      setTowns(list);
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      setTownIdState(list.find((x) => x.id === stored)?.id ?? list[0]?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!towns) return <Spinner label={t('loading')} />;
  if (towns.length === 0) return <p className="card">{t('noTowns')}</p>;
  const setTownId = (id: string) => {
    setTownIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ towns, town: towns.find((x) => x.id === townId) ?? null, setTownId, isAdmin }}>{children}</Ctx.Provider>;
}

export function useTownScope(): Scope {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTownScope outside provider');
  return ctx;
}

export function TownSelect() {
  const t = useTranslations('coord');
  const { towns, town, setTownId } = useTownScope();
  if (towns.length < 2) return town ? <p className="text-muted">{town.name}</p> : null;
  return (
    <label className="flex items-center gap-2">
      <span className="text-sm text-muted">{t('town')}</span>
      <select className="input w-auto" value={town?.id ?? ''} onChange={(e) => setTownId(e.target.value)}>
        {towns.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
}
