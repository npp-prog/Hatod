import { z } from 'zod';
import { ADDRESS_LIMITS } from '../addresses';
import { isInPhilippines } from '../geo';
import { DEFAULT_TOWN_RADIUS_KM, TOWN_TIERS } from '../towns';

export const latLngSchema = z
  .object({ lat: z.number().finite(), lng: z.number().finite() })
  .refine(isInPhilippines, { message: 'outside_philippines' });

/** Input of the adminUpsertTown callable. Omit townId to create. */
export const upsertTownInput = z.object({
  // nullish: callable clients may send null for "not set"
  townId: z.string().min(3).max(130).nullish(),
  name: z.string().trim().min(2, 'town_name_required').max(60),
  province: z.string().trim().min(2, 'province_required').max(60),
  tier: z.enum(TOWN_TIERS).default('C'),
  isLive: z.boolean().default(false),
  /** Shops and riders may register before customers can see the town (pre-launch onboarding). */
  acceptingSignups: z.boolean().default(false),
  /** ISO date (YYYY-MM-DD), end of the free trial in Philippine time; null = no trial date yet. */
  trialEndsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'bad_date')
    .nullable()
    .default(null),
  center: latLngSchema,
  radiusKm: z.number().min(1).max(50).default(DEFAULT_TOWN_RADIUS_KM),
});
export type UpsertTownInput = z.input<typeof upsertTownInput>;

/** Input of the adminImportBarangays callable. */
export const importBarangaysInput = z.object({
  townId: z.string().min(3).max(130),
  csv: z.string().min(1).max(100_000),
});

/** Client-side form validation for a saved address (rules enforce the same limits). */
export const addressInput = z.object({
  label: z.string().trim().min(1, 'label_required').max(ADDRESS_LIMITS.labelMax, 'label_too_long'),
  barangayId: z.string().min(1, 'barangay_required'),
  street: z.string().trim().max(ADDRESS_LIMITS.streetMax, 'street_too_long').default(''),
  landmark: z
    .string()
    .trim()
    .min(ADDRESS_LIMITS.landmarkMin, 'landmark_required')
    .max(ADDRESS_LIMITS.landmarkMax, 'landmark_too_long'),
  geo: latLngSchema,
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressInput>;
