'use client';

import { formatPHP } from '@hatod/shared';
import { doc, getDoc } from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { mockCompleteCheckout } from '@/lib/data/subscriptions';
import { firebase } from '@/lib/firebase/client';
import { callableMessage } from '@/lib/firebase/errors';

/** Development stand-in for PayMongo's checkout page. */
function MockPay() {
  const t = useTranslations('pay');
  const router = useRouter();
  const id = useSearchParams().get('checkout') ?? '';
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getDoc(doc(firebase().db, 'checkouts', id)).then((s) => setAmount(Number(s.get('amount') ?? 0)));
  }, [id]);
  if (amount === null) return <Spinner label="" />;
  return (
    <div className="card mx-auto max-w-md space-y-4">
      <PageTitle>{t('mockTitle')}</PageTitle>
      <p className="text-muted">{t('mockIntro')}</p>
      <p className="text-4xl font-extrabold">{formatPHP(amount)}</p>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await mockCompleteCheckout({ checkoutId: id });
            router.replace(`/pay/done?checkout=${encodeURIComponent(id)}`);
          } catch (e) {
            setError(callableMessage(e) ?? 'error');
            setBusy(false);
          }
        }}
      >
        {t('mockPay', { amount: formatPHP(amount) })}
      </button>
      {error && <FieldError id="mock-error">{error}</FieldError>}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MockPay />
    </Suspense>
  );
}
