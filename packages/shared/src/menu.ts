/** A size or version of an item; its price replaces the base price. */
export interface Variant {
  name: string;
  price: number;
}
/** An extra on top of the item (extra rice, egg); its price is added. */
export interface AddOn {
  name: string;
  price: number;
}

export const MENU_LIMITS = {
  nameMax: 60,
  descriptionMax: 200,
  categoryMax: 40,
  categoriesMax: 20,
  variantsMax: 10,
  addOnsMax: 20,
  optionNameMax: 30,
  priceMax: 100_000,
  itemsMax: 200,
} as const;

/**
 * Unit price for one item with a chosen variant and add-ons. Returns null when
 * a choice is not on the item (stale cart, edited menu), so callers can refuse.
 */
export function itemUnitPrice(
  item: { price: number; variants: Variant[]; addOns: AddOn[] },
  variantName: string | null,
  addOnNames: string[],
): number | null {
  let price = item.price;
  if (item.variants.length > 0) {
    const v = item.variants.find((x) => x.name === variantName);
    if (!v) return null;
    price = v.price;
  } else if (variantName) return null;
  for (const name of addOnNames) {
    const a = item.addOns.find((x) => x.name === name);
    if (!a) return null;
    price += a.price;
  }
  return price;
}

/** "From ₱45" style starting price when an item has sizes. */
export function startingPrice(item: { price: number; variants: Variant[] }): number {
  return item.variants.length ? Math.min(...item.variants.map((v) => v.price)) : item.price;
}
