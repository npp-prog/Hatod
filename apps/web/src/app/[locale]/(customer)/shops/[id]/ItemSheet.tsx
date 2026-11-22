'use client';

import { CART_LIMITS, formatPHP, itemUnitPrice } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/components/CartProvider';
import { useLowData } from '@/components/LowDataProvider';
import type { MenuItem, Shop } from '@/lib/data/shops';

/** Bottom sheet (native <dialog>) to pick size, add-ons, quantity and a note. */
export function ItemSheet({ shop, item, onClose, onAdded }: { shop: Shop; item: MenuItem; onClose: () => void; onAdded: () => void }) {
  const t = useTranslations('shopPage');
  const { lowData } = useLowData();
  const { cart, addLine, replaceWith } = useCart();
  const ref = useRef<HTMLDialogElement>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [addOns, setAddOns] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [confirmOther, setConfirmOther] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const unit = itemUnitPrice(item, variant, addOns);
  const ready = unit !== null;

  function add(force = false) {
    if (unit === null) return;
    if (!force && cart.shopId && cart.shopId !== shop.id) return setConfirmOther(true);
    const line = { itemId: item.id, name: item.name, variant, addOns, qty, note, unitPrice: unit };
    const target = { id: shop.id, name: shop.name, townId: shop.townId };
    if (force) replaceWith(target, line);
    else addLine(target, line);
    onAdded();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-3xl p-0 backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-3xl"
      aria-labelledby="sheet-title"
    >
      <div className="space-y-5 p-5">
        {!lowData && item.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photoUrl} alt="" className="aspect-video w-full rounded-2xl object-cover" />
        )}
        <div className="flex items-start gap-3">
          <h2 id="sheet-title" className="mr-auto text-xl font-bold">
            {item.name}
          </h2>
          <button type="button" className="btn-ghost px-3" aria-label={t('close')} onClick={() => ref.current?.close()}>
            ✕
          </button>
        </div>
        {item.description && <p className="text-muted">{item.description}</p>}

        {confirmOther ? (
          <div className="space-y-3 rounded-2xl border-2 border-warn p-4" role="alertdialog" aria-labelledby="other-title">
            <p id="other-title" className="font-bold">
              {t('otherShopTitle')}
            </p>
            <p>{t('otherShopBody', { shop: cart.shopName ?? '' })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => add(true)}>
                {t('otherShopConfirm')}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setConfirmOther(false)}>
                {t('close')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {item.variants.length > 0 && (
              <fieldset>
                <legend className="label">{t('chooseSize')}</legend>
                <ul className="space-y-1">
                  {item.variants.map((v) => (
                    <li key={v.name}>
                      <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-3 has-[:checked]:border-brand">
                        <input type="radio" name="size" className="size-6 accent-brand" checked={variant === v.name} onChange={() => setVariant(v.name)} />
                        <span className="flex-1">{v.name}</span>
                        <span className="font-semibold">{formatPHP(v.price)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            {item.addOns.length > 0 && (
              <fieldset>
                <legend className="label">{t('addOns')}</legend>
                <ul className="space-y-1">
                  {item.addOns.map((a) => (
                    <li key={a.name}>
                      <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-3 has-[:checked]:border-brand">
                        <input
                          type="checkbox"
                          className="size-6 accent-brand"
                          checked={addOns.includes(a.name)}
                          onChange={(e) => setAddOns(e.target.checked ? [...addOns, a.name] : addOns.filter((x) => x !== a.name))}
                        />
                        <span className="flex-1">{a.name}</span>
                        <span>+{formatPHP(a.price)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <div>
              <label htmlFor="note" className="label">
                {t('note')}
              </label>
              <input
                id="note"
                className="input"
                maxLength={CART_LIMITS.noteMax}
                placeholder={t('notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="label mb-0 mr-auto">{t('quantity')}</span>
              <button type="button" className="btn-secondary size-12 px-0 text-2xl" aria-label={t('less')} disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
                −
              </button>
              <output className="w-10 text-center text-xl font-bold" aria-live="polite">
                {qty}
              </output>
              <button
                type="button"
                className="btn-secondary size-12 px-0 text-2xl"
                aria-label={t('more')}
                disabled={qty >= CART_LIMITS.qtyMax}
                onClick={() => setQty(qty + 1)}
              >
                +
              </button>
            </div>
            <button type="button" className="btn-primary w-full" disabled={!ready} onClick={() => add()}>
              {ready ? t('addToCart', { price: formatPHP(unit! * qty) }) : t('chooseSize')}
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
