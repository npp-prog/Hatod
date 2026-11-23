'use client';

import { TOWN_TIERS, type PlanDoc } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PageTitle, Spinner } from '@/components/ui';
import { adminSetPlanPrices, fetchPlans } from '@/lib/data/subscriptions';

export default function Page() {
  const t = useTranslations('subsAdmin');
  const [plans, setPlans] = useState<PlanDoc[] | null>(null);
  useEffect(() => {
    fetchPlans().then(setPlans);
  }, []);
  if (!plans) return <Spinner label="" />;
  return (
    <div className="space-y-5">
      <div>
        <PageTitle>{t('plansTitle')}</PageTitle>
        <p className="mt-2 text-muted">{t('plansIntro')}</p>
      </div>
      {plans.map((p) => (
        <PlanRow key={p.code} plan={p} />
      ))}
    </div>
  );
}

function PlanRow({ plan }: { plan: PlanDoc }) {
  const t = useTranslations('subsAdmin');
  const tp = useTranslations('plans');
  const [prices, setPrices] = useState({ A: String(plan.prices.A), B: String(plan.prices.B), C: String(plan.prices.C) });
  const [active, setActive] = useState(plan.active);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle');
  return (
    <section className="card space-y-3" aria-label={tp(`names.${plan.code}`)}>
      <h2 className="text-lg font-bold">{`${tp(`names.${plan.code}`)} ${tp(`per.${plan.period}`)}`}</h2>
      <div className="grid grid-cols-3 gap-2">
        {TOWN_TIERS.map((tier) => (
          <label key={tier}>
            <span className="text-sm text-muted">{t('tier', { t: tier })}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              value={prices[tier]}
              onChange={(e) => (setPrices({ ...prices, [tier]: e.target.value }), setState('idle'))}
            />
          </label>
        ))}
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-6 accent-brand" checked={active} onChange={(e) => (setActive(e.target.checked), setState('idle'))} />
        <span>{t('activeLabel')}</span>
      </label>
      <button
        type="button"
        className="btn-primary"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            await adminSetPlanPrices({ code: plan.code, prices: { A: Number(prices.A), B: Number(prices.B), C: Number(prices.C) }, active });
            setState('saved');
          } catch {
            setState('error');
          }
        }}
      >
        {t('savePlan')}
      </button>
      {state === 'saved' && <p className="font-semibold text-ok">{t('saved')}</p>}
      {state === 'error' && <p className="text-danger">{t('errors.generic')}</p>}
    </section>
  );
}
