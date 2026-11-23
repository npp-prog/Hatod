'use client';

import { formatPhMobile, isPinInTown, normalizePhMobile, registerShopInput } from '@hatod/shared';
import { httpsCallable } from 'firebase/functions';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { emptyLocation, LocationFields, type LocationValue } from '@/components/LocationFields';
import { ShopBasicsFields, toInt, type ShopBasics } from '@/components/shop/ShopBasicsFields';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { fetchBarangays, type Barangay } from '@/lib/data/places';
import { firebase } from '@/lib/firebase/client';
import { useSignupTown } from '@/lib/data/useSignupTown';
import { callableMessage, firstIssueCode } from '@/lib/firebase/errors';

type Errors = Partial<Record<'name' | 'contactPhone' | 'paymentMethods' | 'selfDeliveryFee' | 'barangayId' | 'landmark' | 'geo' | 'form', string>>;

const FIELD_FOR: Record<string, keyof Errors> = {
  name: 'name',
  contactPhone: 'contactPhone',
  paymentMethods: 'paymentMethods',
  selfDeliveryFee: 'selfDeliveryFee',
  barangayId: 'barangayId',
  landmark: 'landmark',
  geo: 'geo',
};

export function RegisterShopForm() {
  const t = useTranslations('shop.register');
  const tc = useTranslations('common');
  const router = useRouter();
  const { user, claims, refreshClaims } = useAuth();
  const { town, loading: townLoading } = useSignupTown();
  const [barangays, setBarangays] = useState<Barangay[] | null>(null);
  const [basics, setBasics] = useState<ShopBasics>({
    name: '',
    category: 'meals',
    description: '',
    contactPhone: user?.phoneNumber ? formatPhMobile(user.phoneNumber) : '',
    paymentMethods: ['cash'],
    hasOwnRider: false,
    selfDeliveryFee: '',
    prepMinutes: '20',
  });
  const [loc, setLoc] = useState<LocationValue>(emptyLocation);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (town) fetchBarangays(town.id).then(setBarangays);
  }, [town]);

  const msg = (code: string) => {
    const known = ['shop_name_required', 'shop_name_too_long', 'bad_phone', 'payment_required', 'barangay_required', 'landmark_required', 'pin_required', 'pin_outside_town', 'shop_exists'];
    return t(`errors.${(known.includes(code) ? code : 'generic') as 'generic'}`, { town: town?.name ?? '' });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!town) return;
    const payload = {
      townId: town.id,
      name: basics.name,
      category: basics.category,
      contactPhone: normalizePhMobile(basics.contactPhone) ?? basics.contactPhone,
      barangayId: loc.barangayId,
      street: loc.street,
      landmark: loc.landmark,
      geo: loc.geo ?? { lat: NaN, lng: NaN },
      paymentMethods: basics.paymentMethods,
      hasOwnRider: basics.hasOwnRider,
      selfDeliveryFee: basics.hasOwnRider ? toInt(basics.selfDeliveryFee || '0') : 0,
      prepMinutes: toInt(basics.prepMinutes || '0'),
    };
    const next: Errors = {};
    const parsed = registerShopInput.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = FIELD_FOR[String(issue.path[0])];
        if (field && !next[field]) next[field] = field === 'geo' ? msg(loc.geo ? 'pin_outside_town' : 'pin_required') : msg(issue.message);
      }
      if (Object.keys(next).length === 0) next.form = msg('generic');
    } else if (!isPinInTown(parsed.data.geo, town)) next.geo = msg('pin_outside_town');
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await httpsCallable(firebase().functions, 'registerShop')(payload);
      await refreshClaims();
      router.push('/shop');
    } catch (err) {
      const code = firstIssueCode(err) ?? callableMessage(err) ?? 'generic';
      setErrors({ form: msg(code) });
      setBusy(false);
    }
  }

  if (claims.roles.includes('shop')) {
    return (
      <div className="card space-y-3">
        <p>{t('alreadyHave')}</p>
        <Link href="/shop" className="btn-primary">
          {t('goToShop')}
        </Link>
      </div>
    );
  }
  if (townLoading) return <Spinner label={tc('loading')} />;
  if (!town) {
    return (
      <div className="card space-y-3">
        <p>{t('needTown')}</p>
        <Link href="/town" className="btn-primary">
          {tc('continue')}
        </Link>
      </div>
    );
  }
  if (!barangays) return <Spinner label={tc('loading')} />;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      <ShopBasicsFields value={basics} onChange={setBasics} errors={errors} />
      <LocationFields
        town={town}
        barangays={barangays}
        value={loc}
        onChange={setLoc}
        errors={{ barangayId: errors.barangayId, landmark: errors.landmark, geo: errors.geo }}
        landmarkHint={t('landmarkHint')}
      />
      {errors.form && <FieldError id="form-error">{errors.form}</FieldError>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
