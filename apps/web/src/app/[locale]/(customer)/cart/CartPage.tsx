'use client';

import { formatPHP, itemsTotal, openStatus } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useCart } from '@/components/CartProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useCartShop } from '@/lib/data/useCartShop';
import { useNow } from '@/lib/useNow';
import { useOpenText } from '../shops/[id]/ShopPage';

export function CartPage() {
  const t = useTranslations('cart');
  const tc = useTranslations('common');
  const { cart, ready, setQty, updatePrice, clear } = useCart();
  const { shop, menu, issues } = useCartShop();
  const now = useNow();
  const openText = useOpenText();

  if (!ready) return <Spinner label={tc('loading')} />;
  if (cart.lines.length === 0) {
    return (
      <div className="card space-y-3 text-center">
        <p>{t('empty')}</p>
        <Link href="/" className="btn-primary">
          {t('browse')}
        </Link>
      </div>
    );
  }

  const issueOf = (key: string) => issues.find((i) => i.key === key);
  const priceChanges = issues.filter((i) => i.problem === 'price_changed');
  const blocking = issues.filter((i) => i.problem !== 'price_changed');
  const status = shop ? openStatus(shop, now) : null;

  return (
    <div className="space-y-5 pb-28">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-1 text-muted">{t('from', { shop: cart.shopName ?? '' })}</p>
      </div>

      {status && !status.open && (
        <p className="rounded-2xl border-2 border-warn bg-warn/20 p-4" role="status">
          {t('shopClosed', { shop: cart.shopName ?? '', when: openText(status) })}
        </p>
      )}

      <ul className="space-y-2">
        {cart.lines.map((l) => {
          const issue = issueOf(l.key);
          return (
            <li key={l.key} className={`card space-y-2 p-3 ${issue && issue.problem !== 'price_changed' ? 'border-2 border-danger' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {l.name}
                    {l.variant ? ` (${l.variant})` : ''}
                  </p>
                  {l.addOns.length > 0 && <p className="text-sm text-muted">{l.addOns.map((a) => `+ ${a}`).join(', ')}</p>}
                  {l.note && <p className="text-sm text-muted">{t('note', { note: l.note })}</p>}
                </div>
                <p className="font-semibold">{formatPHP(l.unitPrice * l.qty)}</p>
              </div>
              {issue && (
                <p className={issue.problem === 'price_changed' ? 'text-sm font-semibold' : 'text-sm font-semibold text-danger'} role="alert">
                  {t(`issues.${issue.problem}`, { price: formatPHP(issue.newPrice ?? 0) })}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary size-12 px-0 text-xl"
                  aria-label={t('less', { name: l.name })}
                  onClick={() => setQty(l.key, l.qty - 1)}
                >
                  −
                </button>
                <output className="w-8 text-center font-bold">{l.qty}</output>
                <button
                  type="button"
                  className="btn-secondary size-12 px-0 text-xl"
                  aria-label={t('more', { name: l.name })}
                  onClick={() => setQty(l.key, l.qty + 1)}
                >
                  +
                </button>
                <button type="button" className="btn-ghost ml-auto text-danger" onClick={() => setQty(l.key, 0)} aria-label={t('remove', { name: l.name })}>
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {priceChanges.length > 0 && (
        <button type="button" className="btn-secondary w-full" onClick={() => priceChanges.forEach((i) => updatePrice(i.key, i.newPrice!))}>
          {t('acceptPrices')}
        </button>
      )}

      <div className="card flex justify-between text-lg font-bold">
        <span>{t('itemsTotal')}</span>
        <span>{formatPHP(itemsTotal(cart.lines))}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {cart.shopId && (
          <Link href={`/shops/${cart.shopId}`} className="btn-ghost">
            {t('addMore', { shop: cart.shopName ?? '' })}
          </Link>
        )}
        <button
          type="button"
          className="btn-ghost text-danger"
          onClick={() => {
            if (window.confirm(t('confirmClear'))) clear();
          }}
        >
          {t('clear')}
        </button>
      </div>

      {(blocking.length > 0 || priceChanges.length > 0) && <FieldError id="cart-error">{t('fixFirst')}</FieldError>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3">
        {blocking.length > 0 || priceChanges.length > 0 || !menu || shop === null ? (
          <span className="btn-primary mx-auto flex w-full max-w-3xl opacity-50" aria-disabled>
            {t('checkout')}
          </span>
        ) : (
          <Link href="/checkout" className="btn-primary mx-auto flex w-full max-w-3xl">
            {t('checkout')}
          </Link>
        )}
      </div>
    </div>
  );
}
