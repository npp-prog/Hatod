'use client';

import { RIDER_LIMITS } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRider } from '@/components/rider/RiderProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { fetchBarangays, type Barangay } from '@/lib/data/places';
import { saveServiceArea } from '@/lib/data/riders';

export function AreaEditor() {
  const t = useTranslations('rider.area');
  const tc = useTranslations('common');
  const { rider } = useRider();
  const [barangays, setBarangays] = useState<Barangay[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rider.servedBarangayIds));
  const [maxKm, setMaxKm] = useState(rider.maxKm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchBarangays(rider.townId).then(setBarangays);
  }, [rider.townId]);

  const change = (next: Set<string>) => {
    setSelected(next);
    setSaved(false);
    setError(null);
  };

  async function save() {
    if (selected.size === 0) return setError(t('errors.area_required'));
    setBusy(true);
    try {
      await saveServiceArea([...selected], maxKm);
      setSaved(true);
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  if (!barangays) return <Spinner label={tc('loading')} />;
  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>

      <fieldset className="card space-y-3">
        <legend className="float-left font-semibold">{t('selected', { count: selected.size, total: barangays.length })}</legend>
        <div className="clear-both flex gap-2">
          <button type="button" className="btn-ghost px-3" onClick={() => change(new Set(barangays.map((b) => b.id)))}>
            {t('all')}
          </button>
          <button type="button" className="btn-ghost px-3" onClick={() => change(new Set())}>
            {t('none')}
          </button>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {barangays.map((b) => (
            <li key={b.id}>
              <label className="flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-6 accent-brand"
                  checked={selected.has(b.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(b.id);
                    else next.delete(b.id);
                    change(next);
                  }}
                />
                <span>{b.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <section className="card">
        <label htmlFor="maxKm" className="label">
          {t('maxKmLabel')}
        </label>
        <div className="flex items-center gap-4">
          <input
            id="maxKm"
            type="range"
            min={1}
            max={RIDER_LIMITS.maxKmMax}
            step={0.5}
            value={maxKm}
            onChange={(e) => {
              setMaxKm(Number(e.target.value));
              setSaved(false);
            }}
            className="h-12 flex-1 accent-brand"
            aria-describedby="maxKm-hint"
          />
          <output htmlFor="maxKm" className="w-16 text-right text-xl font-bold">
            {maxKm}
          </output>
        </div>
        <p id="maxKm-hint" className="mt-1 text-muted">
          {t('maxKmHint')}
        </p>
      </section>

      {error && <FieldError id="area-error">{error}</FieldError>}
      {saved && (
        <p role="status" className="font-semibold text-ok">
          {t('saved')}
        </p>
      )}
      <button type="button" className="btn-primary sticky bottom-4 w-full shadow-lg" disabled={busy} onClick={save}>
        {busy ? tc('saving') : t('save')}
      </button>
    </div>
  );
}
