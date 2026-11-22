'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Shows a "waiting for signal" bar while the phone is offline, and a short "back online" note after. */
export function OfflineBanner() {
  const t = useTranslations('offline');
  const [online, setOnline] = useState(true);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const up = () => {
      setOnline(true);
      setJustBack(true);
      timer = setTimeout(() => setJustBack(false), 3000);
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (online && !justBack) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 px-4 py-2 text-center font-semibold ${online ? 'bg-ok text-white' : 'bg-warn text-ink'}`}
    >
      {online ? t('back') : t('banner')}
    </div>
  );
}
