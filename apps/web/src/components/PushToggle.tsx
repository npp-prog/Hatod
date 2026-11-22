'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { enablePush, pushState, type PushState } from '@/lib/push';

/** "Turn on notifications" for this phone. Hidden where push is not available. */
export function PushToggle() {
  const t = useTranslations('push');
  const { user } = useAuth();
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  useEffect(() => setState(pushState()), []);
  if (!user || state === 'unsupported') return null;
  if (state === 'granted') return <p className="text-sm text-muted">{t('enabled')}</p>;
  if (state === 'denied') return <p className="text-sm text-muted">{t('denied')}</p>;
  return (
    <button
      type="button"
      className="btn-secondary w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setState(await enablePush(user.uid).catch(() => 'default' as const));
        setBusy(false);
      }}
    >
      {t('enable')}
    </button>
  );
}
