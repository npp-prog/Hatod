import { useTranslations } from 'next-intl';
import { AreaHome } from '@/components/AreaHome';
import { Link } from '@/i18n/navigation';

export default function Page() {
  const t = useTranslations('admin.roles');
  return (
    <AreaHome area="admin">
      <Link href="/admin/roles" className="btn-secondary">
        {t('title')}
      </Link>
    </AreaHome>
  );
}
