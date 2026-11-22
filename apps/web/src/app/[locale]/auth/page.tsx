import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui';
import { AuthForm } from './AuthForm';

export default function AuthPage() {
  const t = useTranslations('common');
  return (
    <Suspense fallback={<Spinner label={t('loading')} />}>
      <AuthForm />
    </Suspense>
  );
}
