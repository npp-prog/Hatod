'use client';

import {
  ADDRESS_LABEL_PRESETS,
  ADDRESS_LIMITS,
  addressInput,
  isPinInTown,
  MAX_ADDRESSES_PER_USER,
  type LatLng,
} from '@hatod/shared';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTown } from '@/components/TownProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { saveAddress } from '@/lib/data/addresses';
import { fetchBarangays, fetchTown, type Barangay, type Town } from '@/lib/data/places';
import { useAddresses } from '@/lib/data/useAddresses';

const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-line" aria-hidden />,
});

type FieldKey = 'label' | 'barangayId' | 'street' | 'landmark' | 'geo';
type ErrorCode =
  | 'label_required'
  | 'label_too_long'
  | 'barangay_required'
  | 'street_too_long'
  | 'landmark_required'
  | 'landmark_too_long'
  | 'pin_outside_town'
  | 'pin_required'
  | 'generic';

export function AddressForm({ id }: { id?: string }) {
  const t = useTranslations('addresses');
  const tc = useTranslations('common');
  const tm = useTranslations('map');
  const router = useRouter();
  const { user } = useAuth();
  const { town: currentTown, loading: townLoading } = useTown();
  const { addresses } = useAddresses();

  const editing = id ? addresses?.find((a) => a.id === id) : undefined;
  const [town, setTown] = useState<Town | null>(null);
  const [barangays, setBarangays] = useState<Barangay[] | null>(null);

  const [preset, setPreset] = useState<(typeof ADDRESS_LABEL_PRESETS)[number]>('home');
  const [customLabel, setCustomLabel] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [geo, setGeo] = useState<LatLng | null>(null);
  const [pinMoved, setPinMoved] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey | 'form', ErrorCode>>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [queued, setQueued] = useState(false);

  // Which town this address belongs to: the address's own town when editing, else the selected town.
  const townId = editing?.townId ?? currentTown?.id ?? null;
  useEffect(() => {
    if (!townId) return;
    let cancelled = false;
    Promise.all([fetchTown(townId), fetchBarangays(townId)]).then(([tw, bs]) => {
      if (cancelled) return;
      setTown(tw);
      setBarangays(bs);
    });
    return () => {
      cancelled = true;
    };
  }, [townId]);

  // Fill the form once when editing.
  useEffect(() => {
    if (!editing || loaded) return;
    const p = ADDRESS_LABEL_PRESETS.find((x) => x !== 'other' && t(`labelPresets.${x}`) === editing.label);
    if (p) setPreset(p);
    else {
      setPreset('other');
      setCustomLabel(editing.label);
    }
    setBarangayId(editing.barangayId);
    setStreet(editing.street);
    setLandmark(editing.landmark);
    setGeo(editing.geo);
    setPinMoved(true);
    setIsDefault(editing.isDefault);
    setLoaded(true);
  }, [editing, loaded, t]);

  // Clear a field's error as soon as the person changes that field.
  const clear = (k: FieldKey) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  useEffect(() => clear('label'), [preset, customLabel]);
  useEffect(() => clear('barangayId'), [barangayId]);
  useEffect(() => clear('landmark'), [landmark]);
  useEffect(() => clear('street'), [street]);
  useEffect(() => clear('geo'), [geo]);

  const barangay = useMemo(() => barangays?.find((b) => b.id === barangayId) ?? null, [barangays, barangayId]);
  const mapCenter = geo ?? barangay?.centroid ?? town?.center ?? null;

  function pickBarangay(idValue: string) {
    setBarangayId(idValue);
    const b = barangays?.find((x) => x.id === idValue);
    if (b && !pinMoved) setGeo(b.centroid);
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocationFailed(true);
      return;
    }
    setLocating(true);
    setLocationFailed(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPinMoved(true);
        setLocating(false);
      },
      () => {
        setLocationFailed(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || !town || !addresses) return;
    const label = preset === 'other' ? customLabel : t(`labelPresets.${preset}`);
    const parsed = addressInput.safeParse({ label, barangayId, street, landmark, geo: geo ?? { lat: NaN, lng: NaN }, isDefault });
    const next: typeof errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldKey;
        if (!next[field]) next[field] = (field === 'geo' ? (geo ? 'pin_outside_town' : 'pin_required') : issue.message) as ErrorCode;
      }
    } else if (!isPinInTown(parsed.data.geo, town)) {
      next.geo = 'pin_outside_town';
    }
    setErrors(next);
    if (Object.keys(next).length || !parsed.success || !barangay) return;

    setBusy(true);
    try {
      const result = await saveAddress({
        userId: user.uid,
        townId: town.id,
        barangayName: barangay.name,
        input: { ...parsed.data, street: parsed.data.street ?? '', isDefault: parsed.data.isDefault ?? false },
        existing: addresses,
        id,
      });
      // Offline: the write is queued on the phone. Stay here (the next page may
      // not load without signal) and say so.
      if (result === 'queued') {
        setQueued(true);
        setBusy(false);
      } else router.push('/addresses');
    } catch {
      setErrors({ form: 'generic' });
      setBusy(false);
    }
  }

  const errorText = (code?: ErrorCode) => (code ? t(`errors.${code}`, { town: town?.name ?? '' }) : null);

  if (queued) {
    return (
      <div className="card space-y-4" role="status">
        <p className="font-semibold text-ok">{t('queued')}</p>
        <Link href="/addresses" className="btn-primary">
          {t('title')}
        </Link>
      </div>
    );
  }
  if (townLoading || (id && !addresses)) return <Spinner label={tc('loading')} />;
  if (!townId) {
    return (
      <div className="card space-y-3">
        <p>{t('needTown')}</p>
        <Link href="/town" className="btn-primary">
          {tc('continue')}
        </Link>
      </div>
    );
  }
  if (!id && addresses && addresses.length >= MAX_ADDRESSES_PER_USER) {
    return <p className="card">{t('limitReached', { max: MAX_ADDRESSES_PER_USER })}</p>;
  }
  if (!town || !barangays) return <Spinner label={tc('loading')} />;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <PageTitle>{id ? t('edit') : t('newTitle')}</PageTitle>

      <fieldset className="card space-y-3">
        <legend className="label float-left">{t('labelLabel')}</legend>
        <div className="clear-both flex flex-wrap gap-2">
          {ADDRESS_LABEL_PRESETS.map((p) => (
            <label key={p} className={`chip cursor-pointer ${preset === p ? 'chip-active' : ''}`}>
              <input
                type="radio"
                name="label"
                className="sr-only"
                checked={preset === p}
                onChange={() => setPreset(p)}
              />
              {t(`labelPresets.${p}`)}
            </label>
          ))}
        </div>
        {preset === 'other' && (
          <div>
            <label htmlFor="customLabel" className="label">
              {t('customLabel')}
            </label>
            <input
              id="customLabel"
              className="input"
              maxLength={ADDRESS_LIMITS.labelMax}
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              aria-invalid={!!errors.label}
              aria-describedby="label-error"
            />
          </div>
        )}
        {errors.label && <FieldError id="label-error">{errorText(errors.label)}</FieldError>}
      </fieldset>

      <div className="card space-y-5">
        <div>
          <label htmlFor="barangay" className="label">
            {t('barangayLabel')}
          </label>
          <select
            id="barangay"
            className="input"
            value={barangayId}
            onChange={(e) => pickBarangay(e.target.value)}
            aria-invalid={!!errors.barangayId}
            aria-describedby="barangay-error"
          >
            <option value="">{t('barangayPlaceholder')}</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {errors.barangayId && <FieldError id="barangay-error">{errorText(errors.barangayId)}</FieldError>}
        </div>

        <div>
          <label htmlFor="landmark" className="label">
            {t('landmarkLabel')}
          </label>
          <textarea
            id="landmark"
            className="input min-h-24 py-3"
            maxLength={ADDRESS_LIMITS.landmarkMax}
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
            aria-invalid={!!errors.landmark}
            aria-describedby="landmark-hint landmark-error"
          />
          <p id="landmark-hint" className="mt-1 text-muted">
            {t('landmarkHint')}
          </p>
          {errors.landmark && <FieldError id="landmark-error">{errorText(errors.landmark)}</FieldError>}
        </div>

        <div>
          <label htmlFor="street" className="label">
            {t('streetLabel')}
          </label>
          <input
            id="street"
            className="input"
            maxLength={ADDRESS_LIMITS.streetMax}
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            aria-describedby="street-hint"
          />
          <p id="street-hint" className="mt-1 text-muted">
            {t('streetHint')}
          </p>
        </div>
      </div>

      <section className="card space-y-3" aria-labelledby="pin-title">
        <h2 id="pin-title" className="label">
          {t('pinLabel')}
        </h2>
        <p className="text-muted">{t('pinHint')}</p>
        {mapCenter ? (
          <MapPicker
            center={mapCenter}
            value={geo}
            onChange={(p) => {
              setGeo(p);
              setPinMoved(true);
            }}
            label={t('pinMapLabel')}
            attribution={tm('attribution')}
          />
        ) : null}
        {geo && !pinMoved && <p className="text-muted">{t('pinFromBarangay')}</p>}
        <button type="button" className="btn-secondary w-full" onClick={useMyLocation} disabled={locating}>
          {locating ? t('locating') : t('useLocation')}
        </button>
        {locationFailed && <p role="alert">{t('locationFailed')}</p>}
        {errors.geo && <FieldError id="geo-error">{errorText(errors.geo)}</FieldError>}
      </section>

      <label className="card flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          className="size-6 accent-brand"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        <span>{t('setDefault')}</span>
      </label>

      {errors.form && <FieldError id="form-error">{errorText(errors.form)}</FieldError>}

      <div className="flex gap-3">
        <Link href="/addresses" className="btn-ghost">
          {tc('cancel')}
        </Link>
        <button type="submit" className="btn-primary flex-1" disabled={busy}>
          {busy ? tc('saving') : tc('save')}
        </button>
      </div>
    </form>
  );
}
