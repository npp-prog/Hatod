import { z } from 'zod';
import { RIDER_LIMITS, PLATE_RE, VEHICLE_TYPES, normalizePlate } from '../riders';
import { isPhMobileE164 } from '../phone';

const peso = (max: number, min = 0) => z.number().int('whole_pesos').min(min, 'negative_price').max(max, 'price_too_high');

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(2, 'contact_name_required').max(60),
  phone: z.string().refine(isPhMobileE164, 'bad_phone'),
  relation: z.string().trim().min(2, 'relation_required').max(30),
});

/** Input of the registerRider callable. */
export const registerRiderInput = z.object({
  townId: z.string().min(1),
  vehicleType: z.enum(VEHICLE_TYPES),
  vehicleDesc: z.string().trim().min(2, 'vehicle_desc_required').max(RIDER_LIMITS.vehicleDescMax),
  plateNo: z.string().transform(normalizePlate),
  emergencyContact: emergencyContactSchema,
}).superRefine((v, ctx) => {
  // Bicycles have no plate; everything with an engine needs one.
  if (v.vehicleType !== 'bicycle' && !PLATE_RE.test(v.plateNo)) ctx.addIssue({ code: 'custom', message: 'bad_plate', path: ['plateNo'] });
  if (v.vehicleType === 'bicycle' && v.plateNo !== '' && !PLATE_RE.test(v.plateNo)) ctx.addIssue({ code: 'custom', message: 'bad_plate', path: ['plateNo'] });
});
export type RegisterRiderInput = z.input<typeof registerRiderInput>;

export const rateCardSchema = z
  .object({
    base: peso(RIDER_LIMITS.baseMax),
    perKm: peso(RIDER_LIMITS.perKmMax),
    minimum: peso(RIDER_LIMITS.minimumMax),
    fixedFares: z
      .array(z.object({ fromBarangayId: z.string().min(1), toBarangayId: z.string().min(1), fee: peso(RIDER_LIMITS.fixedFareMax, 1) }))
      .max(RIDER_LIMITS.fixedFaresMax)
      .refine((list) => {
        const keys = list.map((f) => [f.fromBarangayId, f.toBarangayId].sort().join('|'));
        return new Set(keys).size === keys.length;
      }, 'duplicate_fixed_fare'),
    surcharges: z.object({
      night: z
        .object({ fromHour: z.number().int().min(0).max(23), untilHour: z.number().int().min(0).max(23), amount: peso(RIDER_LIMITS.surchargeMax, 1) })
        .refine((n) => n.fromHour !== n.untilHour, 'night_same_hours')
        .nullable(),
      rain: peso(RIDER_LIMITS.surchargeMax),
      extraStop: peso(RIDER_LIMITS.surchargeMax),
    }),
  })
  .refine((c) => c.base > 0 || c.perKm > 0 || c.minimum > 0 || c.fixedFares.length > 0, 'free_rate_card');

/** Input of the updateRateCard callable. */
export const updateRateCardInput = z.object({ rateCard: rateCardSchema });

/** Input of the updateServiceArea callable. */
export const updateServiceAreaInput = z.object({
  servedBarangayIds: z.array(z.string().min(1)).min(1, 'area_required').max(300),
  maxKm: z.number().min(1).max(RIDER_LIMITS.maxKmMax),
});
