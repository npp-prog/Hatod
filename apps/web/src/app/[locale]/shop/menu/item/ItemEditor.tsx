'use client';

import { MENU_LIMITS, menuItemInput, type AddOn } from '@hatod/shared';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toInt } from '@/components/shop/ShopBasicsFields';
import { useShop } from '@/components/shop/ShopProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { deleteMenuItem, deleteShopImage, saveMenuItem, uploadShopImage } from '@/lib/data/shops';

type Row = { name: string; price: string };
const KNOWN = new Set([
  'item_name_required',
  'category_required',
  'whole_pesos',
  'negative_price',
  'price_too_high',
  'option_name_required',
  'duplicate_option',
  'one_variant',
  'image_too_large',
]);

export function ItemEditor() {
  const t = useTranslations('shop.item');
  const tc = useTranslations('common');
  const router = useRouter();
  const id = useSearchParams().get('id') ?? undefined;
  const { shop, menu } = useShop();
  const existing = id ? menu?.find((m) => m.id === id) : undefined;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(shop.menuCategories[0] ?? '');
  const [price, setPrice] = useState('');
  const [sizes, setSizes] = useState<Row[]>([]);
  const [addOns, setAddOns] = useState<Row[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    setName(existing.name);
    setDescription(existing.description);
    setCategory(existing.category);
    setPrice(String(existing.price));
    setSizes(existing.variants.map((v) => ({ name: v.name, price: String(v.price) })));
    setAddOns(existing.addOns.map((a) => ({ name: a.name, price: String(a.price) })));
    setPhotoUrl(existing.photoUrl);
    setAvailable(existing.available);
  }, [existing]);

  const toOptions = (rows: Row[]): AddOn[] => rows.map((r) => ({ name: r.name.trim(), price: toInt(r.price) }));
  const errText = (code: string) => t(`errors.${(KNOWN.has(code) ? code : 'generic') as 'generic'}`);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadShopImage(shop.id, file, 'item', 800);
      if (photoUrl && photoUrl !== existing?.photoUrl) void deleteShopImage(photoUrl);
      setPhotoUrl(url);
    } catch (e) {
      setError(errText(e instanceof Error ? e.message : 'generic'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const variants = toOptions(sizes);
    // With sizes, the base price is the cheapest size (used for sorting and "from ₱…").
    const base = variants.length ? Math.min(...variants.map((v) => (Number.isFinite(v.price) ? v.price : Infinity))) : toInt(price);
    const parsed = menuItemInput.safeParse({
      name,
      description,
      category,
      price: Number.isFinite(base) ? base : NaN,
      photoUrl,
      variants,
      addOns: toOptions(addOns),
      available,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const code = issue?.message ?? 'generic';
      setError(errText(KNOWN.has(code) ? code : issue?.path.includes('price') ? 'whole_pesos' : code));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sortOrder = existing?.sortOrder ?? (menu?.length ? Math.max(...menu.map((m) => m.sortOrder)) + 1 : 1);
      await saveMenuItem(shop.id, parsed.data as Required<typeof parsed.data>, { id, sortOrder });
      if (existing?.photoUrl && existing.photoUrl !== photoUrl) void deleteShopImage(existing.photoUrl);
      router.push('/shop/menu');
    } catch {
      setError(errText('generic'));
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !window.confirm(t('confirmDelete'))) return;
    await deleteMenuItem(shop.id, existing.id);
    if (existing.photoUrl) void deleteShopImage(existing.photoUrl);
    router.push('/shop/menu');
  }

  if (id && !menu) return <Spinner label={tc('loading')} />;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <PageTitle>{id ? t('editTitle') : t('newTitle')}</PageTitle>

      <div className="card space-y-5">
        <div>
          <label htmlFor="itemName" className="label">
            {t('nameLabel')}
          </label>
          <input id="itemName" className="input" maxLength={MENU_LIMITS.nameMax} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="itemCategory" className="label">
            {t('categoryLabel')}
          </label>
          <select id="itemCategory" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {!shop.menuCategories.includes(category) && category && <option value={category}>{category}</option>}
            {shop.menuCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="itemDesc" className="label">
            {t('descriptionLabel')}
          </label>
          <textarea
            id="itemDesc"
            className="input min-h-20 py-3"
            maxLength={MENU_LIMITS.descriptionMax}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {sizes.length === 0 ? (
          <div>
            <label htmlFor="itemPrice" className="label">
              {t('priceLabel')}
            </label>
            <input
              id="itemPrice"
              className="input w-40"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        ) : (
          <p className="text-muted">{t('priceHintSizes')}</p>
        )}
      </div>

      <OptionRows
        title={t('sizesTitle')}
        hint={t('sizesHint')}
        addLabel={t('addSize')}
        nameLabel={t('sizeName')}
        rows={sizes}
        onChange={setSizes}
        max={MENU_LIMITS.variantsMax}
        idPrefix="size"
      />
      <OptionRows
        title={t('addOnsTitle')}
        hint={t('addOnsHint')}
        addLabel={t('addAddOn')}
        nameLabel={t('addOnName')}
        rows={addOns}
        onChange={setAddOns}
        max={MENU_LIMITS.addOnsMax}
        idPrefix="addon"
      />

      <section className="card space-y-3" aria-labelledby="photo-title">
        <h2 id="photo-title" className="label">
          {t('photoLabel')}
        </h2>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="aspect-square w-40 rounded-xl object-cover" />
        )}
        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary cursor-pointer">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
            {uploading ? t('uploading') : photoUrl ? t('changePhoto') : t('addPhoto')}
          </label>
          {photoUrl && (
            <button type="button" className="btn-ghost text-danger" onClick={() => setPhotoUrl(null)}>
              {t('removePhoto')}
            </button>
          )}
        </div>
      </section>

      <label className="card flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-6 accent-brand" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
        <span className="font-semibold">{t('availableLabel')}</span>
      </label>

      {error && <FieldError id="item-error">{error}</FieldError>}

      <div className="flex flex-wrap gap-3">
        <Link href="/shop/menu" className="btn-ghost">
          {tc('cancel')}
        </Link>
        <button type="submit" className="btn-primary flex-1" disabled={busy || uploading}>
          {busy ? tc('saving') : tc('save')}
        </button>
      </div>
      {existing && (
        <button type="button" className="btn-ghost w-full text-danger" onClick={remove}>
          {t('deleteItem')}
        </button>
      )}
    </form>
  );
}

