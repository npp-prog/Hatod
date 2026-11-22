'use client';

import { useLocale } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Town } from '@/lib/data/places';
import { useAuth } from './AuthProvider';

const STORAGE_KEY = 'hatod.townId';

// Loaded after first paint (see AuthProvider).
const loadData = () => import('@/lib/data/places');
const loadFirestore = () => Promise.all([import('@/lib/firebase/client'), import('firebase/firestore')]);

interface TownState {
  /** true until we know which town (if any) the person picked. */
  loading: boolean;
  town: Town | null;
  chooseTown: (townId: string) => Promise<void>;
}

const TownContext = createContext<TownState | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode: the profile still remembers it for signed-in users */
  }
}

/**
 * The town the person is ordering in. Remembered on the device for everyone,
 * and on the profile (users.defaultTownId) for signed-in users so it follows
 * them to another phone.
 */
export function TownProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, needsProfile } = useAuth();
  const locale = useLocale();
  const [town, setTown] = useState<Town | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      let id = readStored();
      if (!id && user && !needsProfile) {
        const [{ firebase }, { doc, getDoc }] = await loadFirestore();
        const snap = await getDoc(doc(firebase().db, 'users', user.uid)).catch(() => null);
        id = (snap?.get('defaultTownId') as string | null) ?? null;
      }
      const { fetchTown } = await loadData();
      const t = id ? await fetchTown(id).catch(() => null) : null;
      if (cancelled) return;
      // A town that was taken off-line (or never existed) is forgotten.
      setTown(t && t.isLive ? t : null);
      if (t?.isLive) writeStored(t.id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, needsProfile]);

  const chooseTown = useCallback(
    async (townId: string) => {
      const { fetchTown } = await loadData();
      const t = await fetchTown(townId);
      if (!t) return;
      setTown(t);
      writeStored(t.id);
      if (user && !needsProfile) {
        const [{ firebase }, { doc, serverTimestamp, updateDoc }] = await loadFirestore();
        updateDoc(doc(firebase().db, 'users', user.uid), {
          defaultTownId: t.id,
          locale,
          updatedAt: serverTimestamp(),
        }).catch(() => {
          /* best effort; the device remembers it anyway */
        });
      }
    },
    [user, needsProfile, locale],
  );

  const value = useMemo(() => ({ loading: loading || authLoading, town, chooseTown }), [loading, authLoading, town, chooseTown]);
  return <TownContext.Provider value={value}>{children}</TownContext.Provider>;
}

export function useTown(): TownState {
  const ctx = useContext(TownContext);
  if (!ctx) throw new Error('useTown must be used inside <TownProvider>');
  return ctx;
}
