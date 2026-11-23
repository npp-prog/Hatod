'use client';

import { formatPHP, requiredRiderDocs } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { FieldError } from '@/components/ui';
import { callableMessage } from '@/lib/firebase/errors';
import { useRider } from '@/components/rider/RiderProvider';
import { PageTitle, Switch } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { setOnline, updateRider } from '@/lib/data/riders';

export function RiderDashboard() {
  const t = useTranslations('rider');
  const { rider, priv } = useRider();
  const tp = useTranslations('plans');
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const canGoOnline = rider.verified && rider.status === 'active';

  const required = requiredRiderDocs(rider.vehicleType);
  const docsDone = priv ? required.filter((k) => !!priv.docs[k]).length : 0;
  const checklist = [
    { done: !!rider.photoUrl, label: t('dash.checkPhoto'), href: '/rider/profile' },
    { done: docsDone === required.length, label: t('dash.checkDocs', { done: docsDone, total: required.length }), href: '/rider/profile' },
    { done: rider.servedBarangayIds.length > 0, label: t('dash.checkArea'), href: '/rider/area' },
  ];

  return (
    <div className="space-y-5">
      <PageTitle>{rider.name}</PageTitle>
      {rider.status === 'suspended' ? (
        <Banner cls="bg-danger text-white" title={t('dash.suspendedTitle')} body={t('dash.suspendedBody')} />
      ) : rider.verified ? (
        <Banner cls="bg-ok text-white" title={t('dash.liveTitle')} />
      ) : rider.verificationStatus === 'rejected' ? (
        <Banner cls="bg-warn" title={t('dash.rejectedTitle')} body={(rider as { verificationNote?: string }).verificationNote} />
      ) : (
        <Banner cls="bg-warn/30 border-2 border-warn" title={t('dash.pendingTitle')} body={t('dash.pendingBody')} />
      )}

      <section className="card space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{t('dash.onlineLabel')}</p>
            <p className="text-muted">
              {!canGoOnline ? t('dash.onlineLocked') : rider.online ? t('dash.onlineOn') : t('dash.onlineOff')}
            </p>
          </div>
          <span className={canGoOnline ? '' : 'pointer-events-none opacity-50'}>
            <Switch
              checked={rider.online}
              label={t('dash.onlineLabel')}
              onChange={(on) => {
                if (!canGoOnline) return;
                setOnlineError(null);
                // Going offline needs no server answer (works on weak signal); going online is checked.
                void setOnline(rider.id, on).catch((e) => {
                  const code = callableMessage(e) ?? 'generic';
                  setOnlineError(tp.has(`errors.${code}` as 'errors.generic') ? tp(`errors.${code}` as 'errors.generic') : tp('errors.generic'));
                });
              }}
            />
          </span>
        </div>
        {canGoOnline && <p className="text-sm text-muted">{t('dash.onlineAuto')}</p>}
        {onlineError && (
          <div className="space-y-2">
            <FieldError id="online-error">{onlineError}</FieldError>
            <Link href="/rider/subscription" className="btn-secondary">
              {tp('title')}
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="font-bold">{t('dash.rainLabel')}</p>
            <p className="text-muted">
              {rider.rateCard.surcharges.rain > 0
                ? t('dash.rainHint', { amount: formatPHP(rider.rateCard.surcharges.rain) })
                : t('dash.rainNoSurcharge')}
            </p>
          </div>
          <Switch checked={rider.rainOn} label={t('dash.rainLabel')} onChange={(on) => updateRider(rider.id, { rainOn: on })} />
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">{t('dash.statsTitle')}</h2>
        <p className="mt-2">{t('dash.completed', { count: rider.completedCount })}</p>
        <p className="text-muted">
          {rider.ratingCount > 0 ? t('dash.rating', { rating: rider.ratingAvg.toFixed(1), count: rider.ratingCount }) : t('dash.noRating')}
        </p>
      </section>

      {!rider.verified && (
        <section className="card">
          <h2 className="text-lg font-bold">{t('dash.checklistTitle')}</h2>
          <ul className="mt-3 space-y-2">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex min-h-12 items-center gap-3">
                  <span
                    aria-hidden
                    className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${c.done ? 'border-ok bg-ok text-white' : 'border-line'}`}
                  >
                    {c.done ? '✓' : ''}
                  </span>
                  <span className={c.done ? 'text-muted line-through' : 'font-semibold'}>{c.label}</span>
                  <span className="sr-only">{c.done ? t('dash.done') : t('dash.todo')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Banner({ cls, title, body }: { cls: string; title: string; body?: ReactNode }) {
  return (
    <section className={`rounded-2xl p-4 ${cls}`} role="status">
      <p className="font-bold">{title}</p>
      {body && <p className="mt-1">{body}</p>}
    </section>
  );
}
