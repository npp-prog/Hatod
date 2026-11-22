export const SHOP_CATEGORIES = ['meals', 'snacks', 'drinks', 'bakery', 'groceries'] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** How customers can pay the shop directly. Hatod never touches the money. */
export const PAYMENT_METHODS = ['cash', 'gcash', 'maya'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHOP_LIMITS = {
  nameMax: 60,
  descriptionMax: 300,
  photosMax: 3,
  prepMinutesMax: 180,
  busyMinutesMax: 120,
  selfDeliveryFeeMax: 1000,
} as const;

/** Extra minutes a shop can add with the "busy" switch. */
export const BUSY_OPTIONS = [15, 30, 45, 60] as const;

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

/** Estimated prep time shown to customers. */
export function estimatedPrepMinutes(shop: { prepMinutes: number; busyMinutes: number }): number {
  return shop.prepMinutes + shop.busyMinutes;
}

/** Image limits; the app compresses before upload and storage rules enforce these. */
export const IMAGE_LIMITS = {
  publicMaxBytes: 300 * 1024,
  targetBytes: 100 * 1024,
  privateMaxBytes: 5 * 1024 * 1024,
} as const;
