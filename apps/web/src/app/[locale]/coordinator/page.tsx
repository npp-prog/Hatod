import { useTranslations } from 'next-intl';
import { AreaHome } from '@/components/AreaHome';
import { Link } from '@/i18n/navigation';

export default function Page() {
  const t = useTranslations('areas.coordinator');
  return (
    <AreaHome area="coordinator">
      <Link href="/coordinator/reports" className="btn-secondary">
        {t('reportsLink')}
      </Link>
    </AreaHome>
  );
}
