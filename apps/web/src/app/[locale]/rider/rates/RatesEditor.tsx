'use client';

import {
  computeDeliveryFee,
  formatPHP,
  formatTime12,
  isNightHour,
  nextRateChangeAt,
  rateCardSchema,
  RIDER_LIMITS,
  type RateCard,
} from '@hatod/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useRider } from '@/components/rider/RiderProvider';
import { FieldError, PageTitle } from '@/components/ui';
import { fetchBarangays, type Barangay } from '@/lib/data/places';
import { saveRateCard } from '@/lib/data/riders';
import { callableMessage, firstIssueCode } from '@/lib/firebase/errors';
import { useNow } from '@/lib/useNow';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const KNOWN = new Set(['whole_pesos', 'negative_price', 'price_too_high', 'free_rate_card', 'duplicate_fixed_fare', 'night_same_hours', 'fixed_incomplete', 'rate_change_too_soon']);
const SAMPLE_KM = [1, 3.2, 5];

type Form = {
  base: string;
  perKm: string;
  minimum: string;
  nightOn: boolean;
  nightFrom: number;
  nightUntil: number;
  nightAmount: string;
  rain: string;
  extraStop: string;
  fixed: { from: string; to: string; fee: string }[];
};

const toForm = (c: RateCard): Form => ({
  base: String(c.base),
  perKm: String(c.perKm),
  minimum: String(c.minimum),
  nightOn: !!c.surcharges.night,
  nightFrom: c.surcharges.night?.fromHour ?? 20,
  nightUntil: c.surcharges.night?.untilHour ?? 5,
  nightAmount: String(c.surcharges.night?.amount ?? 10),
  rain: String(c.surcharges.rain),
  extraStop: String(c.surcharges.extraStop),
  fixed: c.fixedFares.map((f) => ({ from: f.fromBarangayId, to: f.toBarangayId, fee: String(f.fee) })),
});

/** Empty fields count as 0 so the preview keeps working while typing. Decimals pass through so the schema can say "whole pesos". */
const num = (s: string) => (s.trim() === '' ? 0 : Number(s));

const fromForm = (f: Form): RateCard => ({
  base: num(f.base),
  perKm: num(f.perKm),
  minimum: num(f.minimum),
  fixedFares: f.fixed.map((x) => ({ fromBarangayId: x.from, toBarangayId: x.to, fee: num(x.fee) })),
  surcharges: {
    night: f.nightOn ? { fromHour: f.nightFrom, untilHour: f.nightUntil, amount: num(f.nightAmount) } : null,
    rain: num(f.rain),
    extraStop: num(f.extraStop),
  },
});

