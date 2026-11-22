'use client';

import type { EmergencyContact } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { FieldError } from '@/components/ui';

export function EmergencyContactFields({
  value,
  onChange,
  errors,
}: {
  value: EmergencyContact;
  onChange: (v: EmergencyContact) => void;
  errors: Partial<Record<'name' | 'phone' | 'relation', string>>;
}) {
  const t = useTranslations('rider.register');
  const set = (p: Partial<EmergencyContact>) => onChange({ ...value, ...p });
  return (
    <fieldset className="card space-y-4">
      <legend className="float-left text-lg font-bold">{t('ecTitle')}</legend>
      <p className="clear-both text-muted">{t('ecHint')}</p>
      <div>
        <label htmlFor="ecName" className="label">
          {t('ecName')}
        </label>
        <input id="ecName" className="input" autoComplete="off" value={value.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!errors.name} />
        {errors.name && <FieldError id="ecName-error">{errors.name}</FieldError>}
      </div>
      <div>
        <label htmlFor="ecPhone" className="label">
          {t('ecPhone')}
        </label>
        <input
          id="ecPhone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={value.phone}
          onChange={(e) => set({ phone: e.target.value })}
          aria-invalid={!!errors.phone}
        />
        {errors.phone && <FieldError id="ecPhone-error">{errors.phone}</FieldError>}
      </div>
      <div>
        <label htmlFor="ecRelation" className="label">
          {t('ecRelation')}
        </label>
        <input
          id="ecRelation"
          className="input"
          value={value.relation}
          onChange={(e) => set({ relation: e.target.value })}
          aria-describedby="ecRelation-hint"
          aria-invalid={!!errors.relation}
        />
        <p id="ecRelation-hint" className="mt-1 text-muted">
          {t('ecRelationHint')}
        </p>
        {errors.relation && <FieldError id="ecRelation-error">{errors.relation}</FieldError>}
      </div>
    </fieldset>
  );
}
