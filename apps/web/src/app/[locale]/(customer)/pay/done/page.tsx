'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { firebase } from '@/lib/firebase/client';

/** Where PayMongo (or the mock) sends people back. Payment is confirmed by the webhook, so we wait for it. */
function Done() {
  const t = useTranslations('pay');
  const { claims } = useAuth();
  const params = useSearchParams();
  const id = params.get('checkout') ?? '';
  const cancelled = params.get('cancelled') === '1';
  const [checkout, setCheckout] = useState<{ status: string; subscriptionId: string } | null>(null);
  useEffect(() => onSnapshot(doc(firebase().db, 'checkouts', id), (s) => setCheckout(s.exists() ? (s.data() as { status: string; subscriptionId: string }) : null)), [id]);
  const back = checkout?.subscriptionId.startsWith('rider_') || (!claims.roles.includes('shop') && claims.roles.includes('rider')) ? '/rider/subscription' : '/shop/subscription';
  return (
    <div className="card mx-auto max-w-md space-y-4 text-center">
      <PageTitle>{t('doneTitle')}</PageTitle>
      {cancelled ? (
        <p>{t('cancelled')}</p>
      ) : checkout?.status === 'paid' ? (
        <p className="text-lg font-semibold text-ok" role="status">
          {t('paid')}
        </p>
      ) : (
        <Spinner label={t('waiting', { provider: 'PayMongo' })} />
      )}
      <Link href={back} className="btn-primary">
        {t('back')}
      </Link>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Done />
    </Suspense>
  );
}
