'use client';

import {
  emergencyContactSchema,
  formatPhMobile,
  normalizePhMobile,
  normalizePlate,
  PLATE_RE,
  RIDER_DOCS,
  requiredRiderDocs,
  type EmergencyContact,
  type RiderDocKey,
} from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EmergencyContactFields } from '@/components/rider/EmergencyContactFields';
import { useRider } from '@/components/rider/RiderProvider';
import { VehicleFields, type VehicleValue } from '@/components/rider/VehicleFields';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { saveEmergencyContact, updateRider, uploadRiderDoc, uploadRiderPhoto } from '@/lib/data/riders';
import { deleteStorageFile } from '@/lib/data/storage';

function useUploadError() {
  const t = useTranslations('rider.profile');
  return (e: unknown) => {
    const code = e instanceof Error ? e.message : '';
    return code === 'image_too_large' || code === 'file_too_large' ? t(`errors.${code}`) : t('uploadFailed');
  };
}

export function RiderProfile() {
  const t = useTranslations('rider.profile');
  return (
    <div className="space-y-6">
      <PageTitle>{t('title')}</PageTitle>
      <Photo />
      <Documents />
      <Vehicle />
      <Emergency />
    </div>
  );
}

function Photo() {
  const t = useTranslations('rider.profile');
  const { rider } = useRider();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadError = useUploadError();

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadRiderPhoto(rider.id, file);
      const old = rider.photoUrl;
      await updateRider(rider.id, { photoUrl: url });
      if (old) void deleteStorageFile(old);
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="card flex flex-wrap items-center gap-4" aria-labelledby="photo-title">
      {rider.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rider.photoUrl} alt="" className="size-24 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="size-24 rounded-full bg-page" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <h2 id="photo-title" className="text-lg font-bold">
          {t('photoTitle')}
        </h2>
        <p className="text-muted">{t('photoHint')}</p>
        <label className="btn-secondary cursor-pointer">
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          {busy ? t('uploading') : rider.photoUrl ? t('changePhoto') : t('addPhoto')}
        </label>
        {error && <FieldError id="photo-error">{error}</FieldError>}
      </div>
    </section>
  );
}

function Documents() {
  const t = useTranslations('rider');
  const { rider, priv } = useRider();
  if (!priv) return <Spinner label={t('profile.uploading')} />;
  const required = new Set(requiredRiderDocs(rider.vehicleType));
  return (
    <section className="card space-y-2" aria-labelledby="docs-title">
      <h2 id="docs-title" className="text-lg font-bold">
        {t('profile.docsTitle')}
      </h2>
      <p className="text-muted">{t('profile.docsHint')}</p>
      <ul className="divide-y divide-line">
        {RIDER_DOCS.map((k) => (
          <DocRow key={k} docKey={k} needed={required.has(k)} />
        ))}
      </ul>
    </section>
  );
}

function DocRow({ docKey, needed }: { docKey: RiderDocKey; needed: boolean }) {
  const t = useTranslations('rider');
  const { rider, priv } = useRider();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadError = useUploadError();
  const has = !!priv?.docs[docKey];

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadRiderDoc(rider, docKey, file);
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t(`docs.${docKey}`)}</span>
        <span className={`block ${!needed ? 'text-muted' : has ? 'font-semibold text-ok' : 'text-muted'}`}>
          {!needed && !has ? t('profile.notNeeded') : has ? t('profile.uploaded') : t('profile.missing')}
        </span>
      </span>
      <label className="btn-secondary cursor-pointer" aria-label={`${has ? t('profile.replace') : t('profile.upload')}: ${t(`docs.${docKey}`)}`}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
        {busy ? t('profile.uploading') : has ? t('profile.replace') : t('profile.upload')}
      </label>
      {error && (
        <div className="w-full">
          <FieldError id={`${docKey}-error`}>{error}</FieldError>
        </div>
      )}
    </li>
  );
}

function Vehicle() {
  const t = useTranslations('rider');
  const tc = useTranslations('common');
  const { rider } = useRider();
  const [v, setV] = useState<VehicleValue>({ vehicleType: rider.vehicleType, vehicleDesc: rider.vehicleDesc, plateNo: rider.plateNo });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const plate = normalizePlate(v.plateNo);
    const next: Record<string, string> = {};
    if (v.vehicleDesc.trim().length < 2) next.vehicleDesc = t('register.errors.vehicle_desc_required');
    if ((v.vehicleType !== 'bicycle' || plate) && !PLATE_RE.test(plate)) next.plateNo = t('register.errors.bad_plate');
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    await updateRider(rider.id, { vehicleType: v.vehicleType, vehicleDesc: v.vehicleDesc.trim(), plateNo: plate }).finally(() => setBusy(false));
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="card space-y-4" aria-labelledby="vehicle-title" noValidate>
      <h2 id="vehicle-title" className="text-lg font-bold">
        {t('profile.vehicleTitle')}
      </h2>
      {rider.verified && <p className="text-muted">{t('profile.vehicleLocked')}</p>}
      <VehicleFields value={v} onChange={(x) => (setV(x), setSaved(false))} errors={errors} disabled={rider.verified} />
      {saved && (
        <p role="status" className="font-semibold text-ok">
          {t('profile.saved')}
        </p>
      )}
      {!rider.verified && (
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? tc('saving') : t('profile.saveVehicle')}
        </button>
      )}
    </form>
  );
}

function Emergency() {
  const t = useTranslations('rider');
  const tc = useTranslations('common');
  const { rider, priv } = useRider();
  const [ec, setEc] = useState<EmergencyContact | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (priv && !ec) setEc({ ...priv.emergencyContact, phone: formatPhMobile(priv.emergencyContact.phone) });
  }, [priv, ec]);
  if (!priv || !ec) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = { ...ec!, phone: normalizePhMobile(ec!.phone) ?? ec!.phone };
    const parsed = emergencyContactSchema.safeParse(value);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        const known = ['contact_name_required', 'bad_phone', 'relation_required'];
        next[k] ??= t(`register.errors.${(known.includes(i.message) ? i.message : 'generic') as 'generic'}`);
      }
      return setErrors(next);
    }
    setErrors({});
    setBusy(true);
    await saveEmergencyContact(rider.id, parsed.data).finally(() => setBusy(false));
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <EmergencyContactFields value={ec} onChange={(x) => (setEc(x), setSaved(false))} errors={errors} />
      {saved && (
        <p role="status" className="font-semibold text-ok">
          {t('profile.saved')}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? tc('saving') : t('profile.ecSave')}
      </button>
    </form>
  );
}
