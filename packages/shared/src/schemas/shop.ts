import { z } from 'zod';
import { ADDRESS_LIMITS } from '../addresses';
import { DAYS, dayRangesProblem, TIME_RE } from '../hours';
import { MENU_LIMITS } from '../menu';
import { isPhMobileE164 } from '../phone';
import { PAYMENT_METHODS, SHOP_CATEGORIES, SHOP_LIMITS } from '../shops';
import { latLngSchema } from './places';

const peso = (max: number) => z.number().int('whole_pesos').min(0, 'negative_price').max(max, 'price_too_high');

/** Shop fields set at registration and later on the profile page. */
const shopProfileFields = {
  name: z.string().trim().min(2, 'shop_name_required').max(SHOP_LIMITS.nameMax, 'shop_name_too_long'),
  category: z.enum(SHOP_CATEGORIES),
  description: z.string().trim().max(SHOP_LIMITS.descriptionMax, 'description_too_long').default(''),
  contactPhone: z.string().refine(isPhMobileE164, 'bad_phone'),
  barangayId: z.string().min(1, 'barangay_required'),
  street: z.string().trim().max(ADDRESS_LIMITS.streetMax).default(''),
  landmark: z.string().trim().min(ADDRESS_LIMITS.landmarkMin, 'landmark_required').max(ADDRESS_LIMITS.landmarkMax),
  geo: latLngSchema,
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1, 'payment_required').max(PAYMENT_METHODS.length),
  hasOwnRider: z.boolean().default(false),
  selfDeliveryFee: peso(SHOP_LIMITS.selfDeliveryFeeMax).default(0),
  prepMinutes: z.number().int().min(0).max(SHOP_LIMITS.prepMinutesMax).default(20),
};

/** Input of the registerShop callable. */
export const registerShopInput = z.object({ townId: z.string().min(1), ...shopProfileFields });
export type RegisterShopInput = z.input<typeof registerShopInput>;

/** Client-side validation of the shop profile form (rules enforce types and limits too). */
export const shopProfileInput = z.object(shopProfileFields);

const timeRange = z.object({ open: z.string().regex(TIME_RE, 'bad_time'), close: z.string().regex(TIME_RE, 'bad_time') });

export const weeklyHoursSchema = z
  .partialRecord(z.enum(DAYS), z.array(timeRange))
  .superRefine((hours, ctx) => {
    for (const d of DAYS) {
      const problem = dayRangesProblem(hours[d] ?? []);
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: [d] });
    }
  });

const optionName = z.string().trim().min(1, 'option_name_required').max(MENU_LIMITS.optionNameMax);
const uniqueNames = (list: { name: string }[]) => new Set(list.map((x) => x.name.toLowerCase())).size === list.length;

/** A menu item as the shop edits it. */
export const menuItemInput = z.object({
  name: z.string().trim().min(1, 'item_name_required').max(MENU_LIMITS.nameMax),
  description: z.string().trim().max(MENU_LIMITS.descriptionMax).default(''),
  category: z.string().trim().min(1, 'category_required').max(MENU_LIMITS.categoryMax),
  price: peso(MENU_LIMITS.priceMax),
  photoUrl: z.string().url().nullable().default(null),
  variants: z
    .array(z.object({ name: optionName, price: peso(MENU_LIMITS.priceMax) }))
    .max(MENU_LIMITS.variantsMax)
    .refine(uniqueNames, 'duplicate_option')
    .refine((v) => v.length !== 1, 'one_variant')
    .default([]),
  addOns: z
    .array(z.object({ name: optionName, price: peso(MENU_LIMITS.priceMax) }))
    .max(MENU_LIMITS.addOnsMax)
    .refine(uniqueNames, 'duplicate_option')
    .default([]),
  available: z.boolean().default(true),
});
export type MenuItemInput = z.input<typeof menuItemInput>;
