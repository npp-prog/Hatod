'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useTown } from '@/components/TownProvider';
import { PageTitle, Spinner } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { fetchLiveTowns, type Town } from '@/lib/data/places';

export function TownPicker() {
  const t = useTranslations();
  const router = useRouter();
  const { town: current, chooseTown } = useTown();
  const [towns, setTowns] = useState<Town[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchLiveTowns()
      .then(setTowns)
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('town.chooseTitle')}</PageTitle>
        <p className="mt-2 text-muted">{t('town.chooseIntro')}</p>
      </div>
      {failed && <p role="alert">{t('auth.errors.network')}</p>}
      {!towns && !failed && <Spinner label={t('common.loading')} />}
      {towns?.length === 0 && <p className="card">{t('town.none')}</p>}
      {towns && towns.length > 0 && (
        <ul className="space-y-3">
          {towns.map((town) => (
            <li key={town.id}>
              <button
                type="button"
                className={`card flex min-h-16 w-full items-center gap-3 text-left ${current?.id === town.id ? 'border-2 border-brand' : ''}`}
                aria-pressed={current?.id === town.id}
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(town.id);
                  await chooseTown(town.id);
                  router.push('/');
                }}
              >
                <span className="mr-auto">
                  <span className="block text-lg font-bold">{town.name}</span>
                  <span className="block text-muted">{t('town.province', { province: town.province })}</span>
                </span>
                {current?.id === town.id && <span className="font-semibold text-brand">{t('town.selected')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
