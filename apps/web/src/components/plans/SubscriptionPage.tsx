'use client';

import { DAILY_TOPUP_OPTIONS, formatPHP, RIDER_PLANS, SHOP_PLANS, type PlanCode, type PlanDoc, type TownTier } from '@hatod/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { fetchTown } from '@/lib/data/places';
import { choosePlan, fetchPlans, startCheckout, watchPayments, watchSubscription, type Payment, type Subscription } from '@/lib/data/subscriptions';
import { callableMessage } from '@/lib/firebase/errors';

export function useDate() {
  const locale = useLocale();
  return (ms: number) => new Date(ms).toLocaleDateString(locale === 'fil' ? 'fil-PH' : 'en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' });
}

/** Plan, status, paying and payment history for a shop or rider. */
export function SubscriptionPage({ type, subscriberId, townId }: { type: 'shop' | 'rider'; subscriberId: string; townId: string }) {
  const t = useTranslations('plans');
  const date = useDate();
  const [sub, setSub] = useState<Subscription | null | undefined>(undefined);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<PlanDoc[] | null>(null);
  const [tier, setTier] = useState<TownTier>('C');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subscriptionId = `${type}_${subscriberId}`;

  useEffect(() => watchSubscription(subscriptionId, setSub), [subscriptionId]);
  useEffect(() => watchPayments(subscriptionId, setPayments), [subscriptionId]);
  useEffect(() => {
    fetchPlans().then(setPlans);
    fetchTown(townId).then((tw) => tw && setTier(tw.tier));
  }, [townId]);

  const errText = (e: unknown) => {
    const code = callableMessage(e) ?? 'generic';
    return t.has(`errors.${code}` as 'errors.generic') ? t(`errors.${code}` as 'errors.generic') : t('errors.generic');
  };
  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }
  async function pay(method: 'gcash' | 'maya', topUp: number | null = null) {
    await run(`pay-${method}-${topUp ?? ''}`, async () => {
      const r = await startCheckout({ subscriberType: type, periods: months, topUp, method });
      window.location.assign(r.url);
    });
  }

  if (sub === undefined || !plans) return <Spinner label="" />;
  if (sub === null) return <p className="card">{t('errors.generic')}</p>;

  const plan = plans.find((p) => p.code === sub.planCode)!;
  const price = plan.prices[tier];
  const offered = (type === 'shop' ? SHOP_PLANS : RIDER_PLANS).map((c) => plans.find((p) => p.code === c)!).filter((p) => p.active);
  const daily = sub.planCode === 'rider_daily';
  const statusBox =
    sub.planCode === 'shop_basic'
      ? { cls: 'bg-page border-line', text: t('basicNote') }
      : sub.status === 'trial'
        ? { cls: 'bg-ok/10 border-ok', text: t('trialUntil', { date: date(sub.trialEndsAt) }) }
        : sub.status === 'active' && sub.currentPeriodEnd
          ? { cls: 'bg-ok/10 border-ok', text: t('paidUntil', { date: date(sub.currentPeriodEnd) }) }
          : sub.status === 'grace'
            ? { cls: 'bg-warn/20 border-warn', text: t('graceUntil', { date: date((sub.currentPeriodEnd ?? sub.trialEndsAt) + 3 * 86_400_000) }) }
            : sub.status === 'lapsed'
              ? { cls: 'bg-danger/10 border-danger', text: type === 'shop' ? t('lapsedShop') : t('lapsedRider') }
              : null;

  return (
    <div className="space-y-5">
      <PageTitle>{t('title')}</PageTitle>
      <section className="card space-y-2" aria-labelledby="current-title">
        <p className="text-sm text-muted" id="current-title">
          {t('current')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-2xl font-bold">{t(`names.${sub.planCode}`)}</span>
          <span className="rounded-full bg-page px-3 py-1 font-semibold">{t(`status.${sub.status}`)}</span>
        </div>
        <p className="text-lg">{price === 0 ? t('free') : `${formatPHP(price)} ${t(`per.${plan.period}`)}`}</p>
        {statusBox && <p className={`rounded-xl border-2 p-3 ${statusBox.cls}`}>{statusBox.text}</p>}
        <p className="text-sm text-muted">{t('noFees')}</p>
      </section>

      {daily ? (
        <section className="card space-y-3" aria-labelledby="bal-title">
          <h2 id="bal-title" className="text-lg font-bold">
            {t('balance')}
          </h2>
          <p className="text-4xl font-extrabold tabular-nums">{formatPHP(sub.balance)}</p>
          <p className="text-muted">{t('balanceNote', { price: formatPHP(price), days: price ? Math.floor(sub.balance / price) : 0 })}</p>
          <div className="grid grid-cols-2 gap-2">
            {DAILY_TOPUP_OPTIONS.map((a) => (
              <button key={a} type="button" className="btn-primary" disabled={!!busy} onClick={() => pay('gcash', a)}>
                {t('topUp', { amount: formatPHP(a) })}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{t('cashNote')}</p>
        </section>
      ) : price > 0 ? (
        <section className="card space-y-3" aria-labelledby="pay-title">
          <h2 id="pay-title" className="text-lg font-bold">
            {t('payTitle')}
          </h2>
          <label className="flex items-center gap-3">
            <span>{t('months')}</span>
            <select className="input w-24" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['gcash', 'maya'] as const).map((m) => (
              <button key={m} type="button" className="btn-primary" disabled={!!busy} onClick={() => pay(m)}>
                {busy === `pay-${m}-` ? t('paying') : t('pay', { amount: formatPHP(price * months), method: t(m) })}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{t('cashNote')}</p>
        </section>
      ) : null}

      {error && <FieldError id="plan-error">{error}</FieldError>}

      <section className="space-y-2">
        {offered.map((p) => {
          const current = p.code === sub.planCode;
          const pr = p.prices[tier];
          return (
            <article key={p.code} className={`card space-y-2 ${current ? 'border-2 border-brand' : ''}`}>
              <div className="flex items-baseline gap-2">
                <h3 className="mr-auto text-lg font-bold">{t(`names.${p.code}`)}</h3>
                <span className="font-semibold">{pr === 0 ? t('free') : `${formatPHP(pr)} ${t(`per.${p.period}`)}`}</span>
              </div>
              <ul className="space-y-1 text-sm">
                {p.features.map((f) => (
                  <li key={f}>{`✓ ${t.has(`features.${f}` as 'features.listing') ? t(`features.${f}` as 'features.listing') : f}`}</li>
                ))}
              </ul>
              {!current && (
                <button
                  type="button"
                  className="btn-secondary w-full"
                  disabled={!!busy}
                  onClick={() => run(`plan-${p.code}`, () => choosePlan({ subscriberType: type, planCode: p.code as PlanCode }))}
                >
                  {busy === `plan-${p.code}` ? t('switching') : t('choose', { plan: t(`names.${p.code}`) })}
                </button>
              )}
            </article>
          );
        })}
      </section>

      <section className="card space-y-2" aria-labelledby="hist-title">
        <h2 id="hist-title" className="text-lg font-bold">
          {t('history')}
        </h2>
        {payments.length === 0 ? (
          <p className="text-muted">{t('noPayments')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="py-2">
                <span className="block font-semibold">{`${formatPHP(p.amount)} · ${p.kind === 'topup' ? t('topupKind') : t('periodKind', { n: p.periods })}`}</span>
                <span className="block text-sm text-muted">{`${date(p.at)} · ${p.method.toUpperCase()} · ${t('receipt', { no: p.receiptNo })}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
