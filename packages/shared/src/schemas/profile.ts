import { z } from 'zod';
import { ROLES } from '../roles';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal';
import { SUPPORTED_LOCALES } from '../locales';

/** Input of the completeProfile callable (first sign-in). */
export const completeProfileInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'name_too_short')
    .max(60, 'name_too_long'),
  acceptTerms: z.literal(true, { error: 'consent_required' }),
  termsVersion: z.literal(TERMS_VERSION),
  privacyVersion: z.literal(PRIVACY_VERSION),
  locale: z.enum(SUPPORTED_LOCALES).default('en'),
});
export type CompleteProfileInput = z.input<typeof completeProfileInput>;

/** Input of the setUserRoles callable (admin only). */
export const setUserRolesInput = z
  .object({
    uid: z.string().min(1).max(128),
    roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
    coordTowns: z.array(z.string().min(1).max(64)).max(20).default([]),
  })
  .refine((v) => v.roles.includes('customer'), {
    message: 'customer_role_required',
    path: ['roles'],
  })
  .refine((v) => v.roles.includes('coordinator') || v.coordTowns.length === 0, {
    message: 'coord_towns_without_role',
    path: ['coordTowns'],
  });
export type SetUserRolesInput = z.input<typeof setUserRolesInput>;
