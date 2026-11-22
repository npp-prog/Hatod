'use client';

import { ADDRESS_LABEL_PRESETS, ADDRESS_LIMITS, addressInput, isPinInTown, MAX_ADDRESSES_PER_USER } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { emptyLocation, LocationFields, type LocationValue } from '@/components/LocationFields';
import { useTown } from '@/components/TownProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { saveAddress } from '@/lib/data/addresses';
import { fetchBarangays, fetchTown, type Barangay, type Town } from '@/lib/data/places';
import { useAddresses } from '@/lib/data/useAddresses';

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
  const router = useRouter();
  const { user } = useAuth();
  const { town: currentTown, loading: townLoading } = useTown();
  const { addresses } = useAddresses();

  const editing = id ? addresses?.find((a) => a.id === id) : undefined;
  const [town, setTown] = useState<Town | null>(null);
  const [barangays, setBarangays] = useState<Barangay[] | null>(null);

  const [preset, setPreset] = useState<(typeof ADDRESS_LABEL_PRESETS)[number]>('home');
  const [customLabel, setCustomLabel] = useState('');
  const [loc, setLoc] = useState<LocationValue>(emptyLocation);
  const { barangayId, street, landmark, geo } = loc;
  const [isDefault, setIsDefault] = useState(false);
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
    setLoc({ barangayId: editing.barangayId, street: editing.street, landmark: editing.landmark, geo: editing.geo, pinMoved: true });
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

      <LocationFields
        town={town}
        barangays={barangays}
        value={loc}
        onChange={setLoc}
        errors={{
          barangayId: errorText(errors.barangayId),
          landmark: errorText(errors.landmark),
          street: errorText(errors.street),
          geo: errorText(errors.geo),
        }}
      />

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
