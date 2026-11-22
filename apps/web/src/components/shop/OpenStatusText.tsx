'use client';

import { formatTime12, openStatus, type WeeklyHours } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useNow } from '@/lib/useNow';

/** "Open now · Closes at 8:00 PM" / "Closed now · Opens tomorrow at 6:00 AM". */
export function OpenStatusText({ hours, closedOn }: { hours: WeeklyHours; closedOn: string | null }) {
  const t = useTranslations('shop');
  const now = useNow();
  const s = openStatus({ hours, closedOn }, now);
  if (s.open) {
    return (
      <p>
        <span className="font-bold text-ok">{t('dash.openNow')}</span> · {t('dash.closesAt', { time: formatTime12(s.closesAt!) })}
      </p>
    );
  }
  const next = s.opensAt;
  const when = !next
    ? t('dash.noHours')
    : next.daysAhead === 0
      ? t('dash.opensToday', { time: formatTime12(next.time) })
      : next.daysAhead === 1
        ? t('dash.opensTomorrow', { time: formatTime12(next.time) })
        : t('dash.opensOn', { day: t(`days.${next.day}`), time: formatTime12(next.time) });
  return (
    <p>
      <span className="font-bold text-danger">{t('dash.closedNow')}</span> · {when}
    </p>
  );
}
