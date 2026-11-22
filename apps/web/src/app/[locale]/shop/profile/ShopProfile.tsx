'use client';

import { formatPhMobile, isPinInTown, normalizePhMobile, SHOP_LIMITS, shopProfileInput } from '@hatod/shared';
import { doc, onSnapshot } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LocationFields, type LocationValue } from '@/components/LocationFields';
import { ShopBasicsFields, toInt, type ShopBasics } from '@/components/shop/ShopBasicsFields';
import { useShop } from '@/components/shop/ShopProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { fetchBarangays, fetchTown, type Barangay, type Town } from '@/lib/data/places';
import { deleteShopImage, updateShop, uploadPermit, uploadShopImage } from '@/lib/data/shops';
import { firebase } from '@/lib/firebase/client';

export function ShopProfile() {
  const t = useTranslations('shop');
  return (
    <div className="space-y-6">
      <PageTitle>{t('profile.title')}</PageTitle>
      <DetailsForm />
      <Photos />
      <QrCodes />
      <Permit />
    </div>
  );
}

type Errors = Partial<Record<'name' | 'contactPhone' | 'paymentMethods' | 'selfDeliveryFee' | 'barangayId' | 'landmark' | 'geo' | 'form', string>>;

function DetailsForm() {
  const t = useTranslations('shop');
  const tc = useTranslations('common');
  const { shop } = useShop();
  const [town, setTown] = useState<Town | null>(null);
  const [barangays, setBarangays] = useState<Barangay[] | null>(null);
  const [basics, setBasics] = useState<ShopBasics>({
    name: shop.name,
    category: shop.category,
    description: shop.description,
    contactPhone: formatPhMobile(shop.contactPhone),
    paymentMethods: shop.paymentMethods,
    hasOwnRider: shop.hasOwnRider,
    selfDeliveryFee: String(shop.selfDeliveryFee || ''),
    prepMinutes: String(shop.prepMinutes),
  });
  const [loc, setLoc] = useState<LocationValue>({
    barangayId: shop.barangayId,
    street: shop.street,
    landmark: shop.landmark,
    geo: shop.geo,
    pinMoved: true,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetchTown(shop.townId), fetchBarangays(shop.townId)]).then(([tw, b]) => {
      setTown(tw);
      setBarangays(b);
    });
  }, [shop.townId]);

  const msg = (code: string) => {
    const known = ['shop_name_required', 'shop_name_too_long', 'bad_phone', 'payment_required', 'barangay_required', 'landmark_required', 'pin_required', 'pin_outside_town'];
    return t(`register.errors.${(known.includes(code) ? code : 'generic') as 'generic'}`, { town: town?.name ?? '' });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!town || !barangays) return;
    setSaved(false);
    const data = {
      name: basics.name,
      category: basics.category,
      description: basics.description,
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
    const parsed = shopProfileInput.safeParse(data);
    const next: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const f = String(issue.path[0]) as keyof Errors;
        if (!next[f]) next[f] = f === 'geo' ? msg('pin_required') : msg(issue.message);
      }
    } else if (!isPinInTown(parsed.data.geo, town)) next.geo = msg('pin_outside_town');
    setErrors(next);
    if (Object.keys(next).length || !parsed.success) return;

    const barangay = barangays.find((b) => b.id === parsed.data.barangayId)!;
    setBusy(true);
    try {
      await updateShop(shop.id, {
        ...parsed.data,
        street: parsed.data.street ?? '',
        description: parsed.data.description ?? '',
        hasOwnRider: parsed.data.hasOwnRider ?? false,
        selfDeliveryFee: parsed.data.selfDeliveryFee ?? 0,
        prepMinutes: parsed.data.prepMinutes ?? 20,
        barangayName: barangay.name,
      });
      setSaved(true);
    } catch {
      setErrors({ form: msg('generic') });
    } finally {
      setBusy(false);
    }
  }

  if (!town || !barangays) return <Spinner label={tc('loading')} />;
  return (
    <form onSubmit={submit} className="space-y-6" noValidate aria-labelledby="details-title">
      <h2 id="details-title" className="text-lg font-bold">
        {t('profile.detailsTitle')}
      </h2>
      <ShopBasicsFields value={basics} onChange={setBasics} errors={errors} showDescription />
      <LocationFields
        town={town}
        barangays={barangays}
        value={loc}
        onChange={setLoc}
        errors={{ barangayId: errors.barangayId, landmark: errors.landmark, geo: errors.geo }}
        landmarkHint={t('register.landmarkHint')}
      />
      {errors.form && <FieldError id="details-error">{errors.form}</FieldError>}
      {saved && (
        <p role="status" className="font-semibold text-ok">
          {t('profile.saved')}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? tc('saving') : t('profile.save')}
      </button>
    </form>
  );
}

