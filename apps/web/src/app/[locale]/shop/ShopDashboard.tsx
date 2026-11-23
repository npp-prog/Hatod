'use client';

import { BUSY_OPTIONS, DAYS, estimatedPrepMinutes, manilaParts } from '@hatod/shared';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { OpenStatusText } from '@/components/shop/OpenStatusText';
import { useShop } from '@/components/shop/ShopProvider';
import { PageTitle, Switch } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { updateShop } from '@/lib/data/shops';
import { firebase } from '@/lib/firebase/client';
import { useNow } from '@/lib/useNow';

export function ShopDashboard() {
  const t = useTranslations('shop');
  const tp = useTranslations('plans');
  const { shop, menu } = useShop();
  const now = useNow();
  const today = manilaParts(now).date;
  const closedToday = shop.closedOn === today;
  const [hasPermit, setHasPermit] = useState<boolean | null>(null);

  useEffect(() => {
    getDoc(doc(firebase().db, 'shops', shop.id, 'private', 'info'))
      .then((s) => setHasPermit(!!s.get('permitPath')))
      .catch(() => setHasPermit(null));
  }, [shop.id]);

  const needsQr = shop.paymentMethods.some((m) => m === 'gcash' || m === 'maya');
  const checklist: { done: boolean; label: string; href: string }[] = [
    { done: (menu?.length ?? 0) >= 3, label: t('dash.checkMenu'), href: '/shop/menu' },
    { done: DAYS.some((d) => (shop.hours[d]?.length ?? 0) > 0), label: t('dash.checkHours'), href: '/shop/hours' },
    { done: shop.photos.length > 0, label: t('dash.checkPhotos'), href: '/shop/profile' },
    ...(needsQr ? [{ done: !!(shop.gcashQrUrl || shop.mayaQrUrl), label: t('dash.checkQr'), href: '/shop/profile' }] : []),
    { done: !!hasPermit, label: t('dash.checkPermit'), href: '/shop/profile' },
  ];

  return (
    <div className="space-y-5">
      <PageTitle>{shop.name}</PageTitle>
      <StatusBanner
        status={shop.status !== 'active' ? 'suspended' : shop.verified ? 'live' : shop.verificationStatus}
        note={(shop as { verificationNote?: string }).verificationNote}
      />

      {shop.planCode && shop.planCode !== 'shop_basic' && (shop.subscriptionStatus === 'grace' || shop.subscriptionStatus === 'lapsed') && (
        <Link href="/shop/subscription" className="block rounded-2xl border-2 border-danger bg-danger/10 p-4 font-semibold">
          {shop.subscriptionStatus === 'grace' ? tp('status.grace') : tp('lapsedShop')}
        </Link>
      )}

      <section className="card space-y-4">
        <OpenStatusText hours={shop.hours} closedOn={shop.closedOn} />

        <label className="flex min-h-12 items-center justify-between gap-3">
          <span>
            <span className="block font-semibold">{t('dash.closedTodayLabel')}</span>
            <span className="block text-muted">{t('dash.closedTodayHint')}</span>
          </span>
          <Switch checked={closedToday} onChange={(on) => updateShop(shop.id, { closedOn: on ? today : null })} />
        </label>

        <fieldset>
          <legend className="label">{t('dash.busyLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {[0, ...BUSY_OPTIONS].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={shop.busyMinutes === m}
                className={`chip ${shop.busyMinutes === m ? 'chip-active' : ''}`}
                onClick={() => updateShop(shop.id, { busyMinutes: m })}
              >
                {m === 0 ? t('dash.busyOff') : t('dash.busyPlus', { minutes: m })}
              </button>
            ))}
          </div>
          <p className="mt-2 text-muted">{t('dash.prepEstimate', { minutes: estimatedPrepMinutes(shop) })}</p>
        </fieldset>
      </section>

      {!shop.verified && (
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

function StatusBanner({ status, note }: { status: 'live' | 'pending' | 'approved' | 'rejected' | 'suspended'; note?: string }) {
  const t = useTranslations('shop.dash');
  const box = (cls: string, title: string, body?: ReactNode) => (
    <section className={`rounded-2xl p-4 ${cls}`} role="status">
      <p className="font-bold">{title}</p>
      {body && <p className="mt-1">{body}</p>}
    </section>
  );
  if (status === 'live' || status === 'approved') return box('bg-ok text-white', t('liveTitle'));
  if (status === 'suspended') return box('bg-danger text-white', t('suspendedTitle'), t('suspendedBody'));
  if (status === 'rejected') return box('bg-warn', t('rejectedTitle'), note || t('rejectedBody'));
  return box('bg-warn/30 border-2 border-warn', t('pendingTitle'), t('pendingBody'));
}
