'use client';

import { formatPHP, formatPhMobile, TIMELINE, timelineIndex, type OrderStatus } from '@hatod/shared';
import { useLocale, useTranslations } from 'next-intl';
import type { Order } from '@/lib/data/orders';
import { tsMillis } from '@/lib/data/orders';

const ACTIVE_COLOR: Partial<Record<OrderStatus, string>> = {
  PLACED: 'bg-warn text-ink',
  SHOP_ACCEPTED: 'bg-brand text-white',
  RIDER_OFFERED: 'bg-brand text-white',
  RIDER_ASSIGNED: 'bg-brand text-white',
  PICKED_UP: 'bg-brand text-white',
  DELIVERED: 'bg-ok text-white',
  COMPLETED: 'bg-ok text-white',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations('orders.status');
  return <span className={`inline-block shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${ACTIVE_COLOR[status] ?? 'bg-line'}`}>{t(status)}</span>;
}

export function useTime() {
  const locale = useLocale();
  return (t: unknown, withDay = false) =>
    new Date(tsMillis(t)).toLocaleString(locale === 'fil' ? 'fil-PH' : 'en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      ...(withDay ? { month: 'short', day: 'numeric' } : {}),
    });
}

/** Progress steps with the time each was reached. */
export function Timeline({ order }: { order: Order }) {
  const t = useTranslations('orders.timeline');
  const time = useTime();
  const at = (s: OrderStatus) => order.statusHistory.find((h) => h.status === s)?.at;
  const current = timelineIndex(order.status);
  return (
    <ol className="space-y-2">
      {TIMELINE.map((s, i) => {
        const done = i <= current;
        const when = at(s);
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`grid size-8 shrink-0 place-items-center rounded-full border-2 font-bold ${done ? 'border-ok bg-ok text-white' : 'border-line text-muted'}`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`flex-1 ${done ? 'font-semibold' : 'text-muted'} ${i === current ? 'text-brand' : ''}`}>{t(s as 'PLACED')}</span>
            {when ? <span className="text-sm text-muted">{time(when)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ItemsTable({ order, showNotes = true }: { order: Order; showNotes?: boolean }) {
  const t = useTranslations('orders');
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {order.items.map((i, k) => (
          <li key={k} className="flex gap-3">
            <span className="w-8 shrink-0 font-bold">{`${i.qty}×`}</span>
            <span className="flex-1">
              {i.name}
              {i.variant ? ` (${i.variant})` : ''}
              {i.addOns.length > 0 && <span className="block text-sm text-muted">{i.addOns.map((a) => `+ ${a}`).join(', ')}</span>}
              {showNotes && i.note && <span className="block text-sm font-semibold">{i.note}</span>}
            </span>
            <span>{formatPHP(i.unitPrice * i.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-line pt-2">
        <div className="flex justify-between">
          <dt>{t('food')}</dt>
          <dd>{formatPHP(order.itemsTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>
            {t('delivery')}{' '}
            {order.deliveryFee !== null && <span className="text-sm text-muted">{`(${order.feeLocked ? t('feeLocked') : t('feeEstimate')})`}</span>}
          </dt>
          <dd>{order.deliveryFee === null ? '—' : formatPHP(order.deliveryFee)}</dd>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <dt>{t('total')}</dt>
          <dd>{formatPHP(order.itemsTotal + (order.deliveryFee ?? 0))}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Big tap targets to call or text someone on the order. */
export function ContactButtons({ phone, label }: { phone: string; label: string }) {
  const t = useTranslations('orders');
  if (!phone) return null;
  return (
    <span className="flex flex-wrap gap-2">
      <a href={`tel:${phone}`} className="btn-secondary min-h-12" aria-label={`${t('call')} ${label} ${formatPhMobile(phone)}`}>
        {t('call')}
      </a>
      <a href={`sms:${phone}`} className="btn-ghost min-h-12" aria-label={`${t('text')} ${label}`}>
        {t('text')}
      </a>
    </span>
  );
}
