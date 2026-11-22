'use client';

import { ADDRESS_LIMITS, type LatLng } from '@hatod/shared';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { Barangay, Town } from '@/lib/data/places';
import { FieldError } from './ui';

const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-line" aria-hidden />,
});

export interface LocationValue {
  barangayId: string;
  street: string;
  landmark: string;
  geo: LatLng | null;
  /** true once the person placed the pin themselves (then a barangay change does not move it). */
  pinMoved: boolean;
}

export const emptyLocation: LocationValue = { barangayId: '', street: '', landmark: '', geo: null, pinMoved: false };

/**
 * Barangay dropdown, landmark, optional street and a map pin. Used by customer
 * addresses and shop registration/profile. The pin starts at the barangay
 * center so a location is always set, even when the map cannot load.
 */
export function LocationFields({
  town,
  barangays,
  value,
  onChange,
  errors,
  landmarkHint,
}: {
  town: Town;
  barangays: Barangay[];
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  errors: Partial<Record<'barangayId' | 'landmark' | 'street' | 'geo', string | null>>;
  landmarkHint?: string;
}) {
  const t = useTranslations('addresses');
  const tm = useTranslations('map');
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);

  const barangay = useMemo(() => barangays.find((b) => b.id === value.barangayId) ?? null, [barangays, value.barangayId]);
  const center = value.geo ?? barangay?.centroid ?? town.center;

  const set = (patch: Partial<LocationValue>) => onChange({ ...value, ...patch });

  function pickBarangay(id: string) {
    const b = barangays.find((x) => x.id === id);
    set({ barangayId: id, ...(b && !value.pinMoved ? { geo: b.centroid } : {}) });
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
        set({ geo: { lat: pos.coords.latitude, lng: pos.coords.longitude }, pinMoved: true });
        setLocating(false);
      },
      () => {
        setLocationFailed(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <>
      <div className="card space-y-5">
        <div>
          <label htmlFor="barangay" className="label">
            {t('barangayLabel')}
          </label>
          <select
            id="barangay"
            className="input"
            value={value.barangayId}
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
          {errors.barangayId && <FieldError id="barangay-error">{errors.barangayId}</FieldError>}
        </div>

        <div>
          <label htmlFor="landmark" className="label">
            {t('landmarkLabel')}
          </label>
          <textarea
            id="landmark"
            className="input min-h-24 py-3"
            maxLength={ADDRESS_LIMITS.landmarkMax}
            value={value.landmark}
            onChange={(e) => set({ landmark: e.target.value })}
            aria-invalid={!!errors.landmark}
            aria-describedby="landmark-hint landmark-error"
          />
          <p id="landmark-hint" className="mt-1 text-muted">
            {landmarkHint ?? t('landmarkHint')}
          </p>
          {errors.landmark && <FieldError id="landmark-error">{errors.landmark}</FieldError>}
        </div>

        <div>
          <label htmlFor="street" className="label">
            {t('streetLabel')}
          </label>
          <input
            id="street"
            className="input"
            maxLength={ADDRESS_LIMITS.streetMax}
            value={value.street}
            onChange={(e) => set({ street: e.target.value })}
            aria-describedby="street-hint street-error"
          />
          <p id="street-hint" className="mt-1 text-muted">
            {t('streetHint')}
          </p>
          {errors.street && <FieldError id="street-error">{errors.street}</FieldError>}
        </div>
      </div>

      <section className="card space-y-3" aria-labelledby="pin-title">
        <h2 id="pin-title" className="label">
          {t('pinLabel')}
        </h2>
        <p className="text-muted">{t('pinHint')}</p>
        <MapPicker
          center={center}
          value={value.geo}
          onChange={(p) => set({ geo: p, pinMoved: true })}
          label={t('pinMapLabel')}
          attribution={tm('attribution')}
        />
        {value.geo && !value.pinMoved && <p className="text-muted">{t('pinFromBarangay')}</p>}
        <button type="button" className="btn-secondary w-full" onClick={useMyLocation} disabled={locating}>
          {locating ? t('locating') : t('useLocation')}
        </button>
        {locationFailed && <p role="alert">{t('locationFailed')}</p>}
        {errors.geo && <FieldError id="geo-error">{errors.geo}</FieldError>}
      </section>
    </>
  );
}
