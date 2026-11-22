'use client';

import { claimsFromToken, type HatodClaims } from '@hatod/shared';
import type { User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// The Firebase SDK is large. It is loaded after the first paint so the home
// page shows immediately on slow phones and weak signal.
const loadClient = () => import('@/lib/firebase/client');
const loadAuth = () => import('firebase/auth');
const loadFirestore = () => import('firebase/firestore');

export interface AuthState {
  /** true until Firebase has told us whether someone is signed in. */
  loading: boolean;
  user: User | null;
  claims: HatodClaims;
  /** Signed in but has not finished the profile (name + consent) yet. */
  needsProfile: boolean;
  status: 'active' | 'suspended' | 'banned' | null;
  refreshClaims: () => Promise<void>;
  signOut: () => Promise<void>;
}

const EMPTY: HatodClaims = { roles: [], coordTowns: [] };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<HatodClaims>(EMPTY);
  const [issuedAt, setIssuedAt] = useState(0);
  const [status, setStatus] = useState<AuthState['status']>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([loadClient(), loadAuth()]).then(([{ firebase }, { onIdTokenChanged }]) => {
      if (cancelled) return;
      unsub = onIdTokenChanged(firebase().auth, async (u) => {
        setUser(u);
        if (!u) {
          setClaims(EMPTY);
          setStatus(null);
          setLoading(false);
          return;
        }
        const token = await u.getIdTokenResult();
        setClaims(claimsFromToken(token.claims));
        setIssuedAt(Date.parse(token.issuedAtTime));
        setLoading(false);
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  // Roles change on the server (setUserRoles). The function stamps
  // claimsUpdatedAt on the user doc; when it is newer than our token, refresh.
  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([loadClient(), loadFirestore()]).then(([{ firebase }, { doc, onSnapshot }]) => {
      if (cancelled) return;
      unsub = onSnapshot(
        doc(firebase().db, 'users', user.uid),
        (snap) => {
          if (!snap.exists()) return;
          setStatus((snap.get('status') as AuthState['status']) ?? 'active');
          const updated = snap.get('claimsUpdatedAt');
          if (typeof updated === 'number' && updated > issuedAt) void user.getIdToken(true);
        },
        () => {
          /* No profile yet or offline: claims from the token still apply. */
        },
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, issuedAt]);

  const refreshClaims = useCallback(async () => {
    if (user) await user.getIdToken(true);
  }, [user]);

  const signOut = useCallback(async () => {
    const [{ firebase }, { signOut: fbSignOut }] = await Promise.all([loadClient(), loadAuth()]);
    await fbSignOut(firebase().auth);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      claims,
      needsProfile: !!user && claims.roles.length === 0,
      status,
      refreshClaims,
      signOut,
    }),
    [loading, user, claims, status, refreshClaims, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
