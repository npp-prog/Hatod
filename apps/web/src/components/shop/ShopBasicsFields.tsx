'use client';

import { PAYMENT_METHODS, SHOP_CATEGORIES, SHOP_LIMITS, type PaymentMethod, type ShopCategory } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { FieldError } from '@/components/ui';

export interface ShopBasics {
  name: string;
  category: ShopCategory;
  description: string;
  contactPhone: string;
  paymentMethods: PaymentMethod[];
  hasOwnRider: boolean;
  selfDeliveryFee: string;
  prepMinutes: string;
}

/** Name, category, contact, payment methods, own rider and prep time: shared by register and profile. */
export function ShopBasicsFields({
  value,
  onChange,
  errors,
  showDescription = false,
}: {
  value: ShopBasics;
  onChange: (v: ShopBasics) => void;
  errors: Partial<Record<'name' | 'contactPhone' | 'paymentMethods' | 'selfDeliveryFee', string | null>>;
  showDescription?: boolean;
}) {
  const t = useTranslations('shop');
  const set = (patch: Partial<ShopBasics>) => onChange({ ...value, ...patch });

  return (
    <div className="card space-y-5">
      <div>
        <label htmlFor="shopName" className="label">
          {t('register.nameLabel')}
        </label>
        <input
          id="shopName"
          className="input"
          maxLength={SHOP_LIMITS.nameMax}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          aria-invalid={!!errors.name}
          aria-describedby="shopName-error"
        />
        {errors.name && <FieldError id="shopName-error">{errors.name}</FieldError>}
      </div>

      <fieldset>
        <legend className="label">{t('register.categoryLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {SHOP_CATEGORIES.map((c) => (
            <label key={c} className={`chip cursor-pointer ${value.category === c ? 'chip-active' : ''}`}>
              <input type="radio" name="category" className="sr-only" checked={value.category === c} onChange={() => set({ category: c })} />
              {t(`categories.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {showDescription && (
        <div>
          <label htmlFor="description" className="label">
            {t('profile.descriptionLabel')}
          </label>
          <textarea
            id="description"
            className="input min-h-20 py-3"
            maxLength={SHOP_LIMITS.descriptionMax}
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
      )}

      <div>
        <label htmlFor="contact" className="label">
          {t('register.contactLabel')}
        </label>
        <input
          id="contact"
          className="input"
          type="tel"
          inputMode="tel"
          value={value.contactPhone}
          onChange={(e) => set({ contactPhone: e.target.value })}
          aria-invalid={!!errors.contactPhone}
          aria-describedby="contact-hint contact-error"
        />
        <p id="contact-hint" className="mt-1 text-muted">
          {t('register.contactHint')}
        </p>
        {errors.contactPhone && <FieldError id="contact-error">{errors.contactPhone}</FieldError>}
      </div>

      <fieldset aria-describedby="pay-hint pay-error">
        <legend className="label">{t('register.paymentLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => {
            const on = value.paymentMethods.includes(m);
            return (
              <label key={m} className={`chip cursor-pointer ${on ? 'chip-active' : ''}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() =>
                    set({
                      paymentMethods: PAYMENT_METHODS.filter((x) => (x === m ? !on : value.paymentMethods.includes(x))),
                    })
                  }
                />
                {t(`payments.${m}`)}
              </label>
            );
          })}
        </div>
        <p id="pay-hint" className="mt-2 text-muted">
          {t('register.paymentHint')}
        </p>
        {errors.paymentMethods && <FieldError id="pay-error">{errors.paymentMethods}</FieldError>}
      </fieldset>

      <div>
        <label htmlFor="prep" className="label">
          {t('register.prepLabel')}
        </label>
        <input
          id="prep"
          className="input w-32"
          type="number"
          inputMode="numeric"
          min={0}
          max={SHOP_LIMITS.prepMinutesMax}
          value={value.prepMinutes}
          onChange={(e) => set({ prepMinutes: e.target.value })}
        />
      </div>

      <div className="space-y-3">
        <label className="flex min-h-12 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-6 shrink-0 accent-brand"
            checked={value.hasOwnRider}
            onChange={(e) => set({ hasOwnRider: e.target.checked })}
          />
          <span>
            <span className="block font-semibold">{t('register.ownRiderLabel')}</span>
            <span className="block text-muted">{t('register.ownRiderHint')}</span>
          </span>
        </label>
        {value.hasOwnRider && (
          <div>
            <label htmlFor="selfFee" className="label">
              {t('register.selfFeeLabel')}
            </label>
            <input
              id="selfFee"
              className="input w-32"
              type="number"
              inputMode="numeric"
              min={0}
              max={SHOP_LIMITS.selfDeliveryFeeMax}
              value={value.selfDeliveryFee}
              onChange={(e) => set({ selfDeliveryFee: e.target.value })}
              aria-invalid={!!errors.selfDeliveryFee}
            />
            {errors.selfDeliveryFee && <FieldError id="selfFee-error">{errors.selfDeliveryFee}</FieldError>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Integer from a numeric text field; NaN when empty or not a whole number. */
export function toInt(s: string): number {
  return /^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN;
}