export function RatesEditor() {
  const t = useTranslations('rider.rates');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { rider } = useRider();
  const now = useNow();
  const [form, setForm] = useState<Form>(() => toForm(rider.rateCard));
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [km, setKm] = useState(3.2);
  const [night, setNight] = useState(false);
  const [rain, setRain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchBarangays(rider.townId).then(setBarangays);
  }, [rider.townId]);

  const set = (p: Partial<Form>) => {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
    setError(null);
  };
  const card = useMemo(() => fromForm(form), [form]);
  const safeCard = useMemo<RateCard>(() => {
    const z = (n: number) => (Number.isFinite(n) ? n : 0);
    return {
      ...card,
      base: z(card.base),
      perKm: z(card.perKm),
      minimum: z(card.minimum),
      fixedFares: [],
      surcharges: {
        night: card.surcharges.night ? { ...card.surcharges.night, amount: z(card.surcharges.night.amount) } : null,
        rain: z(card.surcharges.rain),
        extraStop: z(card.surcharges.extraStop),
      },
    };
  }, [card]);

  // Preview at a fixed day/night hour so the "At night" box decides, not the clock.
  const previewAt = (isNight: boolean) => {
    const n = safeCard.surcharges.night;
    const hour = !n ? 12 : isNight ? n.fromHour : (HOURS.find((h) => !isNightHour(n, h)) ?? 12);
    return new Date(`2026-11-23T${String(hour).padStart(2, '0')}:30:00+08:00`);
  };
  const quote = (distance: number, isNight = night, isRain = rain) =>
    computeDeliveryFee({ card: safeCard, distanceKm: distance, fromBarangayId: '-', toBarangayId: '-', at: previewAt(isNight), rainOn: isRain });

  const last = (rider.rateUpdatedAt as { toMillis(): number } | null)?.toMillis() ?? null;
  const nextAt = nextRateChangeAt(last, rider.verified);
  const locked = nextAt !== null && now.getTime() < nextAt;

  async function save() {
    if (form.fixed.some((f) => !f.from || !f.to)) return setError(t('errors.fixed_incomplete'));
    const parsed = rateCardSchema.safeParse(card);
    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message ?? 'generic';
      return setError(t(`errors.${(KNOWN.has(code) ? code : 'generic') as 'generic'}`));
    }
    setBusy(true);
    try {
      await saveRateCard(parsed.data);
      setSaved(true);
    } catch (err) {
      const code = firstIssueCode(err) ?? callableMessage(err) ?? 'generic';
      setError(t(`errors.${(KNOWN.has(code) ? code : 'generic') as 'generic'}`));
    } finally {
      setBusy(false);
    }
  }

  const money = (label: string, id: string, value: string, onChange: (v: string) => void, hint?: string, max: number = RIDER_LIMITS.baseMax) => (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className="input w-36"
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={locked}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-muted">
          {hint}
        </p>
      )}
    </div>
  );

  const q = quote(km);
  const b = q.breakdown;

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>

      {locked ? (
        <p className="rounded-2xl border-2 border-warn bg-warn/20 p-4 font-semibold" role="status">
          {t('lockedUntil', { when: new Date(nextAt!).toLocaleString(locale === 'fil' ? 'fil-PH' : 'en-PH', { timeZone: 'Asia/Manila', weekday: 'long', hour: 'numeric', minute: '2-digit' }) })}
        </p>
      ) : (
        <p className="text-muted">{t('onceADay')}</p>
      )}

      {/* Live preview, kept near the top so the effect of every change is visible. */}
      <section className="card space-y-3 border-2 border-brand" aria-labelledby="preview-title" aria-live="polite">
        <h2 id="preview-title" className="text-lg font-bold">
          {t('previewTitle')}
        </h2>
        <label className="block">
          <span className="font-semibold">{t('previewDistance', { km: km.toFixed(1) })}</span>
          <input
            type="range"
            min={0.5}
            max={Math.max(1, rider.maxKm)}
            step={0.1}
            value={km}
            onChange={(e) => setKm(Number(e.target.value))}
            className="mt-2 h-12 w-full accent-brand"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          {form.nightOn && (
            <label className="flex min-h-12 items-center gap-2">
              <input type="checkbox" className="size-6 accent-brand" checked={night} onChange={(e) => setNight(e.target.checked)} />
              {t('previewNight')}
            </label>
          )}
          {num(form.rain) > 0 && (
            <label className="flex min-h-12 items-center gap-2">
              <input type="checkbox" className="size-6 accent-brand" checked={rain} onChange={(e) => setRain(e.target.checked)} />
              {t('previewRain')}
            </label>
          )}
        </div>
        <dl className="space-y-1">
          <Line label={t('lineBase')} value={b.base} />
          <Line label={t('lineDistance', { km: q.billedKm.toFixed(1), rate: formatPHP(safeCard.perKm) })} value={b.distance} />
          {b.minimumTopUp > 0 && <Line label={t('lineMinimum')} value={b.minimumTopUp} />}
          {b.night > 0 && <Line label={t('lineNight')} value={b.night} />}
          {b.rain > 0 && <Line label={t('lineRain')} value={b.rain} />}
          <div className="flex justify-between border-t border-line pt-2 text-xl font-bold">
            <dt>{t('previewTotal')}</dt>
            <dd>{formatPHP(q.fee)}</dd>
          </div>
        </dl>
        <div>
          <p className="font-semibold">{t('examplesTitle')}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {SAMPLE_KM.map((d) => (
              <li key={d} className="chip">
                {t('exampleKm', { km: d })} · {formatPHP(quote(d, false, false).fee)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card grid gap-5 sm:grid-cols-3">
        {money(t('baseLabel'), 'base', form.base, (v) => set({ base: v }), t('baseHint'))}
        {money(t('perKmLabel'), 'perKm', form.perKm, (v) => set({ perKm: v }), t('perKmHint'), RIDER_LIMITS.perKmMax)}
        {money(t('minimumLabel'), 'minimum', form.minimum, (v) => set({ minimum: v }), t('minimumHint'), RIDER_LIMITS.minimumMax)}
      </section>

      <section className="card space-y-4" aria-labelledby="night-title">
        <h2 id="night-title" className="text-lg font-bold">
          {t('nightTitle')}
        </h2>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="size-6 accent-brand" checked={form.nightOn} onChange={(e) => set({ nightOn: e.target.checked })} disabled={locked} />
          <span>{t('nightOn')}</span>
        </label>
        {form.nightOn && (
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="block text-sm text-muted">{t('from')}</span>
              <select className="input" value={form.nightFrom} onChange={(e) => set({ nightFrom: Number(e.target.value) })} disabled={locked}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatTime12(`${String(h).padStart(2, '0')}:00`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block text-sm text-muted">{t('until')}</span>
              <select className="input" value={form.nightUntil} onChange={(e) => set({ nightUntil: Number(e.target.value) })} disabled={locked}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatTime12(`${String(h).padStart(2, '0')}:00`)}
                  </option>
                ))}
              </select>
            </label>
            {money(t('amountLabel'), 'nightAmount', form.nightAmount, (v) => set({ nightAmount: v }), undefined, RIDER_LIMITS.surchargeMax)}
          </div>
        )}
      </section>

      <section className="card grid gap-5 sm:grid-cols-2">
        {money(t('rainTitle'), 'rain', form.rain, (v) => set({ rain: v }), t('rainHint'), RIDER_LIMITS.surchargeMax)}
        {money(t('extraStopLabel'), 'extraStop', form.extraStop, (v) => set({ extraStop: v }), t('extraStopHint'), RIDER_LIMITS.surchargeMax)}
      </section>

      <section className="card space-y-3" aria-labelledby="fixed-title">
        <h2 id="fixed-title" className="text-lg font-bold">
          {t('fixedTitle')}
        </h2>
        <p className="text-muted">{t('fixedHint')}</p>
        {form.fixed.map((f, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <label className="min-w-36 flex-1">
              <span className="block text-sm text-muted">{t('fromBarangay')}</span>
              <select className="input" value={f.from} disabled={locked} onChange={(e) => set({ fixed: form.fixed.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })}>
                <option value="" />
                {barangays.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-36 flex-1">
              <span className="block text-sm text-muted">{t('toBarangay')}</span>
              <select className="input" value={f.to} disabled={locked} onChange={(e) => set({ fixed: form.fixed.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })}>
                <option value="" />
                {barangays.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-28">
              <span className="block text-sm text-muted">{t('fareLabel')}</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={f.fee}
                disabled={locked}
                onChange={(e) => set({ fixed: form.fixed.map((x, j) => (j === i ? { ...x, fee: e.target.value } : x)) })}
              />
            </label>
            <button
              type="button"
              className="btn-ghost px-3 text-danger"
              aria-label={t('removeFixed', { n: i + 1 })}
              disabled={locked}
              onClick={() => set({ fixed: form.fixed.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        {form.fixed.length < RIDER_LIMITS.fixedFaresMax && !locked && (
          <button type="button" className="btn-secondary" onClick={() => set({ fixed: [...form.fixed, { from: '', to: '', fee: '' }] })}>
            {t('addFixed')}
          </button>
        )}
      </section>

      {error && <FieldError id="rates-error">{error}</FieldError>}
      {saved && (
        <p role="status" className="font-semibold text-ok">
          {t('saved')}
        </p>
      )}
      {!locked && (
        <button type="button" className="btn-primary sticky bottom-4 w-full shadow-lg" disabled={busy} onClick={save}>
          {busy ? tc('saving') : t('save')}
        </button>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{formatPHP(value)}</dd>
    </div>
  );
}

