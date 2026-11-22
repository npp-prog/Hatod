import { afterAll, describe, expect, it } from 'vitest';
import { PRIVACY_VERSION, TERMS_VERSION } from '@hatod/shared';
import { adminAuth, adminDb, callable, signInAsPhoneUser } from './helpers';

const profile = (name: string) => ({
  name,
  acceptTerms: true,
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
  locale: 'fil',
});

type ProfileOut = { roles: string[]; created: boolean };

describe('completeProfile', () => {
  it('creates a customer with consent and sets claims', async () => {
    const { app, user, uid } = await signInAsPhoneUser('+639171110001');
    const res = await callable<unknown, ProfileOut>(app, 'completeProfile')(profile('Juan Dela Cruz'));
    expect(res.data).toEqual({ roles: ['customer'], created: true });

    const doc = (await adminDb.doc(`users/${uid}`).get()).data()!;
    expect(doc.name).toBe('Juan Dela Cruz');
    expect(doc.phone).toBe('+639171110001');
    expect(doc.status).toBe('active');
    expect(doc.locale).toBe('fil');
    expect(doc.consent.termsVersion).toBe(TERMS_VERSION);

    const token = await user.getIdTokenResult(true);
    expect(token.claims.roles).toEqual(['customer']);
  });

  it('is idempotent and keeps existing roles', async () => {
    const { app, uid } = await signInAsPhoneUser('+639171110002');
    const call = callable<unknown, ProfileOut>(app, 'completeProfile');
    await call(profile('Ana Reyes'));
    await adminDb.doc(`users/${uid}`).update({ roles: ['customer', 'shop'] });
    const again = await call(profile('Ana R. Reyes'));
    expect(again.data).toEqual({ roles: ['customer', 'shop'], created: false });
    expect((await adminDb.doc(`users/${uid}`).get()).get('name')).toBe('Ana R. Reyes');
  });

  it('refuses without consent', async () => {
    const { app } = await signInAsPhoneUser('+639171110003');
    await expect(
      callable(app, 'completeProfile')({ ...profile('No Consent'), acceptTerms: false }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('gives the bootstrap admin phone the admin role', async () => {
    const { app } = await signInAsPhoneUser('+639170000001');
    const res = await callable<unknown, ProfileOut>(app, 'completeProfile')(profile('First Admin'));
    expect(res.data.roles).toEqual(['customer', 'admin']);
  });
});

describe('setUserRoles', () => {
  it('lets an admin grant roles and logs it', async () => {
    const admin = await signInAsPhoneUser('+639171110010');
    await adminDb.doc(`users/${admin.uid}`).set({ roles: ['customer', 'admin'] });
    await adminAuth.setCustomUserClaims(admin.uid, { roles: ['customer', 'admin'] });
    await admin.user.getIdToken(true);

    const target = await signInAsPhoneUser('+639171110011');
    await callable(target.app, 'completeProfile')(profile('Coordinator Lito'));

    const res = await callable<unknown, { roles: string[] }>(admin.app, 'setUserRoles')({
      uid: target.uid,
      roles: ['coordinator', 'customer'],
      coordTowns: ['town-demo'],
    });
    expect(res.data.roles).toEqual(['customer', 'coordinator']);

    const claims = (await target.user.getIdTokenResult(true)).claims;
    expect(claims.roles).toEqual(['customer', 'coordinator']);
    expect(claims.coordTowns).toEqual(['town-demo']);

    const log = await adminDb.collection('adminLog').where('targetId', '==', target.uid).get();
    expect(log.size).toBe(1);
  });

  it('refuses non-admins', async () => {
    const someone = await signInAsPhoneUser('+639171110012');
    await callable(someone.app, 'completeProfile')(profile('Not Admin'));
    await someone.user.getIdToken(true);
    await expect(
      callable(someone.app, 'setUserRoles')({ uid: someone.uid, roles: ['customer', 'admin'] }),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });

  it('stops an admin from removing their own admin role', async () => {
    const admin = await signInAsPhoneUser('+639171110013');
    await adminDb.doc(`users/${admin.uid}`).set({ roles: ['customer', 'admin'] });
    await adminAuth.setCustomUserClaims(admin.uid, { roles: ['customer', 'admin'] });
    await admin.user.getIdToken(true);
    await expect(
      callable(admin.app, 'setUserRoles')({ uid: admin.uid, roles: ['customer'] }),
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
});

afterAll(async () => {
  // Leave emulator data for inspection; nothing to clean.
});
