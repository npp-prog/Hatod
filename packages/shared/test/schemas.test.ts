import { describe, expect, it } from 'vitest';
import {
  completeProfileInput,
  formatPHP,
  PRIVACY_VERSION,
  setUserRolesInput,
  TERMS_VERSION,
} from '../src';

const valid = {
  name: '  Maria Santos ',
  acceptTerms: true,
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
};

describe('completeProfileInput', () => {
  it('accepts a valid profile and trims the name', () => {
    const r = completeProfileInput.parse(valid);
    expect(r.name).toBe('Maria Santos');
    expect(r.locale).toBe('en');
  });
  it('requires consent', () => {
    const r = completeProfileInput.safeParse({ ...valid, acceptTerms: false });
    expect(r.success).toBe(false);
  });
  it('rejects stale legal versions', () => {
    expect(completeProfileInput.safeParse({ ...valid, termsVersion: 'old' }).success).toBe(false);
  });
  it('rejects short names and unknown locales', () => {
    expect(completeProfileInput.safeParse({ ...valid, name: 'A' }).success).toBe(false);
    expect(completeProfileInput.safeParse({ ...valid, locale: 'xx' }).success).toBe(false);
  });
});

describe('setUserRolesInput', () => {
  it('accepts customer + shop', () => {
    expect(setUserRolesInput.safeParse({ uid: 'u1', roles: ['customer', 'shop'] }).success).toBe(true);
  });
  it('always keeps the customer role', () => {
    expect(setUserRolesInput.safeParse({ uid: 'u1', roles: ['shop'] }).success).toBe(false);
  });
  it('only allows coordinator towns with the coordinator role', () => {
    expect(
      setUserRolesInput.safeParse({ uid: 'u1', roles: ['customer'], coordTowns: ['t1'] }).success,
    ).toBe(false);
    expect(
      setUserRolesInput.safeParse({ uid: 'u1', roles: ['customer', 'coordinator'], coordTowns: ['t1'] })
        .success,
    ).toBe(true);
  });
  it('rejects unknown roles', () => {
    expect(setUserRolesInput.safeParse({ uid: 'u1', roles: ['customer', 'boss'] }).success).toBe(false);
  });
});

describe('formatPHP', () => {
  it('uses the peso sign', () => {
    expect(formatPHP(65)).toBe('₱65');
    expect(formatPHP(1234.5)).toBe('₱1,234.5');
  });
});
