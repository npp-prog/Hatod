'use client';

import { formatPHP, MENU_LIMITS, startingPrice } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useShop } from '@/components/shop/ShopProvider';
import { FieldError, PageTitle, Spinner, Switch } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { renameCategory, setItemAvailable, updateShop, type MenuItem } from '@/lib/data/shops';

export function MenuManager() {
  const t = useTranslations('shop.menu');
  const tc = useTranslations('common');
  const { shop, menu } = useShop();
  const [newCat, setNewCat] = useState('');
  const [catError, setCatError] = useState<string | null>(null);

  if (!menu) return <Spinner label={tc('loading')} />;

  const cats = shop.menuCategories;
  const exists = (name: string) => cats.some((c) => c.toLowerCase() === name.trim().toLowerCase());
  // Items whose category was removed elsewhere still show, under "Other".
  const orphans = menu.filter((i) => !cats.includes(i.category));

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    if (exists(name)) return setCatError(t('categoryExists'));
    setCatError(null);
    await updateShop(shop.id, { menuCategories: [...cats, name.slice(0, MENU_LIMITS.categoryMax)] });
    setNewCat('');
  }

  async function move(idx: number, dir: -1 | 1) {
    const next = [...cats];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    await updateShop(shop.id, { menuCategories: next });
  }

  async function rename(name: string) {
    const to = window.prompt(t('renameTo', { name }), name)?.trim();
    if (!to || to === name) return;
    if (exists(to)) return setCatError(t('categoryExists'));
    setCatError(null);
    await renameCategory(shop, menu!, name, to.slice(0, MENU_LIMITS.categoryMax));
  }

  async function remove(name: string) {
    if (menu!.some((i) => i.category === name)) return setCatError(t('categoryNotEmpty', { name }));
    setCatError(null);
    await updateShop(shop.id, { menuCategories: cats.filter((c) => c !== name) });
  }

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>

      <section className="card space-y-3" aria-labelledby="cats-title">
        <h2 id="cats-title" className="text-lg font-bold">
          {t('categoriesTitle')}
        </h2>
        {cats.length > 0 && (
          <ul className="divide-y divide-line">
            {cats.map((c, i) => (
              <li key={c} className="flex flex-wrap items-center gap-1 py-2">
                <span className="mr-auto font-semibold">{c}</span>
                <span className="text-muted">{t('itemCount', { count: menu.filter((m) => m.category === c).length })}</span>
                <button type="button" className="btn-ghost px-2" aria-label={t('moveUp', { name: c })} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2"
                  aria-label={t('moveDown', { name: c })}
                  disabled={i === cats.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button type="button" className="btn-ghost px-2" onClick={() => rename(c)}>
                  {t('rename')}
                </button>
                <button type="button" className="btn-ghost px-2 text-danger" aria-label={t('deleteCategory', { name: c })} onClick={() => remove(c)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addCategory} className="flex gap-2">
          <input
            className="input"
            aria-label={t('categoryPlaceholder')}
            placeholder={t('categoryPlaceholder')}
            maxLength={MENU_LIMITS.categoryMax}
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button className="btn-secondary" disabled={!newCat.trim() || cats.length >= MENU_LIMITS.categoriesMax}>
            {t('addCategory')}
          </button>
        </form>
        {catError && <FieldError id="cat-error">{catError}</FieldError>}
      </section>

      {cats.length === 0 ? (
        <p className="card">{t('addCategoryFirst')}</p>
      ) : (
        <Link href="/shop/menu/item" className="btn-primary w-full">
          {t('addItem')}
        </Link>
      )}

      {menu.length === 0 && cats.length > 0 && <p className="card">{t('empty')}</p>}

      {[...cats, ...(orphans.length ? [null] : [])].map((c) => {
        const items = c === null ? orphans : menu.filter((i) => i.category === c);
        if (items.length === 0) return null;
        return (
          <section key={c ?? '__other'} aria-label={c ?? t('uncategorized')}>
            <h2 className="mb-2 text-lg font-bold">{c ?? t('uncategorized')}</h2>
            <ul className="space-y-2">
              {items.map((item) => (
                <ItemRow key={item.id} shopId={shop.id} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ItemRow({ shopId, item }: { shopId: string; item: MenuItem }) {
  const t = useTranslations('shop.menu');
  const price = item.variants.length ? t('from', { price: formatPHP(startingPrice(item)) }) : formatPHP(item.price);
  return (
    <li className={`card flex items-center gap-3 p-3 ${item.available ? '' : 'opacity-70'}`}>
      {item.photoUrl ? (
        // Small thumbnail of an already-compressed upload; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photoUrl} alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <span aria-hidden className="size-14 shrink-0 rounded-lg bg-page" />
      )}
      <Link href={`/shop/menu/item?id=${item.id}`} className="mr-auto min-w-0" aria-label={t('editItem', { name: item.name })}>
        <span className="block truncate font-semibold">{item.name}</span>
        <span className="block text-muted">
          {price}
          {!item.available && <> · {t('soldOut')}</>}
        </span>
      </Link>
      <span className="flex flex-col items-center gap-1 text-sm">
        <Switch
          checked={item.available}
          label={item.available ? t('available') : t('soldOut')}
          onChange={(on) => setItemAvailable(shopId, item.id, on)}
        />
        <span aria-hidden>{item.available ? t('available') : t('soldOut')}</span>
      </span>
    </li>
  );
}
