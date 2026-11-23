'use client';

import { formatPhMobile, requiredRiderDocs, RIDER_DOCS, type RiderDoc, type RiderPrivateDoc, type ShopDoc, type ShopPrivateDoc } from '@hatod/shared';
import { doc, getDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTownScope } from '@/components/coordinator/TownScope';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { setAccountStatus, verifyListing } from '@/lib/data/admin';
import { firebase } from '@/lib/firebase/client';
import { callableMessage } from '@/lib/firebase/errors';
import { StatusPills } from '../../../listings/Listings';

type Data =
  | { kind: 'shop'; main: ShopDoc; priv: ShopPrivateDoc | null; files: { label: string; url: string | null }[] }
  | { kind: 'rider'; main: RiderDoc; priv: RiderPrivateDoc | null; files: { label: string; url: string | null; needed: boolean }[] };

/** Private files are opened through short-lived download links; Storage rules decide who may. */
async function fileUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    return await getDownloadURL(ref(firebase().storage, path));
  } catch {
    return null;
  }
}

export function ListingDetail({ kind, id }: { kind: 'shop' | 'rider'; id: string }) {
  const t = useTranslations('coord');
  const tr = useTranslations('rider');
  const { isAdmin } = useTownScope();
  const [data, setData] = useState<Data | null | undefined>(undefined);

  const load = useCallback(async () => {
    const { db } = firebase();
    const coll = kind === 'shop' ? 'shops' : 'riders';
    const [main, priv] = await Promise.all([getDoc(doc(db, coll, id)), getDoc(doc(db, coll, id, 'private', 'info')).catch(() => null)]);
    if (!main.exists()) return setData(null);
    if (kind === 'shop') {
      const p = (priv?.data() as ShopPrivateDoc | undefined) ?? null;
      setData({ kind, main: main.data() as ShopDoc, priv: p, files: [{ label: t('permit'), url: await fileUrl(p?.permitPath) }] });
    } else {
      const r = main.data() as RiderDoc;
      const p = (priv?.data() as RiderPrivateDoc | undefined) ?? null;
      const needed = new Set(requiredRiderDocs(r.vehicleType));
      const files = await Promise.all(RIDER_DOCS.map(async (k) => ({ label: tr(`docs.${k}`), url: await fileUrl(p?.docs[k]), needed: needed.has(k) })));
      setData({ kind, main: r, priv: p, files });
    }
  }, [kind, id, t, tr]);
  useEffect(() => {
    void load();
  }, [load]);

  if (data === undefined) return <Spinner label={t('loading')} />;
  if (data === null) return <p className="card">{t('errorGeneric')}</p>;
  const m = data.main;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mr-auto">
          <PageTitle>{m.name}</PageTitle>
          <span className="text-muted">{data.kind === 'shop' ? t('shop') : t('rider')}</span>
        </span>
        <StatusPills status={m.status} verification={m.verificationStatus} />
      </div>

      <section className="card space-y-2">
        {data.kind === 'shop' ? (
          <>
            <Row label={t('detailOwner')}>{data.priv?.ownerName ?? '—'}</Row>
            <Row label={t('detailPhone')}>{data.priv ? formatPhMobile(data.priv.ownerPhone) : '—'}</Row>
            <Row label={t('detailAddress')}>{`${data.main.landmark}, ${data.main.street ? `${data.main.street}, ` : ''}Brgy. ${data.main.barangayName}`}</Row>
            <Row label={t('detailPayments')}>{data.main.paymentMethods.join(', ')}</Row>
            <Row label="">{t('detailMenu', { count: data.main.menuSummary?.itemCount ?? 0 })}</Row>
            {data.main.photos.length > 0 && (
              <div className="flex gap-2">
                {data.main.photos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={p} alt="" className="size-24 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {data.main.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.main.photoUrl} alt={t('photo')} className="size-28 rounded-full object-cover" />
            )}
            <Row label={t('detailLegalName')}>{data.priv?.legalName ?? '—'}</Row>
            <Row label={t('detailPhone')}>{data.priv ? formatPhMobile(data.priv.phone) : '—'}</Row>
            <Row label={t('detailVehicle')}>{`${tr(`vehicles.${data.main.vehicleType}`)} · ${data.main.vehicleDesc}`}</Row>
            <Row label={t('detailPlate')}>{data.main.plateNo || '—'}</Row>
            {data.priv && (
              <Row label={t('detailEmergency')}>{`${data.priv.emergencyContact.name} (${data.priv.emergencyContact.relation}) ${formatPhMobile(data.priv.emergencyContact.phone)}`}</Row>
            )}
          </>
        )}
      </section>

      <section className="card space-y-2" aria-labelledby="docs-title">
        <h2 id="docs-title" className="text-lg font-bold">
          {t('documents')}
        </h2>
        <ul className="divide-y divide-line">
          {data.files.map((f) => (
            <li key={f.label} className="flex items-center gap-3 py-2">
              <span className="mr-auto">{f.label}</span>
              {f.url ? (
                <a className="btn-secondary" href={f.url} target="_blank" rel="noopener noreferrer">
                  {t('viewFile')}
                </a>
              ) : (
                <span className="text-muted">{t('noFile')}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Decision kind={data.kind} id={id} onDone={load} />
      <AccountActions type={data.kind} id={id} status={m.status} reason={(m as { suspendedReason?: string }).suspendedReason ?? null} isAdmin={isAdmin} onDone={load} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      {label && <span className="block text-sm text-muted">{label}</span>}
      <span>{children}</span>
    </p>
  );
}

function Decision({ kind, id, onDone }: { kind: 'shop' | 'rider'; id: string; onDone: () => void }) {
  const t = useTranslations('coord');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && note.trim().length < 3) return setMsg({ ok: false, text: t('noteRequired') });
    setBusy(true);
    try {
      await verifyListing({ kind, id, decision, note });
      setMsg({ ok: true, text: decision === 'approve' ? t('approved') : t('rejectedDone') });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: callableMessage(e) ?? t('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-y-3">
      <label className="block">
        <span className="label">{t('decisionNote')}</span>
        <textarea className="input min-h-16 py-2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => decide('reject')}>
          {t('reject')}
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => decide('approve')}>
          {t('approve')}
        </button>
      </div>
      {msg && (msg.ok ? <p role="status" className="font-semibold text-ok">{msg.text}</p> : <FieldError id="decision-error">{msg.text}</FieldError>)}
    </section>
  );
}

export function AccountActions({
  type,
  id,
  status,
  reason,
  isAdmin,
  onDone,
}: {
  type: 'customer' | 'shop' | 'rider';
  id: string;
  status: string;
  reason: string | null;
  isAdmin: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('coord');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function act(action: 'suspend' | 'ban' | 'reinstate') {
    if (note.trim().length < 3) return setMsg({ ok: false, text: t('noteRequired') });
    setBusy(true);
    try {
      await setAccountStatus({ type, id, action, note });
      setMsg({ ok: true, text: t('done') });
      setNote('');
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: callableMessage(e) ?? t('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }
  const statusText = status === 'active' ? t('statusActive') : status === 'banned' ? t('statusBanned') : t('statusSuspended');
  return (
    <section className="card space-y-3" aria-labelledby={`acct-${id}`}>
      <h2 id={`acct-${id}`} className="text-lg font-bold">
        {t('actionsTitle')}
      </h2>
      <p className="font-semibold">{t('statusNow', { status: statusText })}</p>
      {reason && status !== 'active' && <p className="text-muted">{t('suspendedWhy', { reason: t.has(`suspendReasons.${reason}` as 'suspendReasons.admin') ? t(`suspendReasons.${reason}` as 'suspendReasons.admin') : reason })}</p>}
      <label className="block">
        <span className="label">{t('actionNote')}</span>
        <textarea className="input min-h-16 py-2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {status === 'active' && (
          <button type="button" className="btn-secondary text-danger" disabled={busy} onClick={() => act('suspend')}>
            {t('suspend')}
          </button>
        )}
        {isAdmin && status !== 'banned' && (
          <button type="button" className="btn-primary bg-danger" disabled={busy} onClick={() => act('ban')}>
            {t('ban')}
          </button>
        )}
        {isAdmin && status !== 'active' && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => act('reinstate')}>
            {t('reinstate')}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">{isAdmin ? '' : `${t('suspendHint')} ${t('adminOnly')}`}</p>
      {msg && (msg.ok ? <p role="status" className="font-semibold text-ok">{msg.text}</p> : <FieldError id={`acct-err-${id}`}>{msg.text}</FieldError>)}
    </section>
  );
}
