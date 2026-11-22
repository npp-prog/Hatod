import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <div className="card text-center">
      <Link href="/" className="btn-primary">
        {t('goHome')}
      </Link>
    </div>
  );
}
