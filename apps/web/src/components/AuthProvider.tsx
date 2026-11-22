'use client';

import { claimsFromToken, type HatodClaims } from '@hatod/shared';
import { onIdTokenChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { firebase } from '@/lib/firebase/client';

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
    const { auth } = firebase();
    return onIdTokenChanged(auth, async (u) => {
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
  }, []);

  // Roles change on the server (setUserRoles). The function stamps
  // claimsUpdatedAt on the user doc; when it is newer than our token, refresh.
  useEffect(() => {
    if (!user) return;
    const { db } = firebase();
    return onSnapshot(
      doc(db, 'users', user.uid),
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
  }, [user, issuedAt]);

  const refreshClaims = useCallback(async () => {
    if (user) await user.getIdToken(true);
  }, [user]);

  const signOut = useCallback(async () => {
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
