import { useTranslations } from 'next-intl';
import { PageTitle } from '@/components/ui';
import { TownForm } from '../TownForm';

export default function Page() {
  const t = useTranslations('admin.towns');
  return (
    <div className="space-y-6">
      <PageTitle>{t('add')}</PageTitle>
      <TownForm />
    </div>
  );
}
