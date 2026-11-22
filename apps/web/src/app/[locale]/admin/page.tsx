import { useTranslations } from 'next-intl';
import { AreaHome } from '@/components/AreaHome';
import { Link } from '@/i18n/navigation';

export default function Page() {
  const t = useTranslations('admin');
  return (
    <AreaHome area="admin">
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/towns" className="btn-secondary">
          {t('towns.title')}
        </Link>
        <Link href="/admin/roles" className="btn-secondary">
          {t('roles.title')}
        </Link>
      </div>
    </AreaHome>
  );
}
