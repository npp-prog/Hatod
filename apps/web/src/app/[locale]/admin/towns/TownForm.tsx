'use client';

import { manilaDateString, TOWN_TIERS, upsertTownInput, type LatLng, type TownTier } from '@hatod/shared';
import { httpsCallable } from 'firebase/functions';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { FieldError } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import type { Town } from '@/lib/data/places';
import { firebase } from '@/lib/firebase/client';
import { callableMessage, firstIssueCode } from '@/lib/firebase/errors';

const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-line" aria-hidden />,
});

/** Roughly the middle of the Visayas: a sensible start for the whole country. */
const PH_START: LatLng = { lat: 11.0, lng: 123.0 };

const KNOWN = new Set(['town_exists', 'town_name_required', 'province_required', 'outside_philippines', 'bad_date']);

type TimestampLike = { toDate(): Date } | null;

export function TownForm({ town }: { town?: Town }) {
  const t = useTranslations('admin.towns');
  const tc = useTranslations('common');
  const tm = useTranslations('map');
  const router = useRouter();

  const [name, setName] = useState(town?.name ?? '');
  const [province, setProvince] = useState(town?.province ?? '');
  const [tier, setTier] = useState<TownTier>(town?.tier ?? 'C');
  const [isLive, setIsLive] = useState(town?.isLive ?? false);
  const trialDate = (town?.trialEndsAt as TimestampLike | undefined)?.toDate();
  const [trialEndsOn, setTrialEndsOn] = useState(trialDate ? manilaDateString(trialDate) : '');
  const [center, setCenter] = useState<LatLng | null>(town?.center ?? null);
  const [radiusKm, setRadiusKm] = useState(String(town?.radiusKm ?? 15));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const payload = {
      ...(town ? { townId: town.id } : {}),
      name,
      province,
      tier,
      isLive,
      trialEndsOn: trialEndsOn || null,
      center: center ?? { lat: NaN, lng: NaN },
      radiusKm: Number(radiusKm),
    };
    const parsed = upsertTownInput.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const code = issue?.path[0] === 'center' ? 'outside_philippines' : (issue?.message ?? 'generic');
      setMessage({ ok: false, text: t(`errors.${(KNOWN.has(code) ? code : 'generic') as 'generic'}`) });
      return;
    }
    setBusy(true);
    try {
      const res = await httpsCallable<unknown, { townId: string; created: boolean }>(
        firebase().functions,
        'adminUpsertTown',
      )(payload);
      if (res.data.created) router.push(`/admin/towns/${res.data.townId}`);
      else setMessage({ ok: true, text: t('updated') });
    } catch (err) {
      const code = firstIssueCode(err) ?? callableMessage(err) ?? 'generic';
      setMessage({ ok: false, text: t(`errors.${(KNOWN.has(code) ? code : 'generic') as 'generic'}`) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">
            {t('nameLabel')}
          </label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!!town} />
        </div>
        <div>
          <label htmlFor="province" className="label">
            {t('provinceLabel')}
          </label>
          <input
            id="province"
            className="input"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            disabled={!!town}
          />
        </div>
        <div>
          <label htmlFor="tier" className="label">
            {t('tierLabel')}
          </label>
          <select id="tier" className="input" value={tier} onChange={(e) => setTier(e.target.value as TownTier)}>
            {TOWN_TIERS.map((x) => (
              <option key={x} value={x}>
                {t('tier', { tier: x })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="trial" className="label">
            {t('trialLabel')}
          </label>
          <input
            id="trial"
            type="date"
            className="input"
            value={trialEndsOn}
            onChange={(e) => setTrialEndsOn(e.target.value)}
          />
        </div>
      </div>

      <div>
        <p className="label">{t('centerLabel')}</p>
        <p className="mb-2 text-muted">{t('centerHint')}</p>
        <MapPicker
          center={center ?? PH_START}
          value={center}
          onChange={setCenter}
          zoom={center ? 14 : 6}
          label={t('centerLabel')}
          attribution={tm('attribution')}
        />
      </div>

      <div>
        <label htmlFor="radius" className="label">
          {t('radiusLabel')}
        </label>
        <input
          id="radius"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          className="input w-32"
          value={radiusKm}
          onChange={(e) => setRadiusKm(e.target.value)}
          aria-describedby="radius-hint"
        />
        <p id="radius-hint" className="mt-1 text-muted">
          {t('radiusHint')}
        </p>
      </div>

      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-6 accent-brand" checked={isLive} onChange={(e) => setIsLive(e.target.checked)} />
        <span className="font-semibold">{t('isLiveLabel')}</span>
      </label>

      {message &&
        (message.ok ? (
          <p role="status" className="font-semibold text-ok">
            {message.text}
          </p>
        ) : (
          <FieldError id="town-error">{message.text}</FieldError>
        ))}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? tc('saving') : t('save')}
      </button>
    </form>
  );
}
