import { openStatus, type WeeklyHours } from './hours';

/** Server-maintained summary of a shop's menu, for listing and dish search. */
export interface MenuSummary {
  itemCount: number;
  availableCount: number;
  minPrice: number | null;
  /** Lower-cased words from item names and categories. */
  searchTerms: string[];
}

export function menuSummary(items: { name: string; category: string; price: number; available: boolean; variants: { price: number }[] }[]): MenuSummary {
  const terms = new Set<string>();
  for (const it of items) for (const w of searchWords(`${it.name} ${it.category}`)) terms.add(w);
  const prices = items.filter((i) => i.available).map((i) => (i.variants.length ? Math.min(...i.variants.map((v) => v.price)) : i.price));
  return {
    itemCount: items.length,
    availableCount: items.filter((i) => i.available).length,
    minPrice: prices.length ? Math.min(...prices) : null,
    searchTerms: [...terms].sort().slice(0, 300),
  };
}

/** "Lechon Manok (Half)" -> ["lechon", "manok", "half"]; accents removed so "nino" finds "Niño". */
export function searchWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

/** A shop matches when every typed word starts a word in its name, category label or menu. */
export function shopMatches(shop: { name: string; menuSummary?: MenuSummary | null }, query: string, extra: string[] = []): boolean {
  const q = searchWords(query);
  if (q.length === 0) return true;
  const words = [...searchWords(shop.name), ...(shop.menuSummary?.searchTerms ?? []), ...extra.flatMap(searchWords)];
  return q.every((t) => words.some((w) => w.startsWith(t)));
}

/** Home-screen order: open shops first, then rating (with enough ratings), then name. */
export function sortShopsForHome<S extends { name: string; hours: WeeklyHours; closedOn: string | null; ratingAvg: number; ratingCount: number }>(
  shops: S[],
  now: Date,
): (S & { isOpen: boolean })[] {
  return shops
    .map((s) => ({ ...s, isOpen: openStatus(s, now).open }))
    .sort(
      (a, b) =>
        Number(b.isOpen) - Number(a.isOpen) ||
        (b.ratingCount >= 3 ? b.ratingAvg : 0) - (a.ratingCount >= 3 ? a.ratingAvg : 0) ||
        a.name.localeCompare(b.name),
    );
}
