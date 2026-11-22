'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { touchRider, watchRider, watchRiderPrivate, type Rider, type RiderPrivate } from '@/lib/data/riders';

interface RiderState {
  rider: Rider;
  priv: RiderPrivate | null;
}
const RiderContext = createContext<RiderState | null>(null);

/** Loads the signed-in rider's record and private info (live) for the rider area. */
export function RiderProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [rider, setRider] = useState<Rider | null | undefined>(undefined);
  const [priv, setPriv] = useState<RiderPrivate | null>(null);

  useEffect(() => {
    if (!user) return;
    const a = watchRider(user.uid, setRider, () => setRider(null));
    const b = watchRiderPrivate(user.uid, setPriv);
    return () => {
      a();
      b();
    };
  }, [user]);

  // While the app is open and the rider is online, count that as activity
  // (riders go offline by themselves after 2 hours without any).
  const online = !!rider?.online;
  const uid = rider?.id;
  useEffect(() => {
    if (!online || !uid) return;
    touchRider(uid);
    const id = setInterval(() => touchRider(uid), 10 * 60_000);
    return () => clearInterval(id);
  }, [online, uid]);

  if (rider === undefined) return <Spinner label={t('common.loading')} />;
  if (rider === null) {
    return (
      <div className="card space-y-3">
        <p>{t('rider.noRider')}</p>
        <Link href="/register/rider" className="btn-primary">
          {t('rider.register.cta')}
        </Link>
      </div>
    );
  }
  return <RiderContext.Provider value={{ rider, priv }}>{children}</RiderContext.Provider>;
}

export function useRider(): RiderState {
  const ctx = useContext(RiderContext);
  if (!ctx) throw new Error('useRider must be used inside <RiderProvider>');
  return ctx;
}