function useUploadError() {
  const t = useTranslations('shop.profile');
  return (e: unknown) => {
    const code = e instanceof Error ? e.message : '';
    return code === 'image_too_large' || code === 'file_too_large' ? t(`errors.${code}`) : t('uploadFailed');
  };
}

function Photos() {
  const t = useTranslations('shop.profile');
  const { shop } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadError = useUploadError();

  async function add(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadShopImage(shop.id, file, 'photo');
      await updateShop(shop.id, { photos: [...shop.photos, url].slice(0, SHOP_LIMITS.photosMax) });
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(url: string) {
    await updateShop(shop.id, { photos: shop.photos.filter((p) => p !== url) });
    void deleteShopImage(url);
  }

  return (
    <section className="card space-y-3" aria-labelledby="photos-title">
      <h2 id="photos-title" className="text-lg font-bold">
        {t('photosTitle')}
      </h2>
      <p className="text-muted">{t('photosHint')}</p>
      <ul className="grid grid-cols-3 gap-2">
        {shop.photos.map((url, i) => (
          <li key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="aspect-square w-full rounded-xl object-cover" />
            <button
              type="button"
              className="absolute right-1 top-1 grid size-10 place-items-center rounded-full bg-white/90 font-bold text-danger shadow"
              aria-label={t('removePhoto', { n: i + 1 })}
              onClick={() => remove(url)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {shop.photos.length < SHOP_LIMITS.photosMax && (
        <label className="btn-secondary cursor-pointer">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => add(e.target.files?.[0])} disabled={busy} />
          {busy ? t('uploading') : t('addPhoto')}
        </label>
      )}
      {error && <FieldError id="photos-error">{error}</FieldError>}
    </section>
  );
}

function QrCodes() {
  const t = useTranslations('shop');
  const { shop } = useShop();
  const methods = (['gcash', 'maya'] as const).filter((m) => shop.paymentMethods.includes(m));
  if (methods.length === 0) return null;
  return (
    <section className="card space-y-4" aria-labelledby="qr-title">
      <h2 id="qr-title" className="text-lg font-bold">
        {t('profile.qrTitle')}
      </h2>
      <p className="text-muted">{t('profile.qrHint')}</p>
      {methods.map((m) => (
        <QrRow key={m} method={m} />
      ))}
    </section>
  );
}

function QrRow({ method }: { method: 'gcash' | 'maya' }) {
  const t = useTranslations('shop');
  const { shop } = useShop();
  const field = method === 'gcash' ? 'gcashQrUrl' : 'mayaQrUrl';
  const url = shop[field];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadError = useUploadError();
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // QR codes must stay sharp enough to scan: larger size, higher byte budget.
      const next = await uploadShopImage(shop.id, file, `qr-${method}`, 900);
      await updateShop(shop.id, { [field]: next });
      if (url) void deleteShopImage(url);
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
      <span className="w-24 font-semibold">{t(`profile.${method}Qr`)}</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={t(`profile.${method}Qr`)} className="size-24 rounded-lg border border-line object-contain" />
      ) : (
        <span className="text-muted">{t('profile.noQr')}</span>
      )}
      <span className="ml-auto flex gap-2">
        <label className="btn-secondary cursor-pointer">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          {busy ? t('profile.uploading') : url ? t('profile.replaceQr') : t('profile.uploadQr', { method: t(`payments.${method}`) })}
        </label>
        {url && (
          <button
            type="button"
            className="btn-ghost text-danger"
            onClick={async () => {
              await updateShop(shop.id, { [field]: null });
              void deleteShopImage(url);
            }}
          >
            {t('profile.removeQr')}
          </button>
        )}
      </span>
      {error && <FieldError id={`qr-${method}-error`}>{error}</FieldError>}
    </div>
  );
}

function Permit() {
  const t = useTranslations('shop.profile');
  const { shop } = useShop();
  const [path, setPath] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadError = useUploadError();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(firebase().db, 'shops', shop.id, 'private', 'info'),
        (s) => setPath((s.get('permitPath') as string | null) ?? null),
        () => setPath(null),
      ),
    [shop.id],
  );

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadPermit(shop, file);
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="card space-y-3" aria-labelledby="permit-title">
      <h2 id="permit-title" className="text-lg font-bold">
        {t('permitTitle')}
      </h2>
      <p className="text-muted">{t('permitHint')}</p>
      <p className={path ? 'font-semibold text-ok' : 'text-muted'}>{path ? t('permitUploaded') : t('permitMissing')}</p>
      <label className="btn-secondary cursor-pointer">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => upload(e.target.files?.[0])}
          disabled={busy || path === undefined}
        />
        {busy ? t('uploading') : path ? t('replacePermit') : t('uploadPermit')}
      </label>
      {error && <FieldError id="permit-error">{error}</FieldError>}
    </section>
  );
}
