import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui';
import { ProfileForm } from './ProfileForm';

export default function ProfilePage() {
  const t = useTranslations('common');
  return (
    <Suspense fallback={<Spinner label={t('loading')} />}>
      <ProfileForm />
    </Suspense>
  );
}
