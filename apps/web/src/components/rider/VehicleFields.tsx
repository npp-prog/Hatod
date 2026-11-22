'use client';

import { RIDER_LIMITS, VEHICLE_TYPES, type VehicleType } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { FieldError } from '@/components/ui';

export interface VehicleValue {
  vehicleType: VehicleType;
  vehicleDesc: string;
  plateNo: string;
}

export function VehicleFields({
  value,
  onChange,
  errors,
  disabled = false,
}: {
  value: VehicleValue;
  onChange: (v: VehicleValue) => void;
  errors: Partial<Record<'vehicleDesc' | 'plateNo', string>>;
  disabled?: boolean;
}) {
  const t = useTranslations('rider');
  const set = (p: Partial<VehicleValue>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-4">
      <fieldset disabled={disabled}>
        <legend className="label">{t('register.vehicleTypeLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {VEHICLE_TYPES.map((v) => (
            <label key={v} className={`chip cursor-pointer ${value.vehicleType === v ? 'chip-active' : ''}`}>
              <input type="radio" name="vehicleType" className="sr-only" checked={value.vehicleType === v} onChange={() => set({ vehicleType: v })} />
              {t(`vehicles.${v}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="vehicleDesc" className="label">
          {t('register.vehicleDescLabel')}
        </label>
        <input
          id="vehicleDesc"
          className="input"
          maxLength={RIDER_LIMITS.vehicleDescMax}
          value={value.vehicleDesc}
          onChange={(e) => set({ vehicleDesc: e.target.value })}
          disabled={disabled}
          aria-describedby="vehicleDesc-hint"
          aria-invalid={!!errors.vehicleDesc}
        />
        <p id="vehicleDesc-hint" className="mt-1 text-muted">
          {t('register.vehicleDescHint')}
        </p>
        {errors.vehicleDesc && <FieldError id="vehicleDesc-error">{errors.vehicleDesc}</FieldError>}
      </div>
      <div>
        <label htmlFor="plateNo" className="label">
          {value.vehicleType === 'bicycle' ? t('register.plateOptional') : t('register.plateLabel')}
        </label>
        <input
          id="plateNo"
          className="input uppercase"
          maxLength={16}
          autoCapitalize="characters"
          value={value.plateNo}
          onChange={(e) => set({ plateNo: e.target.value })}
          disabled={disabled}
          aria-describedby="plate-hint"
          aria-invalid={!!errors.plateNo}
        />
        <p id="plate-hint" className="mt-1 text-muted">
          {t('register.plateHint')}
        </p>
        {errors.plateNo && <FieldError id="plate-error">{errors.plateNo}</FieldError>}
      </div>
    </div>
  );
}
