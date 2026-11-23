'use client';

import { formatPHP, type SubStatus } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { TownSelect, useTownScope } from '@/components/coordinator/TownScope';
import { useListings } from '@/components/coordinator/useListings';
import { useDate } from '@/components/plans/SubscriptionPage';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { fetchTownSubscriptions, recordCashPayment, type Subscription } from '@/lib/data/subscriptions';
import { callableMessage } from '@/lib/firebase/errors';

const ORDER: SubStatus[] = ['lapsed', 'grace', 'trial', 'active'];

/** Coordinator: who is due, and recording cash payments with the official receipt number. */
export function Payments() {
  const t = useTranslations('subsAdmin');
  const tp = useTranslations('plans');
  const { town } = useTownScope();
  const { data } = useListings();
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [filter, setFilter] = useState<SubStatus | 'all'>('all');
  const load = useCallback(() => {
    if (town) fetchTownSubscriptions(town.id).then(setSubs).catch(() => setSubs([]));
  }, [town]);
  useEffect(load, [load]);

  if (!subs || !data) return <Spinner label="" />;
  const nameOf = (s: Subscription) =>
    (s.subscriberType === 'shop' ? data.shops.find((x) => x.id === s.subscriberId)?.name : data.riders.find((x) => x.id === s.subscriberId)?.name) ?? s.subscriberId;
  const shown = subs.filter((s) => filter === 'all' || s.status === filter).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || nameOf(a).localeCompare(nameOf(b)));
  const paying = subs.filter((s) => s.currentPeriodEnd !== null || s.balance > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto">
          <PageTitle>{t('title')}</PageTitle>
        </span>
        <TownSelect />
      </div>
      <p className="text-muted">{t('intro')}</p>
      <p className="font-semibold">{`${t('conversion')}: ${paying} / ${subs.length}`}</p>
      <div className="flex flex-wrap gap-2" role="group">
        {(['all', ...ORDER] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? t('filterAll') : `${tp(`status.${f}`)} (${subs.filter((s) => s.status === f).length})`}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {shown.map((s) => (
          <SubRow key={s.id} sub={s} name={nameOf(s)} onDone={load} />
        ))}
      </ul>
    </div>
  );
}

function SubRow({ sub, name, onDone }: { sub: Subscription; name: string; onDone: () => void }) {
  const t = useTranslations('subsAdmin');
  const tp = useTranslations('plans');
  const tc = useTranslations('coord');
  const date = useDate();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [months, setMonths] = useState(1);
  const [topUp, setTopUp] = useState('100');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const daily = sub.planCode === 'rider_daily';
  const free = sub.planCode === 'shop_basic';
  const badge = { trial: 'bg-ok/20', active: 'bg-ok text-white', grace: 'bg-warn', lapsed: 'bg-danger text-white' }[sub.status];

  async function record() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await recordCashPayment({ subscriptionId: sub.id, receiptNo: receipt, ...(daily ? { topUp: Number(topUp) } : { periods: months }) });
      setMsg({ ok: true, text: t('recorded', { amount: formatPHP(r.amount) }) });
      setReceipt('');
      onDone();
    } catch (e) {
      const code = callableMessage(e) ?? 'generic';
      setMsg({ ok: false, text: t.has(`errors.${code}` as 'errors.generic') ? t(`errors.${code}` as 'errors.generic') : t('errors.generic') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto">
          <span className="block font-semibold">{name}</span>
          <span className="block text-sm text-muted">
            {`${sub.subscriberType === 'shop' ? tc('shop') : tc('rider')} · ${tp(`names.${sub.planCode}`)} · `}
            {daily
              ? t('balance', { amount: formatPHP(sub.balance) })
              : sub.status === 'trial'
                ? t('trialEnds', { date: date(sub.trialEndsAt) })
                : t('due', { date: date(sub.currentPeriodEnd ?? sub.trialEndsAt) })}
          </span>
        </span>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${badge}`}>{tp(`status.${sub.status}`)}</span>
      </div>
      {!free &&
        (open ? (
          <div className="space-y-2 rounded-xl bg-page p-3">
            <label className="block">
              <span className="text-sm">{t('receiptNo')}</span>
              <input className="input" value={receipt} onChange={(e) => setReceipt(e.target.value)} maxLength={40} />
            </label>
            {daily ? (
              <label className="block">
                <span className="text-sm">{t('topUp')}</span>
                <input className="input w-32" type="number" inputMode="numeric" min={5} value={topUp} onChange={(e) => setTopUp(e.target.value)} />
              </label>
            ) : (
              <label className="flex items-center gap-2">
                <span className="text-sm">{t('months')}</span>
                <select className="input w-24" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {[1, 2, 3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="btn-primary w-full" disabled={busy || !receipt.trim()} onClick={record}>
              {t('save')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
            {t('record')}
          </button>
        ))}
      {msg && (msg.ok ? <p role="status" className="font-semibold text-ok">{msg.text}</p> : <FieldError id={`sub-${sub.id}`}>{msg.text}</FieldError>)}
    </li>
  );
}
