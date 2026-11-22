/**
 * Roles and role-based routing. A person can hold several roles
 * (for example a shop owner who also orders as a customer).
 */
export const ROLES = ['customer', 'shop', 'rider', 'coordinator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** App areas. Each maps to a top-level route segment under the locale. */
export const AREAS = ['customer', 'shop', 'rider', 'coordinator', 'admin'] as const;
export type Area = (typeof AREAS)[number];

/** Path (without locale prefix) of each area's home screen. */
export const AREA_HOME: Record<Area, string> = {
  customer: '/',
  shop: '/shop',
  rider: '/rider',
  coordinator: '/coordinator',
  admin: '/admin',
};

/** Order in which a user's default landing area is chosen: work roles first. */
const LANDING_PRIORITY: readonly Role[] = ['admin', 'coordinator', 'shop', 'rider', 'customer'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Keeps only known roles, removes duplicates, and returns them in canonical order. */
export function normalizeRoles(values: readonly unknown[] | null | undefined): Role[] {
  if (!values) return [];
  const set = new Set(values.filter(isRole));
  return ROLES.filter((r) => set.has(r));
}

export function hasRole(roles: readonly Role[] | null | undefined, role: Role): boolean {
  return !!roles && roles.includes(role);
}

/**
 * Who may open an area.
 * - customer area: anyone (browsing is public; ordering needs sign-in, checked per page)
 * - shop / rider: only holders of that role
 * - coordinator: coordinators and admins
 * - admin: admins only
 */
export function canAccessArea(roles: readonly Role[] | null | undefined, area: Area): boolean {
  switch (area) {
    case 'customer':
      return true;
    case 'shop':
      return hasRole(roles, 'shop');
    case 'rider':
      return hasRole(roles, 'rider');
    case 'coordinator':
      return hasRole(roles, 'coordinator') || hasRole(roles, 'admin');
    case 'admin':
      return hasRole(roles, 'admin');
  }
}

/** Areas to show in the role switcher, in display order. */
export function accessibleAreas(roles: readonly Role[] | null | undefined): Area[] {
  return AREAS.filter((a) => canAccessArea(roles, a));
}

/** Where to send a user right after sign-in. */
export function defaultLandingPath(roles: readonly Role[] | null | undefined): string {
  const top = LANDING_PRIORITY.find((r) => hasRole(roles, r));
  return top ? AREA_HOME[top] : AREA_HOME.customer;
}

/** Area that a locale-less pathname belongs to. */
export function areaForPath(pathname: string): Area {
  const seg = pathname.split('/').filter(Boolean)[0];
  if (seg === 'shop' || seg === 'rider' || seg === 'coordinator' || seg === 'admin') return seg;
  return 'customer';
}

/**
 * Validates a post-sign-in redirect target. Only same-site absolute paths are
 * allowed, so a crafted ?next= link cannot send people to another website.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

/** Shape of the Firebase Auth custom claims Hatod sets. Kept small: claims ride on every request. */
export interface HatodClaims {
  roles: Role[];
  /** Towns a coordinator manages. Empty for everyone else. */
  coordTowns?: string[];
  /** Shops this person owns; lets Storage rules check ownership without a Firestore read. */
  shops?: string[];
}

export function claimsFromToken(token: Record<string, unknown> | null | undefined): HatodClaims {
  const roles = normalizeRoles(Array.isArray(token?.roles) ? token.roles : []);
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []);
  return { roles, coordTowns: strings(token?.coordTowns), shops: strings(token?.shops) };
}