function OptionRows({
  title,
  hint,
  addLabel,
  nameLabel,
  rows,
  onChange,
  max,
  idPrefix,
}: {
  title: string;
  hint: string;
  addLabel: string;
  nameLabel: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  max: number;
  idPrefix: string;
}) {
  const t = useTranslations('shop.item');
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="card space-y-3">
      <legend className="label float-left">{title}</legend>
      <p className="clear-both text-muted">{hint}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor={`${idPrefix}-name-${i}`} className="text-sm text-muted">
              {nameLabel}
            </label>
            <input
              id={`${idPrefix}-name-${i}`}
              className="input"
              maxLength={MENU_LIMITS.optionNameMax}
              value={r.name}
              onChange={(e) => set(i, { name: e.target.value })}
            />
          </div>
          <div className="w-28">
            <label htmlFor={`${idPrefix}-price-${i}`} className="text-sm text-muted">
              {t('optionPrice')}
            </label>
            <input
              id={`${idPrefix}-price-${i}`}
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={r.price}
              onChange={(e) => set(i, { price: e.target.value })}
            />
          </div>
          <button
            type="button"
            className="btn-ghost px-3 text-danger"
            aria-label={t('remove', { name: r.name || nameLabel })}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="btn-secondary" onClick={() => onChange([...rows, { name: '', price: '' }])}>
          {addLabel}
        </button>
      )}
    </fieldset>
  );
}
