'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { adminMetrics, type DashboardMetrics } from '@/lib/data/admin';
import { Spinner } from './ui';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

/** Pilot numbers: stat tiles against the plan's targets, and completed orders per day. */
export function MetricsDashboard({ townId, days = 14 }: { townId: string | null; days?: number }) {
  const t = useTranslations('metrics');
  const [m, setM] = useState<DashboardMetrics | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setM(null);
    setFailed(false);
    adminMetrics({ townId, days })
      .then(setM)
      .catch(() => setFailed(true));
  }, [townId, days]);
  useEffect(load, [load]);

  if (failed) return <p className="card" role="alert">{t('loadFailed')}</p>;
  if (!m) return <Spinner label="" />;
  const tiles: { label: string; value: string; hint?: string; target?: string }[] = [
    { label: t('completed'), value: String(m.completed), hint: `${t('placed')}: ${m.placed}`, target: '300+ / week' },
    { label: t('completionRate'), value: pct(m.completionRate), target: '90%+' },
    { label: t('medianAssign'), value: m.medianAssignMinutes === null ? '—' : t('minutes', { n: m.medianAssignMinutes }), target: '< 5 min' },
    { label: t('repeatRate'), value: pct(m.repeatRate), hint: t('repeatHint', { count: m.customers }), target: '40%+' },
    { label: t('activeShops'), value: String(m.activeShops), hint: `${t('activeHint')} · ${t('listed')}: ${m.listedShops}`, target: '25+' },
    { label: t('activeRiders'), value: String(m.activeRiders), hint: `${t('activeHint')} · ${t('onlineNow')}: ${m.onlineRiders}`, target: '15+' },
    {
      label: t('trialToPaid'),
      value: m.subscriptions ? pct(m.paidSubscriptions / m.subscriptions) : '—',
      hint: t('paidHint', { paid: m.paidSubscriptions, total: m.subscriptions }),
      target: '70%+',
    },
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-muted">{t('period', { days })}</p>
        <button type="button" className="btn-ghost" onClick={load}>
          {t('refresh')}
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="card space-y-1 p-4">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="text-3xl font-bold tabular-nums">{tile.value}</p>
            {tile.hint && <p className="text-xs text-muted">{tile.hint}</p>}
            {tile.target && <p className="text-xs text-muted">{t('target', { target: tile.target })}</p>}
          </li>
        ))}
      </ul>
      <DailyChart days={m.days} />
    </div>
  );
}

/** Single-series bar chart (completed per day), hover/focus values, and a table view. */
function DailyChart({ days }: { days: DashboardMetrics['days'] }) {
  const t = useTranslations('metrics');
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.completed));
  const W = 600;
  const H = 180;
  const pad = { l: 40, r: 8, t: 14, b: 30 };
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const label = (d: string) =>
    new Date(`${d}T12:00:00+08:00`).toLocaleDateString(locale === 'fil' ? 'fil-PH' : 'en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
  const h = hover === null ? null : days[hover]!;

  return (
    <section className="card space-y-2" aria-labelledby="chart-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="chart-title" className="font-bold">
          {t('chartTitle')}
        </h2>
        <p className="text-sm text-muted" aria-live="polite">
          {h ? t('chartDay', { date: label(h.date), completed: h.completed, placed: h.placed }) : ''}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('chartTitle')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 6} textAnchor="end" fontSize={18} fill="var(--color-muted)">
              {v}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * bw + 2;
          const top = y(d.completed);
          const height = Math.max(0, y(0) - top);
          const w = Math.max(2, bw - 4);
          const r = Math.min(4, w / 2, height);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={t('chartDay', { date: label(d.date), completed: d.completed, placed: d.placed })}>
              {/* full-height hit target, bigger than the bar */}
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {height > 0 && (
                <path
                  d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y(0)} Z`}
                  fill="var(--color-brand)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {(i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2)) && (
                <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={18} fill="var(--color-muted)">
                  {label(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details>
        <summary className="cursor-pointer text-sm text-brand">{t('tableView')}</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">{t('date')}</th>
              <th className="py-1 text-right">{t('placed')}</th>
              <th className="py-1 text-right">{t('completed')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-t border-line">
                <td className="py-1">{label(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{d.placed}</td>
                <td className="py-1 text-right tabular-nums">{d.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
