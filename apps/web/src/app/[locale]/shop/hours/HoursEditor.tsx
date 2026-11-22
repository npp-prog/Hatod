'use client';

import { DAYS, MAX_RANGES_PER_DAY, weeklyHoursSchema, type Day, type TimeRange, type WeeklyHours } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { OpenStatusText } from '@/components/shop/OpenStatusText';
import { useShop } from '@/components/shop/ShopProvider';
import { FieldError, PageTitle, Switch } from '@/components/ui';
import { updateShop } from '@/lib/data/shops';

const DEFAULT_RANGE: TimeRange = { open: '07:00', close: '19:00' };

export function HoursEditor() {
  const t = useTranslations('shop');
  const tc = useTranslations('common');
  const { shop } = useShop();
  const [hours, setHours] = useState<WeeklyHours>(() => structuredClone(shop.hours));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (next: WeeklyHours) => {
    setHours(next);
    setSaved(false);
    setError(null);
  };
  const setDay = (d: Day, ranges: TimeRange[]) => update({ ...hours, [d]: ranges });

  async function save() {
    const parsed = weeklyHoursSchema.safeParse(hours);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const day = issue?.path[0] as Day | undefined;
      const code = (['bad_time', 'same_open_close', 'overlap', 'too_many'].includes(issue?.message ?? '') ? issue!.message : 'bad_time') as
        | 'bad_time'
        | 'same_open_close'
        | 'overlap'
        | 'too_many';
      setError(t(`hours.errors.${code}`, { day: day ? t(`days.${day}`) : '' }));
      return;
    }
    setBusy(true);
    // Store only days with ranges; a missing day means closed.
    const clean = Object.fromEntries(DAYS.filter((d) => (hours[d]?.length ?? 0) > 0).map((d) => [d, hours[d]!]));
    await updateShop(shop.id, { hours: clean });
    setBusy(false);
    setSaved(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('hours.title')}</PageTitle>
        <p className="mt-2 text-muted">{t('hours.intro')}</p>
      </div>
      <div className="card">
        <OpenStatusText hours={shop.hours} closedOn={shop.closedOn} />
      </div>

      <ul className="space-y-3">
        {DAYS.map((d) => {
          const ranges = hours[d] ?? [];
          const open = ranges.length > 0;
          return (
            <li key={d} className="card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">{t(`days.${d}`)}</h2>
                <span className="flex items-center gap-2">
                  <span className={open ? 'font-semibold text-ok' : 'text-muted'}>{open ? '' : t('hours.closed')}</span>
                  <Switch
                    checked={open}
                    label={t('hours.openLabel', { day: t(`days.${d}`) })}
                    onChange={(on) => setDay(d, on ? [{ ...DEFAULT_RANGE }] : [])}
                  />
                </span>
              </div>
              {ranges.map((r, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="flex-1">
                    <span className="block text-sm text-muted">{t('hours.from')}</span>
                    <input
                      type="time"
                      className="input"
                      value={r.open}
                      onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))}
                    />
                  </label>
                  <label className="flex-1">
                    <span className="block text-sm text-muted">{t('hours.to')}</span>
                    <input
                      type="time"
                      className="input"
                      value={r.close === '24:00' ? '00:00' : r.close}
                      onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))}
                    />
                  </label>
                  {ranges.length > 1 && (
                    <button
                      type="button"
                      className="btn-ghost px-3 text-danger"
                      aria-label={t('hours.removeRange')}
                      onClick={() => setDay(d, ranges.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {open && (
                <div className="flex flex-wrap gap-2">
                  {ranges.length < MAX_RANGES_PER_DAY && (
                    <button type="button" className="btn-ghost px-3" onClick={() => setDay(d, [...ranges, { open: '17:00', close: '21:00' }])}>
                      {t('hours.addRange')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost px-3"
                    onClick={() => update(Object.fromEntries(DAYS.map((x) => [x, ranges.map((r) => ({ ...r }))])))}
                  >
                    {t('hours.copyToAll', { day: t(`days.${d}`) })}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <FieldError id="hours-error">{error}</FieldError>}
      {saved && (
        <p role="status" className="font-semibold text-ok">
          {t('hours.saved')}
        </p>
      )}
      <button type="button" className="btn-primary sticky bottom-4 w-full shadow-lg" disabled={busy} onClick={save}>
        {busy ? tc('saving') : t('hours.save')}
      </button>
    </div>
  );
}
