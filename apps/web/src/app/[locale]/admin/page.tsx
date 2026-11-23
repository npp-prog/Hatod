import { useTranslations } from 'next-intl';
import { AreaHome } from '@/components/AreaHome';
import { Link } from '@/i18n/navigation';

export default function Page() {
  const t = useTranslations('admin');
  const tc = useTranslations('areas.coordinator');
  const tco = useTranslations('coord');
  return (
    <AreaHome area="admin">
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/dashboard" className="btn-primary">
          {t('dashboardLink')}
        </Link>
        <Link href="/coordinator/verify" className="btn-secondary">
          {tco('nav.verify')}
        </Link>
        <Link href="/admin/towns" className="btn-secondary">
          {t('towns.title')}
        </Link>
        <Link href="/admin/roles" className="btn-secondary">
          {t('roles.title')}
        </Link>
        <Link href="/coordinator/reports" className="btn-secondary">
          {tc('reportsLink')}
        </Link>
      </div>
    </AreaHome>
  );
}
