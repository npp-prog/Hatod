import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { z } from 'zod';
import { claimsFromToken, hasRole, type HatodClaims, type Role } from '@hatod/shared';

export interface Caller {
  uid: string;
  phone: string | null;
  claims: HatodClaims;
}

export function requireAuth(req: CallableRequest<unknown>): Caller {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign_in_required');
  const token = req.auth.token as unknown as Record<string, unknown>;
  return {
    uid: req.auth.uid,
    phone: typeof token.phone_number === 'string' ? token.phone_number : null,
    claims: claimsFromToken(token),
  };
}

export function requireRole(req: CallableRequest<unknown>, role: Role): Caller {
  const caller = requireAuth(req);
  if (!hasRole(caller.claims.roles, role)) throw new HttpsError('permission-denied', `role_required:${role}`);
  return caller;
}

/** Validates callable input with a shared zod schema; errors carry field paths and message codes. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpsError('invalid-argument', 'invalid_input', {
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), code: i.message })),
    });
  }
  return r.data;
}
