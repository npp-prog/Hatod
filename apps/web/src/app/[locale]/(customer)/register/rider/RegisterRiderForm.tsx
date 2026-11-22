'use client';

import { normalizePhMobile, registerRiderInput, type EmergencyContact } from '@hatod/shared';
import { httpsCallable } from 'firebase/functions';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { EmergencyContactFields } from '@/components/rider/EmergencyContactFields';
import { VehicleFields, type VehicleValue } from '@/components/rider/VehicleFields';
import { useTown } from '@/components/TownProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { firebase } from '@/lib/firebase/client';
import { callableMessage, firstIssueCode } from '@/lib/firebase/errors';

const KNOWN = ['vehicle_desc_required', 'bad_plate', 'contact_name_required', 'bad_phone', 'relation_required', 'rider_exists'];

export function RegisterRiderForm() {
  const t = useTranslations('rider.register');
  const tc = useTranslations('common');
  const router = useRouter();
  const { claims, refreshClaims } = useAuth();
  const { town, loading } = useTown();
  const [vehicle, setVehicle] = useState<VehicleValue>({ vehicleType: 'motorcycle', vehicleDesc: '', plateNo: '' });
  const [ec, setEc] = useState<EmergencyContact>({ name: '', phone: '', relation: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const msg = (code: string) => t(`errors.${(KNOWN.includes(code) ? code : 'generic') as 'generic'}`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!town) return;
    const payload = { townId: town.id, ...vehicle, emergencyContact: { ...ec, phone: normalizePhMobile(ec.phone) ?? ec.phone } };
    const parsed = registerRiderInput.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const key = i.path[0] === 'emergencyContact' ? `ec.${String(i.path[1])}` : String(i.path[0]);
        next[key] ??= msg(i.message);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await httpsCallable(firebase().functions, 'registerRider')(payload);
      await refreshClaims();
      router.push('/rider');
    } catch (err) {
      setErrors({ form: msg(firstIssueCode(err) ?? callableMessage(err) ?? 'generic') });
      setBusy(false);
    }
  }

  if (claims.roles.includes('rider')) {
    return (
      <div className="card space-y-3">
        <p>{t('alreadyHave')}</p>
        <Link href="/rider" className="btn-primary">
          {t('goToRider')}
        </Link>
      </div>
    );
  }
  if (loading) return <Spinner label={tc('loading')} />;
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

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      <div className="card">
        <VehicleFields value={vehicle} onChange={setVehicle} errors={{ vehicleDesc: errors.vehicleDesc, plateNo: errors.plateNo }} />
      </div>
      <EmergencyContactFields
        value={ec}
        onChange={setEc}
        errors={{ name: errors['ec.name'], phone: errors['ec.phone'], relation: errors['ec.relation'] }}
      />
      {errors.form && <FieldError id="form-error">{errors.form}</FieldError>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
