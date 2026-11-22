import { describe, expect, it } from 'vitest';
import {
  accessibleAreas,
  areaForPath,
  canAccessArea,
  claimsFromToken,
  defaultLandingPath,
  normalizeRoles,
  safeNextPath,
} from '../src';

describe('normalizeRoles', () => {
  it('drops unknown values, dedupes and orders canonically', () => {
    expect(normalizeRoles(['admin', 'x', 'customer', 'admin', 3])).toEqual(['customer', 'admin']);
  });
  it('handles null', () => {
    expect(normalizeRoles(null)).toEqual([]);
  });
});

describe('canAccessArea', () => {
  it('lets anyone browse the customer area', () => {
    expect(canAccessArea([], 'customer')).toBe(true);
    expect(canAccessArea(undefined, 'customer')).toBe(true);
  });
  it('restricts shop and rider areas to their role', () => {
    expect(canAccessArea(['customer'], 'shop')).toBe(false);
    expect(canAccessArea(['customer', 'shop'], 'shop')).toBe(true);
    expect(canAccessArea(['customer', 'shop'], 'rider')).toBe(false);
    expect(canAccessArea(['customer', 'rider'], 'rider')).toBe(true);
  });
  it('does not give admins shop or rider areas they do not own', () => {
    expect(canAccessArea(['admin'], 'shop')).toBe(false);
    expect(canAccessArea(['admin'], 'rider')).toBe(false);
  });
  it('lets admins into the coordinator area', () => {
    expect(canAccessArea(['admin'], 'coordinator')).toBe(true);
    expect(canAccessArea(['coordinator'], 'coordinator')).toBe(true);
    expect(canAccessArea(['coordinator'], 'admin')).toBe(false);
  });
});

describe('accessibleAreas', () => {
  it('lists areas in display order', () => {
    expect(accessibleAreas(['customer', 'rider', 'shop'])).toEqual(['customer', 'shop', 'rider']);
    expect(accessibleAreas(['customer', 'admin'])).toEqual(['customer', 'coordinator', 'admin']);
  });
});

describe('defaultLandingPath', () => {
  it('prefers work roles', () => {
    expect(defaultLandingPath(['customer'])).toBe('/');
    expect(defaultLandingPath(['customer', 'rider'])).toBe('/rider');
    expect(defaultLandingPath(['customer', 'rider', 'shop'])).toBe('/shop');
    expect(defaultLandingPath(['customer', 'coordinator'])).toBe('/coordinator');
    expect(defaultLandingPath(['customer', 'admin', 'shop'])).toBe('/admin');
  });
  it('falls back to customer home', () => {
    expect(defaultLandingPath([])).toBe('/');
  });
});

describe('areaForPath', () => {
  it('maps paths to areas', () => {
    expect(areaForPath('/')).toBe('customer');
    expect(areaForPath('/shop/menu')).toBe('shop');
    expect(areaForPath('/rider')).toBe('rider');
    expect(areaForPath('/coordinator/verify')).toBe('coordinator');
    expect(areaForPath('/admin')).toBe('admin');
    expect(areaForPath('/shops/abc')).toBe('customer');
  });
});

describe('safeNextPath', () => {
  it('accepts local paths', () => {
    expect(safeNextPath('/shop/menu')).toBe('/shop/menu');
  });
  it('rejects external and protocol-relative targets', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath(null, '/rider')).toBe('/rider');
  });
});

describe('claimsFromToken', () => {
  it('reads roles and coordinator towns defensively', () => {
    expect(claimsFromToken({ roles: ['shop', 'bogus', 'customer'], coordTowns: ['t1', 2], shops: ['s1'] })).toEqual({
      roles: ['customer', 'shop'],
      coordTowns: ['t1'],
      shops: ['s1'],
    });
    expect(claimsFromToken({})).toEqual({ roles: [], coordTowns: [], shops: [] });
    expect(claimsFromToken(null)).toEqual({ roles: [], coordTowns: [], shops: [] });
  });
});
